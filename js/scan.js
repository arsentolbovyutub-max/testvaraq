/* Skaner ekrani: jonli kamera (avto-aniqlash), rasm yuklash, tekshirish va saqlash. */
const Scan = {
  stream: null, timer: null, busy: false, paused: false,

  stop() {
    clearInterval(this.timer); this.timer = null;
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
  },

  view(testId) {
    const tests = DB.myTests().slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const body = `<div class="card">
        <label class="f" style="margin:0"><span>Test</span><select class="in" id="tsel"><option value="">QR koddan avtomatik aniqlash</option>${tests.map(t => `<option value="${t.id}" ${t.id === testId ? 'selected' : ''}>${esc(t.name)} · ${TYPE_NAME[t.type]}</option>`).join('')}</select></label>
      </div>
      <div id="camwrap">
        <div class="cam" id="cam" style="display:none"><video id="vid" playsinline muted autoplay></video><div class="guide"></div><div class="st" id="st">Kamerani yoqing yoki rasm yuklang</div></div>
        <div class="btns">
          <button class="btn pri sp" id="camb">📷 Kamerani yoqish</button>
          <label class="btn sp">🖼 Rasm yuklash<input type="file" id="file" accept="image/*" hidden></label>
        </div>
        <p class="small muted">Varaqni tekis joyga qo'ying, yorug' bo'lsin. 4 ta qora burchak va QR kod kadrga to'liq tushsin — skaner o'zi suratga oladi.</p>
      </div>
      <div id="out"></div>`;
    layout('Skaner', body, { tab: 'scan', back: testId ? `#/test/${testId}/natija` : null });
    $('#camb').onclick = () => this.stream ? this.stop() || this.camUI() : this.startCam();
    $('#file').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      e.target.value = '';
      try { const c = await loadImageFile(f); this.process(c, true); }
      catch (err) { toast("Rasmni ochib bo'lmadi", 'err'); }
    };
    if (testId || tests.length) this.camUI();
  },

  camUI() {
    const b = $('#camb'); if (!b) return;
    const cam = $('#cam'); if (cam && !this.stream) cam.style.display = 'none';
    b.textContent = this.stream ? '■ Kamerani o‘chirish' : '📷 Kamerani yoqish';
  },

  async startCam() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast("Kamera mavjud emas. Rasm yuklang.", 'err'); return; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    } catch (e) { toast("Kameraga ruxsat berilmadi", 'err'); return; }
    $('#cam').style.display = ''; const v = $('#vid'); v.srcObject = this.stream; await v.play().catch(() => {});
    this.camUI(); this.paused = false;
    $('#st').textContent = 'Varaqni qidiryapman…';
    this.timer = setInterval(() => this.tick(), 450);
  },

  tick() {
    const v = $('#vid');
    if (!v || this.busy || this.paused || !v.videoWidth) return;
    this.busy = true;
    try {
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      const st = OMR.detect(c, { maxDim: 900 });
      const st2 = $('#st');
      if (!st.ok) { if (st2) st2.textContent = st.markers ? 'Varaq topildi…' : 'Burchaklar ko‘rinmayapti — varaqni to‘liq kadrga oling'; }
      else if (!st.qr && !$('#tsel').value) { if (st2) st2.textContent = 'QR o‘qilmadi — yaqinroq oling yoki testni tanlang'; }
      else { this.paused = true; if (st2) st2.textContent = 'Tanildi ✓'; if (navigator.vibrate) navigator.vibrate(60); this.process(c, false); }
    } catch (e) { console.error(e); }
    this.busy = false;
  },

  process(canvas) {
    const out = $('#out'); if (!out) return;
    const st = OMR.detect(canvas, { maxDim: 1600 });
    if (!st.ok) {
      out.innerHTML = `<div class="card"><h3 class="bad">Varaq tanilmadi</h3><p class="small">${esc(st.error)}</p><img class="preview" src="${st.canvas.toDataURL('image/jpeg', .7)}"></div>`;
      this.paused = false; return;
    }
    const info = st.qr ? Sheet.parse(st.qr.data) : null;
    let test = info ? DB.test(info.testId) : null;
    if (info && !test) { out.innerHTML = `<div class="card"><h3 class="bad">Test topilmadi</h3><p class="small">Bu varaq ushbu qurilmada mavjud bo'lmagan testga tegishli. Bulut sinxronlashni yoqing yoki zaxira nusxani import qiling.</p></div>`; this.paused = false; return; }
    if (!test) test = DB.test($('#tsel').value);
    if (!test) { out.innerHTML = `<div class="card"><h3 class="bad">QR kod o'qilmadi</h3><p class="small">Yuqoridan testni tanlang va qayta urinib ko'ring.</p></div>`; this.paused = false; return; }
    const rd = OMR.read(st, test);
    this.review({ st, test, studentId: info && info.studentId && DB.student(info.studentId) ? info.studentId : '', variant: info && info.variant ? info.variant : test.variants[0].code, answers: rd.answers, flags: rd.flags });
  },

  review(s) {
    const t = s.test;
    const out = $('#out');
    const pool = DB.studentsOfGroups(t.groupIds);
    const all = pool.length ? pool : DB.myStudents();
    const existing = () => s.studentId ? DB.data.results.find(r => r.testId === t.id && r.studentId === s.studentId) : null;
    const draw = () => {
      const fake = { id: '_', testId: t.id, studentId: s.studentId, variant: s.variant, answers: s.answers };
      const ev = Scoring.evaluate(t, fake);
      const key = Core.normKey(t, Scoring.variantOf(t, s.variant).key);
      const ov = OMR.overlay(s.st, t, s.answers, key, s.flags);
      const multi = s.flags.map((f, i) => f === 'multi' ? i + 1 : 0).filter(Boolean);
      const faint = s.flags.map((f, i) => f === 'faint' ? i + 1 : 0).filter(Boolean);
      out.innerHTML = `<div class="card">
          <div class="row"><b>${esc(t.name)}</b><span class="sp"></span><span class="badge ${t.type}">${TYPE_NAME[t.type]}</span></div>
          <div class="grid2" style="margin-top:10px">
            <label class="f"><span>O'quvchi</span><select class="in" id="rs"><option value="">— tanlang —</option>${all.map(x => `<option value="${x.id}" ${x.id === s.studentId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
            <label class="f"><span>Variant</span><select class="in" id="rv">${t.variants.map(v => `<option ${v.code === s.variant ? 'selected' : ''}>${v.code}</option>`).join('')}</select></label>
          </div>
          <div class="row wrap"><div><div class="score">${t.type === 'rasch' ? ev.correct + '/' + ev.total : ev.points}${t.type !== 'rasch' ? `<span class="muted" style="font-size:16px"> / ${ev.max}</span>` : ''}</div><div class="small muted">${t.type === 'rasch' ? "to'g'ri (Rasch ball saqlangandan keyin hisoblanadi)" : 'ball · ' + ev.percent + '%'}</div></div>
            <span class="sp"></span><div class="small"><div class="ok">✓ ${ev.correct}</div><div class="bad">✗ ${ev.wrong}</div><div class="muted">○ ${ev.blank}</div></div></div>
          ${multi.length ? `<p class="small warnbox">⚠ Bir nechta belgi: ${multi.join(', ')}-savollar — to'g'risini tanlang yoki shunday qoldiring (noto'g'ri hisoblanadi).</p>` : ''}
          ${faint.length ? `<p class="small warnbox">⚠ Xira belgi: ${faint.join(', ')}-savollar — rasm bilan solishtirib tasdiqlang.</p>` : ''}
          ${existing() ? `<p class="small" style="color:var(--acc)">Bu o'quvchining natijasi bor — saqlansa yangilanadi.</p>` : ''}
          <div class="btns"><button class="btn pri sp" id="save">✓ Saqlash</button><button class="btn sp" id="again">↻ Qayta</button></div>
        </div>
        <div class="card"><h3>Tanilgan varaq</h3><img class="preview" src="${ov.toDataURL('image/jpeg', .8)}" alt=""></div>
        <div class="card"><h3>Javoblar</h3><p class="small muted" style="margin-top:0">Xato tanilgan bo'lsa, to'g'risini bosing. Sariq — tekshirish kerak.</p><div class="keys" id="ra"></div></div>`;
      renderKeyGrid($('#ra'), t, s.answers, (q, o) => { const a = s.answers.split(''); a[q] = a[q] === o ? '-' : o; s.answers = a.join(''); s.flags[q] = null; setTimeout(draw, 0); return s.answers; }, key, s.flags);
      $('#rs').onchange = e => { s.studentId = e.target.value; draw(); };
      $('#rv').onchange = e => { s.variant = e.target.value; draw(); };
      $('#again').onclick = () => this.resume();
      $('#save').onclick = () => {
        if (!s.studentId) { toast("O'quvchini tanlang", 'err'); return; }
        const r = saveResult(t, s.studentId, s.variant, s.answers, 'scan');
        const nm = DB.student(s.studentId).name;
        toast(`${nm}: saqlandi`);
        if (t.type !== 'rasch' && DB.data.settings.autoNotify !== false) TBot.notifyResults(t, [r], true);
        if (!$('#tsel').value) $('#tsel').value = t.id;
        this.resume();
      };
      $('#camwrap').style.display = 'none';
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    draw();
  },

  resume() {
    $('#out').innerHTML = '';
    const cw = $('#camwrap'); if (cw) cw.style.display = '';
    const st = $('#st'); if (st && this.stream) st.textContent = 'Keyingi varaqni ko‘rsating…';
    setTimeout(() => { this.paused = false; }, this.stream ? 1500 : 0);
    window.scrollTo(0, 0);
  }
};
