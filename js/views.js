/* Ekranlar. Har bir ko'rinish #app ichiga chiziladi va o'z hodisalarini bog'laydi. */
const TYPE_NAME = { block: 'Blok test (DTM)', simple: 'Oddiy test', rasch: 'Rasch test' };

function layout(title, body, o = {}) {
  const tabs = [['home', '⌂', 'Asosiy'], ['tests', '✎', 'Testlar'], ['scan', '⌖', 'Skaner'], ['students', '☺', "O'quvchilar"], ['more', '☰', 'Yana']];
  const nav = o.noNav ? '' : `<nav class="nav">${tabs.map(([k, i, l]) =>
    `<a href="#/${k}" class="${k === 'scan' ? 'scan ' : ''}${o.tab === k ? 'on' : ''}"><span class="i">${i}</span>${l}</a>`).join('')}</nav>`;
  $('#app').innerHTML = `<header class="top">${o.back ? `<button class="ib" id="back" aria-label="Orqaga">←</button>` : ''}<h1>${esc(title)}</h1>${o.actions || ''}${typeof Cloud !== 'undefined' ? Cloud.badge() : ''}</header><main>${body}</main>${nav}`;
  if (o.back) $('#back').onclick = () => { location.hash = o.back; };
  window.scrollTo(0, 0);
}

function emptyBox(icon, text, btn) {
  return `<div class="empty"><div class="i">${icon}</div><p>${text}</p>${btn || ''}</div>`;
}

/* Tez kiritish: "ABCD TF…" satrini bo'limlar turiga qarab javoblar/kalitga aylantirish (prefiks). */
function quickToString(t, s, base) {
  const info = Core.qInfo(t);
  const arr = (base || '-'.repeat(info.length)).split('');
  const chars = String(s || '').toUpperCase().replace(/TRUE/g, 'T').replace(/FALSE/g, 'F').replace(/[^A-FT\-+]/g, '').split('');
  let j = 0, used = 0;
  for (let q = 0; q < info.length && j < chars.length; q++) {
    if (info[q].kind === 'open') continue;
    const ch = chars[j++];
    if (ch === '-') { arr[q] = '-'; used++; continue; }
    if (info[q].kind === 'tf') { arr[q] = ch === 'T' || ch === 'A' || ch === '+' ? 'A' : ch === 'F' || ch === 'B' ? 'B' : arr[q]; used++; continue; }
    if (Core.LETTERS.indexOf(ch) >= 0 && Core.LETTERS.indexOf(ch) < Core.opts(info[q].sec)) { arr[q] = ch; used++; }
  }
  return { value: arr.join(''), used };
}

const V = {
  /* ---------- kirish ---------- */
  register() {
    $('#app').innerHTML = `<div class="auth">
      <div class="logo"><img src="icon.svg" alt=""><b>TestVaraq</b></div>
      <h2>O'quv markaz hisobini ochish</h2>
      <p class="muted small">1 daqiqa: markaz nomi, ismingiz, telefon va parol.</p>
      <form id="f">
        <label class="f"><span>O'quv markaz nomi</span><input class="in" name="center" required placeholder="Masalan: Ilm ziyo"></label>
        <label class="f"><span>Ismingiz (administrator)</span><input class="in" name="name" required></label>
        <label class="f"><span>Telefon</span><input class="in" name="phone" type="tel" required placeholder="+998 90 123 45 67"></label>
        <label class="f"><span>Parol</span><input class="in" name="pass" type="password" minlength="4" required></label>
        <button class="btn pri block">Hisob ochish</button>
      </form>
      <p class="small" style="margin-top:16px"><a href="#/login">Hisobim bor — kirish</a></p>
    </div>`;
    $('#f').onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (DB.data.center) { toast('Bu qurilmada markaz allaqachon bor', 'err'); return; }
      const u = { id: DB.id(), name: f.name.trim(), phone: normPhone(f.phone), role: 'admin', pass: await hashPass(f.pass) };
      DB.data.center = { name: f.center.trim(), phone: u.phone, createdAt: new Date().toISOString() };
      DB.data.users.push(u);
      DB.data.session = { userId: u.id };
      DB.save({ silent: true });
      toast('Xush kelibsiz!');
      Cloud.registerSilently();
      location.hash = '#/home';
    };
  },

  login() {
    $('#app').innerHTML = `<div class="auth">
      <div class="logo"><img src="icon.svg" alt=""><b>TestVaraq</b></div>
      <h2>${esc(DB.data.center ? DB.data.center.name : 'Kirish')}</h2>
      <form id="f">
        <label class="f"><span>Telefon</span><input class="in" name="phone" type="tel" required></label>
        <label class="f"><span>Parol</span><input class="in" name="pass" type="password" required></label>
        <button class="btn pri block" id="lb">Kirish</button>
      </form>
      <p class="muted small" style="margin-top:16px">Boshqa telefonda ochilgan hisobga ham shu yerdan kirasiz — ma'lumotlar bulutdan yuklanadi. O'qituvchilar hisobini markaz administratori ochib beradi.</p>
      ${DB.data.center ? '' : `<p class="small"><a href="#/register">Yangi markaz ochish</a></p>`}
    </div>`;
    $('#f').onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const ph = normPhone(f.phone), hp = await hashPass(f.pass);
      const u = DB.data.users.find(x => x.phone === ph && x.pass === hp);
      if (u) { DB.data.session = { userId: u.id }; DB.save({ silent: true }); location.hash = '#/home'; return; }
      const b = $('#lb'); b.disabled = true; b.textContent = 'Bulutdan tekshirilmoqda…';
      try {
        await Cloud.login(ph, hp);
        toast('Ma’lumotlar yuklandi');
        location.hash = '#/home';
      } catch (err) {
        toast(err.message || "Telefon yoki parol noto'g'ri", 'err');
        b.disabled = false; b.textContent = 'Kirish';
      }
    };
  },

  /* ---------- bosh sahifa ---------- */
  home() {
    const me = DB.me();
    const tests = DB.myTests().slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const tIds = new Set(tests.map(t => t.id));
    const res = DB.data.results.filter(r => tIds.has(r.testId)).sort((a, b) => (b.scannedAt || '').localeCompare(a.scannedAt || ''));
    const openAppeals = (DB.data.appeals || []).filter(a => !a.reply).length;
    const body = `
      <p class="muted" style="margin:0 0 12px">Salom, <b>${esc(me.name)}</b> · ${esc(DB.data.center.name)}</p>
      ${openAppeals ? `<a class="li warnli" href="#/appeals"><span class="av">✉</span><span class="sp t">${openAppeals} ta javobsiz murojaat</span>›</a>` : ''}
      <div class="grid4" style="margin-bottom:14px">
        <a class="stat" href="#/tests" style="text-decoration:none;color:inherit"><b>${tests.length}</b><span>Testlar</span></a>
        <a class="stat" href="#/students" style="text-decoration:none;color:inherit"><b>${DB.myStudents().length}</b><span>O'quvchilar</span></a>
        <a class="stat" href="#/groups" style="text-decoration:none;color:inherit"><b>${DB.myGroups().length}</b><span>Guruhlar</span></a>
        <div class="stat"><b>${res.length}</b><span>Tekshirilgan varaqlar</span></div>
      </div>
      <div class="grid2" style="margin-bottom:10px">
        <a class="btn pri" href="#/test-new">＋ Yangi test</a>
        <a class="btn" href="#/scan">⌖ Varaq skanerlash</a>
      </div>
      <a class="btn block" href="#/xls" style="margin-bottom:16px">📊 Excel jadvalni hisoblash</a>
      <h3>So'nggi testlar</h3>
      ${tests.length ? tests.slice(0, 5).map(testItem).join('') : emptyBox('✎', "Hali test yo'q. Birinchi testni yarating.", '<a class="btn pri" href="#/test-new">Test yaratish</a>')}
      ${res.length ? `<h3 style="margin-top:18px">So'nggi natijalar</h3>` + res.slice(0, 6).map(resultItem).join('') : ''}
    `;
    layout('TestVaraq', body, { tab: 'home' });
  },

  /* ---------- testlar ---------- */
  tests() {
    const f = V._testFilter || 'all';
    const tests = DB.myTests().filter(t => f === 'all' || t.type === f).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const body = `<div class="tabs">${[['all', 'Barchasi'], ['block', 'Blok'], ['simple', 'Oddiy'], ['rasch', 'Rasch']].map(([k, l]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${tests.length ? tests.map(testItem).join('') : emptyBox('✎', "Testlar yo'q", '<a class="btn pri" href="#/test-new">＋ Test yaratish</a>')}`;
    layout('Testlar', body, { tab: 'tests', actions: `<a class="ib" href="#/test-new" style="text-decoration:none;display:flex;align-items:center;justify-content:center;color:#fff;font-size:26px">＋</a>` });
    $$('[data-f]').forEach(b => b.onclick = () => { V._testFilter = b.dataset.f; V.tests(); });
  },

  testForm(id) {
    const t = id ? DB.test(id) : null;
    if (id && !t) { location.hash = '#/tests'; return; }
    if (!id && !V._ocrKeep) V._ocr = null;
    const cloneSecs = secs => secs.map(s => ({ title: s.title, subject: s.subject, count: s.count, weight: s.weight ?? 1, kind: Core.kind(s), options: s.options || 4 }));
    const st = {
      type: t ? t.type : 'rasch', name: t ? t.name : '', date: t ? t.date : today(),
      main1: t && t.type === 'block' ? t.sections[3].subject : 'Matematika', main2: t && t.type === 'block' ? t.sections[4].subject : 'Fizika',
      secs: t && t.type !== 'block' ? cloneSecs(t.sections) : [{ title: 'Matematika', subject: 'Matematika', count: 30, weight: 1, kind: 'choice', options: 4 }],
      variants: t ? t.variants.length : 1, groupIds: t ? (t.groupIds || []).slice() : [],
      rmode: t && t.rasch && t.rasch.mode === 'bmba' ? 'bmba' : 'weighted', rmax: t && t.rasch && t.rasch.max ? t.rasch.max : 75
    };
    const subjOpts = sel => SUBJECTS.map(s => `<option ${s === sel ? 'selected' : ''}>${esc(s)}</option>`).join('');
    const secRow = (s, i) => `<div class="secrow" data-i="${i}">
        <div class="row"><b class="small">${i + 1}-bo'lim</b><span class="sp"></span>
          ${i > 0 ? `<button type="button" class="btn sm" data-up="${i}" title="Yuqoriga">↑</button>` : ''}
          ${st.secs.length > 1 ? `<button type="button" class="btn sm danger" data-rm="${i}">✕</button>` : ''}</div>
        <div class="grid2">
          <label class="f"><span>Nomi (mavzu / fan)</span><input class="in" data-k="title" value="${esc(s.title)}" required></label>
          <label class="f"><span>Fan</span><select class="in" data-k="subject">${subjOpts(s.subject)}</select></label>
        </div>
        <div class="grid4">
          <label class="f"><span>Savollar</span><input class="in" data-k="count" type="number" min="1" max="120" value="${s.count}"></label>
          <label class="f"><span>Turi</span><select class="in" data-k="kind">${Object.entries(Core.KIND_NAME).map(([k, l]) => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="f"><span>Variantlar</span><select class="in" data-k="options" ${s.kind !== 'choice' ? 'disabled' : ''}>${[2, 3, 4, 5, 6].map(k => `<option value="${k}" ${s.kind === 'choice' && +s.options === k ? 'selected' : ''}>${s.kind === 'tf' ? 'T/F' : s.kind === 'open' ? '—' : 'A–' + Core.LETTERS[k - 1]}</option>`).join('')}</select></label>
          ${st.type === 'rasch' ? `<label class="f"><span>Ball</span><input class="in" value="Rasch" disabled></label>` : `<label class="f"><span>Ball (har savol)</span><input class="in" data-k="weight" type="number" min="0" step="0.1" value="${s.weight}"></label>`}
        </div>
      </div>`;
    const draw = () => {
      const groups = DB.myGroups();
      const total = st.secs.reduce((a, s) => a + (+s.count || 0), 0);
      const body = `${t ? '' : `<div class="card"><h3>📄 Savol varag'idan avtomatik</h3>
          <p class="small muted" style="margin-top:0">Savol varag'ini (bir yoki bir nechta sahifa) suratga oling: savollar soni, har savol variantlari (A–F, True/False, yozma) aniqlanadi. Varaqda "Javoblar: 1-A 2-C …" ro'yxati yoki to'g'ri variant yonida * belgisi bo'lsa — kalit ham avtomatik kiritiladi.</p>
          <label class="btn block">📷 Savol varag'ini tanlash / suratga olish<input type="file" id="qp" accept="image/*" multiple hidden></label>
          <div id="qpout" class="small" style="margin-top:8px"></div></div>`}
        <form id="f">
        <div class="card"><h3>Test turi</h3>
          <div class="tabs">${['rasch', 'simple', 'block'].map(k => `<button type="button" data-t="${k}" class="${st.type === k ? 'on' : ''}" ${t ? 'disabled' : ''}>${TYPE_NAME[k]}</button>`).join('')}</div>
          <p class="small muted" style="margin:0">${{
            block: "DTM formati: 3 ta majburiy fan (10 tadan, 1.1 ball) + 2 ta asosiy fan (30 tadan, 3.1 va 2.1 ball). 90 savol, 189 ball. Milliy sertifikat avtomatik hisobga olinadi.",
            simple: "Bir yoki bir nechta bo'lim (mavzu): har biriga alohida savol soni, variantlar soni (A–B … A–F), True/False yoki yozma javob va ball.",
            rasch: "Rasch modeli: savol ballini o'quvchilarning javoblari belgilaydi — kam topilgan (qiyin) savolga ko'p ball, ko'p topilgan (oson) savolga kam ball. Natija 75 ballik (yoki o'zingiz belgilagan) shkalada, A+ … C darajalar bilan."
          }[st.type]}</p>
        </div>
        <div class="card">
          <label class="f"><span>Test nomi</span><input class="in" name="name" required value="${esc(st.name)}" placeholder="Masalan: 1-blok test, oktabr"></label>
          <label class="f"><span>Sana</span><input class="in" name="date" type="date" value="${esc(st.date)}"></label>
          ${st.type === 'block' ? `
            <div class="grid2">
              <label class="f"><span>1-asosiy fan (3.1 ball)</span><select class="in" name="main1">${subjOpts(st.main1)}</select></label>
              <label class="f"><span>2-asosiy fan (2.1 ball)</span><select class="in" name="main2">${subjOpts(st.main2)}</select></label>
            </div>` : ''}
          ${st.type === 'rasch' ? `<div class="grid2">
            <label class="f"><span>Rasch hisoblash usuli</span><select class="in" name="rmode"><option value="weighted" ${st.rmode === 'weighted' ? 'selected' : ''}>Savol qiyinligi bo'yicha ball</option><option value="bmba" ${st.rmode === 'bmba' ? 'selected' : ''}>Milliy sertifikat (BMBA T-ball)</option></select></label>
            <label class="f"><span>Maksimal ball</span><input class="in" name="rmax" type="number" min="10" max="1000" value="${st.rmax}"></label></div>
            <p class="small muted" style="margin-top:-6px">${st.rmode === 'bmba' ? "BMBA: θ → Z = (θ − o'rtacha)/standart og'ish → T = 50 + 10·Z (0…maksimal). O'rtacha natija 50 ball." : "Har savol balli Rasch qiyinligiga mutanosib; barcha savollar yig'indisi = maksimal ball. Hammasini topgan o'quvchi maksimal ball oladi."}</p>` : ''}
          <label class="f"><span>Variantlar soni (A, B, C…)</span><select class="in" name="variants">${[1, 2, 3, 4, 5, 6, 7, 8].map(k => `<option ${k === st.variants ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        </div>
        ${st.type !== 'block' ? `<div class="card"><div class="row"><h3 style="margin:0">Bo'limlar (mavzular)</h3><span class="sp"></span><span class="muted small">${total} savol</span></div>
          <p class="small muted">Masalan: 1-mavzu 30 ta savol 4 variantli, 2-mavzu 6 ta savol 6 variantli, 3-mavzu 10 ta True/False.</p>
          <div id="secs">${st.secs.map(secRow).join('')}</div>
          <button type="button" class="btn block" id="addsec">＋ Bo'lim qo'shish</button>
          <p class="small" id="fit"></p></div>` : ''}
        <div class="card"><h3>Guruhlar</h3>
          ${groups.length ? groups.map(g => `<label class="chk"><input type="checkbox" name="g" value="${g.id}" ${st.groupIds.includes(g.id) ? 'checked' : ''}> ${esc(g.name)} <span class="muted small">· ${DB.studentsOfGroups([g.id]).length} o'quvchi</span></label>`).join('') : `<p class="muted small">Guruh yo'q. <a href="#/groups">Guruh qo'shing</a> — keyin o'quvchilar uchun varaqlar chiqarasiz.</p>`}
        </div>
        <button class="btn pri block">${t ? 'Saqlash' : 'Yaratish va kalitni kiritish'}</button>
      </form>`;
      layout(t ? 'Testni tahrirlash' : 'Yangi test', body, { back: t ? `#/test/${t.id}` : '#/tests', tab: 'tests' });
      if ($('#qp')) {
        const applyParsed = (P, text) => {
          if (st.type === 'block') st.type = 'rasch';
          const subj = st.secs[0] ? st.secs[0].subject : 'Matematika';
          st.secs = P.sections.map(x => ({ title: x.title, subject: subj, count: x.count, weight: 1, kind: x.kind, options: x.options }));
          V._ocr = { key: P.key, text, info: `${P.questions.length} ta savol · ${P.sections.length} bo'lim · kalit: ${P.keyFound} ta` };
          draw();
          toast(`Savol varag'i o'qildi: ${P.questions.length} ta savol`);
        };
        const showOcr = () => {
          if (!V._ocr) return;
          $('#qpout').innerHTML = `<div class="ok">✓ ${esc(V._ocr.info)}</div><p class="muted" style="margin:6px 0">Noto'g'ri o'qilgan joyni matnda tuzatib, "Qayta tahlil" ni bosing.</p>
            <textarea class="in" id="qptext" rows="8">${esc(V._ocr.text)}</textarea><div class="btns"><button type="button" class="btn sm" id="qpre">Qayta tahlil</button><button type="button" class="btn sm danger" id="qpclr">Bekor qilish</button></div>`;
          $('#qpre').onclick = () => applyParsed(QPaper.parse($('#qptext').value), $('#qptext').value);
          $('#qpclr').onclick = () => { V._ocr = null; draw(); };
        };
        showOcr();
        $('#qp').onchange = async e => {
          const files = [...e.target.files]; if (!files.length) return;
          const out = $('#qpout');
          out.textContent = 'OCR yuklanmoqda… (birinchi marta ~10 MB, keyin tez)';
          try {
            const text = await QPaper.recognize(files, (p, i, n) => { if (i) out.textContent = `${i}/${n}-sahifa o'qilmoqda…`; else out.textContent = `O'qilmoqda… ${Math.round(p * 100)}%`; });
            const P = QPaper.parse(text);
            if (!P.questions.length) { out.innerHTML = `<span class="bad">Savollar topilmadi. Rasm aniq va to'g'ri burchakda bo'lsin (savollar "1." yoki "1)" bilan boshlansin).</span>`; return; }
            applyParsed(P, text);
          } catch (err) { out.innerHTML = `<span class="bad">${esc(err.message)}</span>`; }
        };
      }
      const form = $('#f');
      const fitCheck = () => {
        const el = $('#fit'); if (!el) return;
        const L = Sheet.layout({ sections: st.secs });
        el.innerHTML = L.fits ? `<span class="muted">Qog'oz varaqqa sig'adi: ${L.cols} ustun × ${L.rows} qator${L.openQ.length ? `, ${L.openQ.length} ta yozma javob maydoni` : ''}.</span>`
          : `<span class="bad">⚠ Bitta varaqqa sig'maydi (ko'pi bilan ~120 ta variantli savol yoki 12 ta yozma savol). Online (bot) yoki qo'lda kiritish uchun ishlaydi.</span>`;
      };
      const grab = () => {
        const fd = new FormData(form);
        st.name = fd.get('name'); st.date = fd.get('date');
        if (fd.get('main1')) { st.main1 = fd.get('main1'); st.main2 = fd.get('main2'); }
        st.variants = parseInt(fd.get('variants')) || 1;
        if (fd.get('rmode')) { st.rmode = fd.get('rmode'); st.rmax = Math.max(10, Math.min(1000, parseFloat(fd.get('rmax')) || 75)); }
        st.groupIds = fd.getAll('g');
        $$('.secrow').forEach(row => {
          const s = st.secs[+row.dataset.i];
          $$('[data-k]', row).forEach(inp => {
            const k = inp.dataset.k;
            if (k === 'count') s.count = Math.max(1, Math.min(120, parseInt(inp.value) || 1));
            else if (k === 'weight') s.weight = Math.max(0, parseFloat(inp.value) || 0);
            else if (k === 'options') { if (!inp.disabled) s.options = +inp.value; }
            else s[k] = inp.value;
          });
        });
      };
      $$('[data-t]').forEach(b => b.onclick = () => { grab(); st.type = b.dataset.t; draw(); });
      if ($('#secs')) {
        $('#secs').onchange = e => { grab(); if (e.target.dataset.k === 'kind' || e.target.dataset.k === 'subject') { const row = st.secs[+e.target.closest('.secrow').dataset.i]; if (e.target.dataset.k === 'subject' && (!row.title || SUBJECTS.includes(row.title))) row.title = row.subject; draw(); } else fitCheck(); };
        $('#secs').oninput = () => { grab(); fitCheck(); };
        $('#secs').onclick = e => {
          const rm = e.target.closest('[data-rm]'), up = e.target.closest('[data-up]');
          if (rm) { grab(); st.secs.splice(+rm.dataset.rm, 1); draw(); }
          if (up) { grab(); const i = +up.dataset.up; [st.secs[i - 1], st.secs[i]] = [st.secs[i], st.secs[i - 1]]; draw(); }
        };
        $('#addsec').onclick = () => { grab(); st.secs.push({ title: `Mavzu ${st.secs.length + 1}`, subject: st.secs[st.secs.length - 1]?.subject || 'Matematika', count: 10, weight: 1, kind: 'choice', options: 4 }); draw(); };
        fitCheck();
      }
      form.onsubmit = e => {
        e.preventDefault(); grab();
        if (st.type === 'block' && st.main1 === st.main2) { toast('Asosiy fanlar har xil bo‘lsin', 'err'); return; }
        const sections = st.type === 'block' ? Core.blockSections(st.main1, st.main2)
          : st.secs.map(s => ({ title: (s.title || s.subject).trim(), subject: s.subject, count: s.count, weight: s.weight, kind: s.kind, options: s.kind === 'choice' ? s.options : 2 }));
        const n = sections.reduce((a, s) => a + s.count, 0);
        if (n > 300) { toast("Ko'pi bilan 300 ta savol", 'err'); return; }
        const codes = 'ABCDEFGH'.split('').slice(0, st.variants);
        const old = t ? t.variants : [];
        const tmp = { sections };
        const variants = codes.map(code => {
          const o = old.find(v => v.code === code);
          return { code, key: Core.normKey(tmp, ((o ? o.key : '') + '-'.repeat(n)).slice(0, n)) };
        });
        if (!t && V._ocr && variants[0]) { variants[0].key = Core.normKey(tmp, (V._ocr.key + '-'.repeat(n)).slice(0, n)); V._ocr = null; }
        const obj = t || { id: DB.id(), createdAt: new Date().toISOString(), createdBy: DB.me().id };
        Object.assign(obj, { type: st.type, name: st.name.trim(), date: st.date, sections, variants, groupIds: st.groupIds });
        if (st.type === 'rasch') obj.rasch = { mode: st.rmode, max: st.rmax }; else delete obj.rasch;
        if (!t) DB.data.tests.push(obj);
        DB.save();
        toast('Saqlandi');
        location.hash = `#/test/${obj.id}/kalit`;
      };
    };
    draw();
  },

  testDetail(id, tab) {
    const t = DB.test(id);
    if (!t) { location.hash = '#/tests'; return; }
    tab = tab || 'natija';
    const n = Scoring.qCount(t);
    const rc = DB.resultsOfTest(t.id).length;
    const keyDone = t.variants.every(v => Core.keyComplete(t, v.key));
    const kinds = t.sections.length > 1 ? ' · ' + t.sections.map(s => `${s.count}${Core.kind(s) === 'tf' ? ' T/F' : Core.kind(s) === 'open' ? ' yozma' : Core.opts(s) !== 4 ? ' (' + Core.opts(s) + 'v)' : ''}`).join(' + ') : '';
    const head = `<div class="card">
      <div class="row"><span class="badge ${t.type}">${TYPE_NAME[t.type]}</span><span class="muted small">${fmtDate(t.date)} · ${n} savol${kinds}${t.type !== 'rasch' ? ' · ' + Scoring.maxPoints(t) + ' ball' : ''} · ${t.variants.length} variant</span></div>
      <div class="muted small" style="margin-top:6px">${(t.groupIds || []).map(g => DB.group(g)).filter(Boolean).map(g => esc(g.name)).join(', ') || 'Guruh biriktirilmagan'}</div>
      ${keyDone ? '' : `<p class="small" style="margin:8px 0 0;color:var(--acc)">⚠ Javob kaliti to'liq kiritilmagan</p>`}
      <div class="btns"><a class="btn pri sm" href="#/scan/${t.id}">⌖ Skanerlash</a><a class="btn sm" href="#/test-edit/${t.id}">Tahrirlash</a><button class="btn sm danger" id="del">O'chirish</button></div>
    </div>
    <div class="tabs">${[['natija', `Natijalar (${rc})`], ['kalit', 'Javob kaliti'], ['varaq', 'Javob varaqalari'], ['tahlil', 'Tahlil']].map(([k, l]) => `<a href="#/test/${t.id}/${k}"><button class="${tab === k ? 'on' : ''}">${l}</button></a>`).join('')}</div>
    <div id="tabc"></div>`;
    layout(t.name, head, { back: '#/tests', tab: 'tests' });
    $('#del').onclick = async () => {
      if (await confirmBox(`"${t.name}" testi va uning ${rc} ta natijasi o'chiriladi.`)) { DB.removeTest(t.id); DB.save(); location.hash = '#/tests'; }
    };
    const c = $('#tabc');
    ({ natija: V.tabResults, kalit: V.tabKey, varaq: V.tabSheets, tahlil: V.tabAnalysis })[tab](t, c);
  },

  tabKey(t, c) {
    let vi = V._kv && V._kv.t === t.id ? V._kv.i : 0;
    if (vi >= t.variants.length) vi = 0;
    const draw = () => {
      const v = t.variants[vi];
      v.key = Core.normKey(t, v.key);
      const info = Core.qInfo(t);
      const closedN = info.filter(x => x.kind !== 'open').length;
      const filled = v.key.split('').filter((x, i) => x !== '-' && info[i].kind !== 'open').length;
      const hasTF = info.some(x => x.kind === 'tf');
      c.innerHTML = `<div class="card">
        ${t.variants.length > 1 ? `<div class="tabs">${t.variants.map((x, i) => `<button data-v="${i}" class="${i === vi ? 'on' : ''}">Variant ${x.code}</button>`).join('')}</div>` : ''}
        <div class="row"><b>Variant ${v.code}</b><span class="sp"></span><span class="muted small">${filled} / ${closedN}</span></div>
        <label class="f" style="margin-top:10px"><span>Tez kiritish (masalan: ABCDA BCD…${hasTF ? ', True/False uchun T yoki F' : ''}; bo'shliqlar e'tiborga olinmaydi${info.some(x => x.kind === 'open') ? '; yozma savollar o\'tkazib yuboriladi' : ''})</span>
          <div class="row"><input class="in" id="quick" placeholder="ABCD…" autocapitalize="characters"><button class="btn" id="qapply">Qo'llash</button></div></label>
        <div class="keys" id="keys"></div>
        <div class="btns"><label class="btn">📷 Kalitni titul varaqdan<input type="file" id="kscan" accept="image/*" hidden></label><label class="btn">📄 Savol varag'idan (OCR)<input type="file" id="kocr" accept="image/*" multiple hidden></label></div>
        <div id="kst" class="small muted"></div>
        <div class="btns"><button class="btn pri" id="kpdf">Kalit PDF</button>${t.variants.length > 1 ? `<button class="btn" id="kcopy">Boshqa variantlarga nusxalash</button>` : ''}<button class="btn danger" id="kclr">Tozalash</button></div>
      </div>`;
      renderKeyGrid($('#keys', c), t, v.key, (q, opt) => {
        const arr = v.key.split(''); arr[q] = arr[q] === opt ? '-' : opt; v.key = arr.join(''); DB.save();
        return v.key;
      });
      $$('[data-v]', c).forEach(b => b.onclick = () => { vi = +b.dataset.v; V._kv = { t: t.id, i: vi }; draw(); });
      $('#qapply', c).onclick = () => {
        const r = quickToString(t, $('#quick', c).value, v.key);
        if (!r.used) return;
        v.key = Core.normKey(t, r.value);
        DB.save(); toast(`${r.used} ta javob kiritildi`); draw();
      };
      $('#kclr', c).onclick = async () => { if (await confirmBox(`Variant ${v.code} kaliti tozalansinmi?`, 'Tozalash')) { v.key = Core.defaultKey(t); DB.save(); draw(); } };
      if ($('#kcopy', c)) $('#kcopy', c).onclick = async () => {
        if (await confirmBox(`Variant ${v.code} kaliti boshqa barcha variantlarga yoziladi.`, 'Nusxalash')) { t.variants.forEach(x => x.key = v.key); DB.save(); toast('Nusxalandi'); }
      };
      $('#kpdf', c).onclick = async () => shareOrDownload(await PDF.key(t), `kalit_${PDF.fname(t.name)}.pdf`);
      $('#kscan', c).onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        $('#kst', c).textContent = 'Varaq o‘qilmoqda…';
        try {
          const sres = OMR.detect(await loadImageFile(f), { maxDim: 1600 });
          if (!sres.ok) { $('#kst', c).innerHTML = `<span class="bad">${esc(sres.error)}</span>`; return; }
          const info = sres.qr ? Sheet.parse(sres.qr.data) : null;
          if (info && info.testId !== t.id) { $('#kst', c).innerHTML = '<span class="bad">Bu varaq boshqa testga tegishli.</span>'; return; }
          const rd = OMR.read(sres, t);
          const tv = info && info.variant ? t.variants.find(x => x.code === info.variant) || v : v;
          const k = rd.answers.split('').map(ch => (ch === '*' ? '-' : ch)).join('');
          tv.key = Core.normKey(t, k); DB.save();
          const bad = rd.flags.map((x, i) => (x ? i + 1 : 0)).filter(Boolean);
          toast(`Variant ${tv.code} kaliti varaqdan o'qildi`);
          draw();
          if (bad.length) $('#kst', c).innerHTML = `<span class="warnbox">⚠ Tekshiring: ${bad.join(', ')}-savollar (xira yoki ikki belgi)</span>`;
        } catch (err) { $('#kst', c).innerHTML = `<span class="bad">${esc(err.message)}</span>`; }
      };
      $('#kocr', c).onchange = async e => {
        const files = [...e.target.files]; if (!files.length) return;
        try {
          const text = await QPaper.recognize(files, (p, i, n) => { $('#kst', c).textContent = i ? `${i}/${n}-sahifa o'qilmoqda…` : `O'qilmoqda… ${Math.round(p * 100)}%`; });
          const P = QPaper.parse(text);
          if (!P.keyFound) { $('#kst', c).innerHTML = `<span class="bad">Varaqda kalit topilmadi ("Javoblar: 1-A 2-B …" ro'yxati yoki * belgisi kerak). Topilgan savollar: ${P.questions.length}.</span>`; return; }
          const info = Core.qInfo(t);
          const arr = v.key.split('');
          let k = 0;
          P.questions.forEach((q, i) => { if (i < info.length && q.key && info[i].kind !== 'open') { arr[i] = info[i].kind === 'tf' ? (q.key === 'A' || q.key === 'T' ? 'A' : 'B') : q.key; k++; } });
          v.key = Core.normKey(t, arr.join('')); DB.save(); toast(`${k} ta javob kalitga kiritildi`); draw();
          if (P.questions.length !== info.length) $('#kst', c).innerHTML = `<span class="warnbox">⚠ Varaqda ${P.questions.length} ta savol topildi, testda ${info.length} ta. Kalitni tekshiring.</span>`;
        } catch (err) { $('#kst', c).innerHTML = `<span class="bad">${esc(err.message)}</span>`; }
      };
    };
    draw();
  },

  tabSheets(t, c) {
    const groups = (t.groupIds || []).map(g => DB.group(g)).filter(Boolean);
    const students = DB.studentsOfGroups(t.groupIds);
    const L = Sheet.layout(t);
    c.innerHTML = `${L.fits ? '' : `<div class="card warnbox small">⚠ Bu test bitta A4 varaqqa sig'maydi — qog'oz varaq to'g'ri o'qilmasligi mumkin. Bo'limlarni qisqartiring yoki testni bot orqali o'tkazing.</div>`}
    <div class="card"><h3>O'quvchilar uchun varaqlar</h3>
      <p class="small muted" style="margin-top:0">Har bir varaqda QR kod bor: skaner testni, o'quvchini va variantni o'zi aniqlaydi.${t.type === 'block' ? ' Milliy sertifikati bor fanlar varaqda yopiladi.' : ''}</p>
      ${students.length ? `
        <label class="f"><span>Variant</span><select class="in" id="vmode"><option value="rot">Navbatma-navbat (A, B, C…)</option>${t.variants.map(v => `<option value="${v.code}">Hammaga ${v.code}</option>`).join('')}</select></label>
        <div class="row"><label class="chk" style="border:0"><input type="checkbox" id="all" checked> Hammasi</label><span class="sp"></span><span class="muted small" id="cnt"></span></div>
        <div style="max-height:320px;overflow:auto">${groups.map(g => `<div class="small muted" style="margin-top:8px">${esc(g.name)}</div>` + DB.studentsOfGroups([g.id]).map(s => `<label class="chk"><input type="checkbox" class="st" value="${s.id}" checked> ${esc(s.name)}</label>`).join('')).join('')}</div>
        <button class="btn pri block" id="mk" style="margin-top:12px">Varaqlar PDF</button>`
      : `<p class="muted small">Testga guruh biriktirilmagan yoki guruhda o'quvchi yo'q. <a href="#/test-edit/${t.id}">Guruh biriktirish</a></p>`}
    </div>
    <div class="card"><h3>Bo'sh varaqlar</h3>
      <p class="small muted" style="margin-top:0">Ismi yozilmagan varaq: skanerlashda o'quvchini ro'yxatdan tanlaysiz.</p>
      <div class="grid2"><label class="f"><span>Soni</span><input class="in" id="bn" type="number" min="1" max="200" value="10"></label>
      <label class="f"><span>Variant</span><select class="in" id="bv">${t.variants.map(v => `<option>${v.code}</option>`).join('')}</select></label></div>
      <button class="btn block" id="mkb">Bo'sh varaqlar PDF</button>
    </div>
    <div class="card"><h3>Namuna</h3><img id="prev" class="preview" alt="Varaq namunasi"></div>`;
    const sample = Sheet.render({ center: DB.data.center.name, test: t, student: students[0] || null, group: students[0] ? DB.group(students[0].groupId) : null, variant: t.variants[0].code });
    $('#prev', c).src = sample.toDataURL('image/png');
    const upd = () => { if ($('#cnt', c)) $('#cnt', c).textContent = $$('.st:checked', c).length + ' ta tanlandi'; };
    if ($('#all', c)) { $('#all', c).onchange = e => { $$('.st', c).forEach(x => x.checked = e.target.checked); upd(); }; $$('.st', c).forEach(x => x.onchange = upd); upd(); }
    if ($('#mk', c)) $('#mk', c).onclick = async e => {
      const ids = $$('.st:checked', c).map(x => x.value);
      if (!ids.length) { toast("O'quvchi tanlang", 'err'); return; }
      const mode = $('#vmode', c).value;
      e.target.disabled = true; e.target.textContent = 'Tayyorlanmoqda…';
      const items = ids.map((id, i) => { const s = DB.student(id); return { student: s, group: DB.group(s.groupId), variant: mode === 'rot' ? t.variants[i % t.variants.length].code : mode }; });
      const blob = await PDF.sheets(t, items);
      e.target.disabled = false; e.target.textContent = 'Varaqlar PDF';
      shareOrDownload(blob, `varaqlar_${PDF.fname(t.name)}.pdf`);
    };
    $('#mkb', c).onclick = async e => {
      const k = Math.max(1, Math.min(200, parseInt($('#bn', c).value) || 1));
      e.target.disabled = true;
      const blob = await PDF.sheets(t, Array.from({ length: k }, () => ({ student: null, group: null, variant: $('#bv', c).value })));
      e.target.disabled = false;
      shareOrDownload(blob, `bosh_varaqlar_${PDF.fname(t.name)}.pdf`);
    };
  },

  tabResults(t, c) {
    const { rows, rasch } = Scoring.table(t);
    const isR = t.type === 'rasch';
    const pendingOpen = rows.reduce((a, x) => a + x.ev.pending, 0);
    c.innerHTML = `<div class="btns" style="margin:0 0 12px">
        <a class="btn pri sm" href="#/scan/${t.id}">⌖ Skanerlash</a>
        <button class="btn sm" id="man">＋ Qo'lda kiritish</button>
        ${rows.length ? `<button class="btn sm" id="rpdf">Natijalar PDF</button><button class="btn sm" id="rxls">Excel</button><button class="btn sm" id="tg">Telegramga ulashish</button>` : ''}
      </div>
      ${rasch && rasch.few ? `<p class="small" style="color:var(--acc)">Rasch hisobi uchun kamida 3 ta natija kerak. Hozircha qiyinliklar teng deb olindi.</p>` : ''}
      ${pendingOpen ? `<p class="small warnbox">✍ ${pendingOpen} ta yozma javob baholanmagan — natijani ochib ✓ yoki ✗ ni bosing.</p>` : ''}
      ${rows.length ? `<div class="card tw" style="padding:4px 8px"><table class="t"><thead><tr><th>#</th><th>O'quvchi</th>${isR ? `<th class="num">To'g'ri</th><th class="num">Ball</th><th>Daraja</th>` : `<th class="num">To'g'ri</th><th class="num">Ball</th><th class="num">%</th>`}</tr></thead><tbody>
        ${rows.map(x => `<tr class="click" data-r="${x.r.id}"><td>${x.rank}</td><td><b>${esc(x.name)}</b>${x.r.source === 'bot' ? ' <span class="badge">bot</span>' : ''}<div class="small muted">${esc(x.group)} · ${x.r.variant}</div></td>
          ${isR ? `<td class="num">${x.ev.correct}/${x.ev.total}</td><td class="num"><b>${x.T}</b></td><td><span class="pill">${x.grade}</span></td>`
               : `<td class="num">${x.ev.correct}/${x.ev.total}</td><td class="num"><b>${x.ev.points}</b>${x.ev.sections.some(s => s.cert) ? ' <span class="badge">S</span>' : ''}</td><td class="num">${x.ev.percent}%</td>`}</tr>`).join('')}
      </tbody></table></div>` : emptyBox('⌖', "Hali natija yo'q. Javob varaqalarini skanerlang yoki testni botda oching.")}`;
    botCard(t, c, rows);
    $$('[data-r]', c).forEach(tr => tr.onclick = () => location.hash = `#/result/${tr.dataset.r}`);
    $('#man', c).onclick = () => manualResult(t);
    if ($('#rpdf', c)) $('#rpdf', c).onclick = async () => shareOrDownload(await PDF.results(t), `natijalar_${PDF.fname(t.name)}.pdf`);
    if ($('#rxls', c)) $('#rxls', c).onclick = () => exportTestXlsx(t);
    if ($('#tg', c)) $('#tg', c).onclick = () => {
      const lines = rows.slice(0, 30).map(x => `${x.rank}. ${x.name} — ${isR ? x.T + ' (' + x.grade + ')' : x.ev.points + ' ball'}`);
      const text = `📊 ${t.name} (${fmtDate(t.date)})\n${DB.data.center.name}\n\n${lines.join('\n')}`;
      window.open('https://t.me/share/url?url=' + encodeURIComponent(' ') + '&text=' + encodeURIComponent(text), '_blank');
    };
  },

  tabAnalysis(t, c) {
    const { rows, rasch } = Scoring.table(t);
    if (!rows.length) { c.innerHTML = emptyBox('▥', "Tahlil uchun natijalar kerak"); return; }
    const info = Core.qInfo(t);
    const n = info.length;
    const right = new Array(n).fill(0), blank = new Array(n).fill(0);
    const dist = Array.from({ length: n }, () => ({}));
    rows.forEach(x => x.ev.marks.forEach((m, i) => {
      if (m === 1) right[i]++; if (m === -1) blank[i]++;
      const a = Core.show(info[i].sec, (x.r.answers || '')[i]); dist[i][a] = (dist[i][a] || 0) + 1;
    }));
    // Ajratish indeksi: yuqori va quyi 27% guruh
    const g = Math.max(1, Math.round(rows.length * 0.27));
    const up = rows.slice(0, g), lo = rows.slice(-g);
    const disc = info.map((_, i) => round1((up.filter(x => x.ev.marks[i] === 1).length - lo.filter(x => x.ev.marks[i] === 1).length) / g * 100) / 100);
    const sc = rows.map(x => x.score);
    const avg = round1(sc.reduce((a, b) => a + b, 0) / sc.length);
    const grades = {};
    if (rasch) rows.forEach(x => grades[x.grade] = (grades[x.grade] || 0) + 1);
    const hard = right.map((r, i) => [r / rows.length, i]).sort((a, b) => a[0] - b[0]).slice(0, 5);
    const key = Core.normKey(t, t.variants[0].key);
    c.innerHTML = `<div class="grid4" style="margin-bottom:12px">
        <div class="stat"><b>${rows.length}</b><span>Ishtirokchi</span></div>
        <div class="stat"><b>${avg}</b><span>O'rtacha ball</span></div>
        <div class="stat"><b>${round1(Math.max(...sc))}</b><span>Eng yuqori</span></div>
        <div class="stat"><b>${round1(Math.min(...sc))}</b><span>Eng past</span></div>
      </div>
      ${rasch ? `<div class="card"><h3>Darajalar</h3><div class="row wrap">${['A+', ...GRADES.slice(1), '—'].map(g => `<div class="stat" style="min-width:70px;text-align:center"><b>${grades[g] || 0}</b><span>${g}</span></div>`).join('')}</div></div>` : ''}
      ${t.sections.length > 1 ? `<div class="card"><h3>Bo'limlar bo'yicha o'rtacha</h3>${t.sections.map((s, si) => {
        const a = rows.reduce((acc, x) => acc + x.ev.sections[si].points, 0) / rows.length;
        const mx = round1(s.count * s.weight) || 1;
        return `<div style="margin-bottom:8px"><div class="row small"><span>${esc(s.title)}</span><span class="sp"></span><b>${round1(a)} / ${mx}</b></div><div class="bar"><i style="width:${a / mx * 100}%"></i></div></div>`;
      }).join('')}</div>` : ''}
      <div class="card"><h3>Eng qiyin savollar</h3>${hard.map(([p, i]) => `<span class="pill" style="margin:2px">${i + 1}-savol · ${Math.round(p * 100)}%</span>`).join('')}</div>
      <div class="card tw"><h3>Har bir savol tahlili</h3><p class="small muted" style="margin-top:0">Ajratish: yaxshi o'quvchilar kuchsizlardan qanchalik ko'p topgani (0.3 dan yuqori — yaxshi savol, manfiy — savolni tekshiring).</p><table class="t"><thead><tr><th>Savol</th><th>Kalit</th><th>To'g'ri</th><th style="width:30%"></th><th class="num">Ajratish</th>${rasch ? '<th class="num">Qiyinlik</th><th class="num">Savol balli</th>' : ''}<th>Javoblar</th></tr></thead><tbody>
        ${right.map((r, i) => `<tr><td>${i + 1}</td><td>${Core.show(info[i].sec, key[i])}</td><td>${r}/${rows.length}</td><td><div class="bar"><i style="width:${r / rows.length * 100}%;background:${r / rows.length < .35 ? 'var(--bad)' : r / rows.length < .65 ? 'var(--acc)' : 'var(--ok)'}"></i></div></td><td class="num ${disc[i] < 0 ? 'bad' : ''}">${disc[i]}</td>${rasch ? `<td class="num">${rasch.items[i].b}</td><td class="num"><b>${rasch.items[i].w}</b></td>` : ''}<td class="small muted">${Object.entries(dist[i]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)}:${v}`).join(' ')}</td></tr>`).join('')}
      </tbody></table></div>`;
  },

  /* ---------- natija ---------- */
  result(id) {
    const r = DB.result(id);
    if (!r) { location.hash = '#/tests'; return; }
    const t = DB.test(r.testId);
    if (!t) { location.hash = '#/tests'; return; }
    const st = r.studentId ? DB.student(r.studentId) : null;
    const info = Core.qInfo(t);
    const draw = () => {
      const ev = Scoring.evaluate(t, r);
      const RA = t.type === 'rasch' ? Scoring.rasch(t, DB.resultsOfTest(t.id)) : null;
      const R = RA ? RA.byResult[r.id] : null;
      const key = Core.normKey(t, Scoring.variantOf(t, r.variant).key);
      const openQ = info.map((x, i) => (x.kind === 'open' ? i : -1)).filter(i => i >= 0);
      const body = `<div class="card">
          <div class="row"><div class="av">${esc(initials(st ? st.name : '?'))}</div><div><div class="t"><b>${esc(st ? st.name : (r.guestName || "Noma'lum o'quvchi"))}</b></div><div class="small muted">${esc(t.name)} · ${fmtDate(t.date)}${r.source === 'bot' ? ' · Telegram bot' : ''}</div></div></div>
          ${!st ? `<label class="f" style="margin-top:10px"><span>O'quvchiga bog'lash</span><select class="in" id="link"><option value="">— tanlang —</option>${DB.myStudents().map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>` : ''}
          <hr>
          <div class="row wrap">
            ${R ? `<div><div class="score">${R.T}<span class="muted" style="font-size:16px"> / ${Core.raschCfg(t).max}</span></div><div class="small muted">Rasch ball${Core.raschCfg(t).mode === 'bmba' ? ' (BMBA T)' : ' (savol qiyinligi bo‘yicha)'}</div></div><span class="grade">${R.grade}</span>`
                : `<div><div class="score">${ev.points}<span class="muted" style="font-size:16px"> / ${ev.max}</span></div><div class="small muted">Ball · ${ev.percent}%</div></div>`}
            <span class="sp"></span>
            <div class="small"><div class="ok">✓ To'g'ri: <b>${ev.correct}</b></div><div class="bad">✗ Noto'g'ri: <b>${ev.wrong}</b></div><div class="muted">○ Bo'sh: <b>${ev.blank}</b></div></div>
          </div>
          <label class="f" style="margin-top:12px"><span>Variant</span><select class="in" id="var">${t.variants.map(v => `<option ${v.code === r.variant ? 'selected' : ''}>${v.code}</option>`).join('')}</select></label>
          <div class="btns"><button class="btn sm" id="pdf">PDF hisobot</button><button class="btn sm" id="tg">Telegramga</button>${st && st.tg ? `<button class="btn sm" id="tgbot">Botga yuborish</button>` : ''}<button class="btn sm danger" id="del">O'chirish</button></div>
        </div>
        ${t.sections.length > 1 ? `<div class="card"><h3>Bo'limlar</h3><table class="t"><tbody>${ev.sections.map(s => `<tr><td>${esc(s.title)}${s.cert ? ` <span class="badge">Sertifikat ${esc(s.cert)}</span>` : ''}</td><td class="num">${s.correct}/${s.count}</td><td class="num"><b>${s.points}</b> / ${s.max}</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${R && Core.raschCfg(t).mode === 'weighted' ? `<div class="card"><h3>Savollar bo'yicha ball</h3><p class="small muted" style="margin-top:0">Qiyin savol — ko'p ball. Yashil: topilgan.</p><div class="ptsgrid">${R.pts.map((p, i) => `<span class="${p ? 'okp' : ''}">${i + 1}: ${RA.items[i].w}</span>`).join('')}</div></div>` : ''}
        ${openQ.length ? `<div class="card"><h3>Yozma javoblar</h3>${openQ.map(q => `<div class="row" style="border-bottom:1px solid var(--line);padding:6px 0"><b style="width:36px">${q + 1}.</b><div class="sp small">${esc((r.openText || {})[q] || (r.source === 'bot' ? '—' : "qog'ozda"))}</div>
            <button class="kb ${r.answers[q] === '+' ? 'ok' : ''}" data-og="${q}" data-v="+">✓</button><button class="kb ${r.answers[q] === 'x' ? 'no' : ''}" data-og="${q}" data-v="x">✗</button></div>`).join('')}</div>` : ''}
        ${r.image ? `<div class="card"><h3>Skanerlangan varaq</h3><img class="preview" src="${r.image}" alt=""></div>` : ''}
        <div class="card"><h3>Javoblar</h3><p class="small muted" style="margin-top:0">Noto'g'ri tanilgan bo'lsa, to'g'ri variantni bosing. Yashil chegarali — kalit.</p><div class="keys" id="ans"></div></div>`;
      layout('Natija', body, { back: `#/test/${t.id}/natija`, tab: 'tests' });
      renderKeyGrid($('#ans'), t, r.answers, (q, opt) => {
        const a = r.answers.split(''); a[q] = a[q] === opt ? '-' : opt; r.answers = a.join(''); DB.save();
        setTimeout(draw, 0); return r.answers;
      }, key);
      $$('[data-og]').forEach(b => b.onclick = () => { const a = r.answers.split(''); const q = +b.dataset.og; a[q] = a[q] === b.dataset.v ? '-' : b.dataset.v; r.answers = a.join(''); DB.save(); draw(); });
      if ($('#link')) $('#link').onchange = e => { if (!e.target.value) return; r.studentId = e.target.value; delete r.guestName; DB.save(); V.result(r.id); };
      $('#var').onchange = e => { r.variant = e.target.value; DB.save(); draw(); };
      $('#del').onclick = async () => { if (await confirmBox("Natija o'chirilsinmi?")) { DB.data.results = DB.data.results.filter(x => x.id !== r.id); DB.save(); location.hash = `#/test/${t.id}/natija`; } };
      $('#pdf').onclick = async () => shareOrDownload(await PDF.studentReport(t, r), `natija_${PDF.fname(st ? st.name : 'oquvchi')}.pdf`);
      $('#tg').onclick = () => window.open('https://t.me/share/url?url=' + encodeURIComponent(' ') + '&text=' + encodeURIComponent(resultText(t, r)), '_blank');
      if ($('#tgbot')) $('#tgbot').onclick = () => TBot.notifyResults(t, [r]);
    };
    draw();
  },

  /* ---------- o'quvchilar ---------- */
  students() {
    const q = (V._sq || '').toLowerCase(), gf = V._sg || '';
    const groups = DB.myGroups();
    const list = DB.myStudents().filter(s => (!gf || s.groupId === gf) && (!q || s.name.toLowerCase().includes(q) || (s.phone || '').includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    const body = `<div class="row" style="margin-bottom:12px"><input class="in" id="q" placeholder="Qidirish…" value="${esc(V._sq || '')}">
        <select class="in" id="g" style="max-width:40%"><option value="">Barcha guruhlar</option>${groups.map(g => `<option value="${g.id}" ${g.id === gf ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
      <div class="btns" style="margin:0 0 12px"><button class="btn pri sm" id="add">＋ O'quvchi</button><button class="btn sm" id="bulk">Ro'yxatdan qo'shish</button><a class="btn sm" href="#/groups">Guruhlar</a></div>
      <div class="muted small" style="margin-bottom:6px">${list.length} ta o'quvchi · ${list.filter(s => s.tg).length} tasi Telegram botga ulangan</div>
      ${list.length ? list.map(s => { const g = DB.group(s.groupId); return `<a class="li" href="#/student/${s.id}"><div class="av">${esc(initials(s.name))}</div><div class="sp"><div class="t">${esc(s.name)}${s.tg ? ' <span class="badge">✈</span>' : ''}</div><div class="s">${esc(g ? g.name : 'Guruhsiz')}${s.phone ? ' · +' + esc(s.phone) : ''}${(s.certs || []).length ? ' · 🎓 ' + s.certs.map(c => esc(c.subject.split(' ')[0]) + ' ' + c.grade).join(', ') : ''}</div></div></a>`; }).join('')
        : emptyBox('☺', groups.length ? "O'quvchi yo'q" : "Avval guruh yarating, keyin o'quvchilarni qo'shing", groups.length ? '' : '<a class="btn pri" href="#/groups">Guruh yaratish</a>')}`;
    layout("O'quvchilar", body, { tab: 'students' });
    $('#q').oninput = e => { V._sq = e.target.value; clearTimeout(V._st); V._st = setTimeout(() => { V.students(); const i = $('#q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
    $('#g').onchange = e => { V._sg = e.target.value; V.students(); };
    $('#add').onclick = () => studentModal(null, V.students);
    $('#bulk').onclick = () => bulkStudents(V.students);
  },

  student(id) {
    const s = DB.student(id);
    if (!s) { location.hash = '#/students'; return; }
    const g = DB.group(s.groupId);
    const pr = studentProgress(s.id);
    const body = `<div class="card"><div class="row"><div class="av">${esc(initials(s.name))}</div><div class="sp"><b>${esc(s.name)}</b><div class="small muted">${esc(g ? g.name : 'Guruhsiz')}${s.phone ? ' · +' + esc(s.phone) : ''}${s.tg ? ' · ✈ Telegram ulangan' : ''}</div></div></div>
        ${(s.certs || []).length ? `<hr><div class="small"><b>Milliy sertifikatlar:</b> ${s.certs.map(c => `<span class="pill" style="margin:2px">${esc(c.subject)} · ${c.grade}${c.percent ? ' · ' + c.percent + '%' : ''}</span>`).join('')}</div>` : ''}
        <div class="btns"><button class="btn sm" id="ed">Tahrirlash</button><button class="btn sm danger" id="del">O'chirish</button></div></div>
      ${pr.items.length ? `<div class="grid4" style="margin-bottom:12px">
        <div class="stat"><b>${pr.level}</b><span>Daraja</span></div>
        <div class="stat"><b>${pr.accuracy}%</b><span>Aniqlik</span></div>
        <div class="stat"><b>${pr.top3}</b><span>Top-3 o'rin</span></div>
        <div class="stat"><b>${pr.items.length}</b><span>Testlar</span></div></div>
        <div class="card"><h3>O'sish grafigi</h3>${progressSvg(pr.items)}</div>` : ''}
      <h3>Natijalar tarixi</h3>
      ${pr.items.length ? pr.items.slice().reverse().map(x => `<a class="li" href="#/result/${x.r.id}"><div class="sp"><div class="t">${esc(x.t.name)}</div><div class="s"><span class="badge ${x.t.type}">${TYPE_NAME[x.t.type]}</span> ${fmtDate(x.t.date)} · ${x.rank}-o'rin / ${x.of}</div></div><div style="text-align:right"><b>${x.R ? x.R.T + ' · ' + x.R.grade : x.ev.points}</b><div class="s">${x.ev.correct}/${x.ev.total}</div></div></a>`).join('') : emptyBox('▥', "Natijalar yo'q")}`;
    layout(s.name, body, { back: '#/students', tab: 'students' });
    $('#ed').onclick = () => studentModal(s, () => V.student(id));
    $('#del').onclick = async () => { if (await confirmBox(`${s.name} va uning natijalari o'chiriladi.`)) { DB.removeStudent(s.id); DB.save(); location.hash = '#/students'; } };
  },

  /* ---------- guruhlar ---------- */
  groups() {
    const groups = DB.myGroups().slice().sort((a, b) => a.name.localeCompare(b.name));
    const body = `<button class="btn pri block" id="add" style="margin-bottom:12px">＋ Guruh qo'shish</button>
      ${groups.length ? groups.map(g => { const tch = DB.user(g.teacherId); return `<div class="li" data-g="${g.id}"><div class="av">${esc(initials(g.name))}</div><div class="sp"><div class="t">${esc(g.name)}</div><div class="s">${DB.studentsOfGroups([g.id]).length} o'quvchi${tch ? ' · ' + esc(tch.name) : ''}</div></div><button class="btn sm" data-e="${g.id}">✎</button></div>`; }).join('') : emptyBox('☷', "Guruhlar yo'q")}`;
    layout('Guruhlar', body, { back: '#/more', tab: 'more' });
    $('#add').onclick = () => groupModal(null);
    $$('[data-g]').forEach(el => el.onclick = e => { if (e.target.closest('[data-e]')) return; V._sg = el.dataset.g; V._sq = ''; location.hash = '#/students'; });
    $$('[data-e]').forEach(b => b.onclick = () => groupModal(DB.group(b.dataset.e)));
  },

  /* ---------- o'qituvchilar ---------- */
  teachers() {
    if (!DB.isAdmin()) { location.hash = '#/more'; return; }
    const us = DB.data.users;
    const body = `${DB.data.cloud ? '' : `<div class="card warnbox small">O'qituvchi o'z telefonidan kirishi uchun <a href="#/cloud">bulut sinxronlashni</a> yoqing.</div>`}
      <button class="btn pri block" id="add" style="margin-bottom:12px">＋ O'qituvchi qo'shish</button>
      ${us.map(u => `<div class="li"><div class="av">${esc(initials(u.name))}</div><div class="sp"><div class="t">${esc(u.name)}</div><div class="s">+${esc(u.phone)} · ${u.role === 'admin' ? 'Administrator' : "O'qituvchi"} · ${DB.data.groups.filter(g => g.teacherId === u.id).length} guruh</div></div>
        ${u.id !== DB.me().id ? `<button class="btn sm" data-p="${u.id}">Parol</button><button class="btn sm danger" data-d="${u.id}">✕</button>` : ''}</div>`).join('')}`;
    layout("O'qituvchilar", body, { back: '#/more', tab: 'more' });
    $('#add').onclick = () => modal(`<h2>Yangi o'qituvchi</h2><form id="tf">
        <label class="f"><span>Ism familiya</span><input class="in" name="name" required></label>
        <label class="f"><span>Telefon (login)</span><input class="in" name="phone" type="tel" required></label>
        <label class="f"><span>Parol</span><input class="in" name="pass" minlength="4" required></label>
        <label class="f"><span>Roli</span><select class="in" name="role"><option value="teacher">O'qituvchi</option><option value="admin">Administrator</option></select></label>
        <div class="btns"><button type="button" class="btn sp" data-close>Bekor</button><button class="btn pri sp">Qo'shish</button></div></form>`, (el, close) => {
      $('#tf', el).onsubmit = async e => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const ph = normPhone(f.phone);
        if (DB.data.users.some(u => u.phone === ph)) { toast('Bu telefon band', 'err'); return; }
        DB.data.users.push({ id: DB.id(), name: f.name.trim(), phone: ph, role: f.role, pass: await hashPass(f.pass) });
        DB.save(); close(); V.teachers();
      };
    });
    $$('[data-d]').forEach(b => b.onclick = async () => {
      const u = DB.user(b.dataset.d);
      if (await confirmBox(`${u.name} o'chirilsinmi? Uning guruhlari administratorga o'tadi.`)) {
        DB.data.groups.forEach(g => { if (g.teacherId === u.id) g.teacherId = ''; });
        DB.data.users = DB.data.users.filter(x => x.id !== u.id); DB.save(); V.teachers();
      }
    });
    $$('[data-p]').forEach(b => b.onclick = () => passModal(DB.user(b.dataset.p)));
  },

  /* ---------- yana ---------- */
  more() {
    const me = DB.me(), adm = DB.isAdmin();
    const ap = (DB.data.appeals || []).filter(a => !a.reply).length;
    const body = `<div class="card"><div class="row"><div class="av">${esc(initials(me.name))}</div><div class="sp"><b>${esc(me.name)}</b><div class="small muted">+${esc(me.phone)} · ${adm ? 'Administrator' : "O'qituvchi"}</div></div></div>
        <div class="small muted" style="margin-top:8px">${esc(DB.data.center.name)}</div></div>
      <a class="li" href="#/xls"><span class="av">📊</span><span class="sp t">Excel jadvalni hisoblash</span>›</a>
      <a class="li" href="#/groups"><span class="av">☷</span><span class="sp t">Guruhlar</span>›</a>
      ${adm ? `<a class="li" href="#/teachers"><span class="av">☻</span><span class="sp t">O'qituvchilar</span>›</a>` : ''}
      <a class="li" href="#/cloud"><span class="av">☁</span><span class="sp t">Bulut sinxronlash</span>${DB.data.cloud ? '<span class="badge">yoqilgan</span>' : ''}›</a>
      ${adm ? `<a class="li" href="#/bot"><span class="av">✈</span><span class="sp t">Telegram bot va xabarlar</span>${DB.data.settings.bot ? '<span class="badge">ulangan</span>' : ''}›</a>` : ''}
      <a class="li" href="#/appeals"><span class="av">✉</span><span class="sp t">Murojaatlar</span>${ap ? `<span class="badge">${ap}</span>` : ''}›</a>
      ${adm ? `<a class="li" href="#/settings"><span class="av">⚙</span><span class="sp t">Sozlamalar</span>›</a>` : ''}
      <a class="li" href="#/backup"><span class="av">⇅</span><span class="sp t">Zaxira nusxa (eksport / import)</span>›</a>
      <a class="li" href="#/help"><span class="av">?</span><span class="sp t">Qo'llanma</span>›</a>
      <div class="li" id="pw"><span class="av">🔑</span><span class="sp t">Parolni o'zgartirish</span>›</div>
      <div class="li" id="out"><span class="av">⏻</span><span class="sp t bad">Chiqish</span></div>`;
    layout('Yana', body, { tab: 'more' });
    $('#out').onclick = () => { DB.data.session = null; DB.save({ silent: true }); location.hash = '#/login'; };
    $('#pw').onclick = () => passModal(me);
  },

  settings() {
    if (!DB.isAdmin()) { location.hash = '#/more'; return; }
    const S = DB.data.settings;
    const body = `<form id="f"><div class="card"><h3>O'quv markaz</h3>
        <label class="f"><span>Nomi (varaqlarda chiqadi)</span><input class="in" name="center" value="${esc(DB.data.center.name)}" required></label></div>
      <div class="card"><h3>Telegram</h3>
        <label class="chk"><input type="checkbox" name="autoNotify" ${S.autoNotify !== false ? 'checked' : ''}> Skanerlangan natijani o'quvchining Telegramiga avtomatik yuborish</label></div>
      <div class="card"><h3>Milliy sertifikat (blok testlar)</h3>
        <p class="small muted" style="margin:0">Amaldagi qoida bo'yicha avtomatik hisoblanadi:</p>
        <ul class="small" style="margin:6px 0 0;padding-left:18px">
          <li>Majburiy fan (ona tili, matematika, tarix) — istalgan darajadagi sertifikat: <b>maksimal ball</b>.</li>
          <li>Asosiy fan, <b>A+ yoki A</b> — maksimal ball.</li>
          <li>Asosiy fan, <b>B+, B, C+, C</b> — maksimal ball × sertifikatdagi foiz (masalan 93 × 89% = 82.8).</li>
          <li>Test natijasi sertifikatdan yuqori bo'lsa — test balli olinadi.</li></ul>
        <p class="small muted">Sertifikat (fan, daraja, foiz) o'quvchi kartasida kiritiladi.</p></div>
      <button class="btn pri block">Saqlash</button></form>
      <div class="card" style="margin-top:16px"><h3 class="bad">Xavfli hudud</h3><p class="small muted">Shu qurilmadagi barcha ma'lumotlar o'chiriladi (bulutdagi nusxa qoladi).</p><button class="btn danger" id="wipe">Qurilmadan o'chirish</button></div>`;
    layout('Sozlamalar', body, { back: '#/more', tab: 'more' });
    $('#f').onsubmit = e => {
      e.preventDefault(); const fd = new FormData(e.target);
      DB.data.center.name = fd.get('center').trim();
      S.autoNotify = !!fd.get('autoNotify');
      DB.save(); toast('Saqlandi');
    };
    $('#wipe').onclick = async () => {
      if (await confirmBox("Bu qurilmadagi barcha testlar, o'quvchilar va natijalar o'chiriladi. Avval zaxira oling!", "Ha, o'chirish")) {
        localStorage.removeItem(DB_KEY); DB._snap = null; DB.load(); location.hash = '#/register';
      }
    };
  },

  backup() {
    const body = `<div class="card"><h3>Eksport</h3><p class="small muted" style="margin-top:0">Ma'lumotlar qurilmada${DB.data.cloud ? ' va bulutda' : ''} saqlanadi. Qo'shimcha xavfsizlik uchun vaqti-vaqti bilan zaxira oling.</p>
        <button class="btn pri" id="ex">Zaxira faylini yuklab olish (.json)</button></div>
      <div class="card"><h3>Import</h3><p class="small muted" style="margin-top:0">Diqqat: joriy ma'lumotlar fayldagilar bilan almashtiriladi.</p>
        <input type="file" id="im" accept="application/json,.json" class="in"></div>`;
    layout('Zaxira nusxa', body, { back: '#/more', tab: 'more' });
    $('#ex').onclick = () => shareOrDownload(DB.exportJSON(), `testvaraq_zaxira_${today()}.json`);
    $('#im').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      if (!(await confirmBox("Joriy ma'lumotlar almashtirilsinmi?", 'Import'))) return;
      try { DB.importJSON(await f.text()); toast('Import qilindi'); location.hash = DB.data.session ? '#/home' : '#/login'; }
      catch (err) { toast('Xato: ' + err.message, 'err'); }
    };
  },

  help() {
    const body = `<div class="card"><h3>1. Guruh va o'quvchilar</h3><p class="small">Guruhlar bo'limida guruh yarating, so'ng o'quvchilarni qo'shing (bittadan yoki ro'yxat bilan). Telefon raqamini kiritsangiz, o'quvchi botga shu raqam bilan avtomatik ulanadi. Milliy sertifikati bor o'quvchiga fan, daraja va foizni kiriting.</p></div>
      <div class="card"><h3>2. Test yaratish</h3><p class="small"><b>Blok</b> — DTM formati (90 savol, 189 ball). <b>Oddiy</b> va <b>Rasch</b> — bir nechta bo'lim (mavzu): har biriga savol soni, 2–6 variant (A–F), True/False yoki yozma javob va ball. Har bir variant uchun javob kalitini kiriting.</p></div>
      <div class="card"><h3>3. Varaqlarni chop etish</h3><p class="small">Test → Javob varaqalari → PDF. A4 qog'ozga 100% masshtabda chop eting. Yozma savollar uchun o'qituvchi varaqdagi ✓ yoki ✗ doirachani bo'yaydi — skaner uni ham o'qiydi.</p></div>
      <div class="card"><h3>4. Skanerlash</h3><p class="small">Skaner → kamerani varaqqa qarating: 4 ta qora burchak va QR kadrga tushsin. Xira yoki ikki marta belgilangan javoblar sariq bilan ko'rsatiladi — tekshirib saqlang.</p></div>
      <div class="card"><h3>5. Telegram bot</h3><p class="small">Yana → Telegram bot: BotFather tokenini kiriting. O'quvchi botga telefon raqamini yuboradi va ro'yxatdagi o'zi bilan bog'lanadi. Test → Natijalar → "Botda ochish": o'quvchi 6 belgili kodni kiritib, javoblarni bitta xabarda yuboradi va natijani darhol oladi.</p></div>
      <div class="card"><h3>6. Excel jadval</h3><p class="small">Yana → Excel jadvalni hisoblash: EvalBee hisobotini yoki "Ism, 1, 2, 3…" ustunli jadvalni (birinchi qatorda "Kalit") yuklang — reyting, ball, Rasch, mavzular va savollar tahlili tayyor bo'ladi.</p></div>`;
    layout("Qo'llanma", body, { back: '#/more', tab: 'more' });
  }
};

/* ---------- umumiy vidjetlar ---------- */
function testItem(t) {
  const rc = DB.resultsOfTest(t.id).length;
  return `<a class="li" href="#/test/${t.id}"><div class="sp"><div class="t">${esc(t.name)}${t.bot === 'open' ? ' <span class="badge">bot · ' + esc(t.code || '') + '</span>' : ''}</div><div class="s"><span class="badge ${t.type}">${TYPE_NAME[t.type]}</span> ${fmtDate(t.date)} · ${Scoring.qCount(t)} savol</div></div><div style="text-align:right"><b>${rc}</b><div class="s">natija</div></div></a>`;
}
function resultItem(r) {
  const t = DB.test(r.testId); if (!t) return '';
  const s = r.studentId ? DB.student(r.studentId) : null;
  const ev = Scoring.evaluate(t, r);
  return `<a class="li" href="#/result/${r.id}"><div class="av">${esc(initials(s ? s.name : '?'))}</div><div class="sp"><div class="t">${esc(s ? s.name : (r.guestName || "Noma'lum"))}</div><div class="s">${esc(t.name)}</div></div><div style="text-align:right"><b>${ev.points}</b><div class="s">${ev.correct}/${ev.total}</div></div></a>`;
}

/* Har savol uchun tugmalar (A–F, T/F, ✓/✗). key berilsa to'g'ri/noto'g'ri ko'rsatiladi; flags — shubhali savollar. */
function renderKeyGrid(el, t, value, onPick, key, flags) {
  const info = Core.qInfo(t);
  let html = '';
  info.forEach((x, q) => {
    if (x.first && t.sections.length > 1) {
      let st = 0; for (let i = 0; i < x.si; i++) st += t.sections[i].count;
      const s = t.sections[x.si];
      html += `<div class="sec-h">${esc(s.title)} (${st + 1}–${st + s.count})${x.kind === 'tf' ? ' · True/False' : x.kind === 'open' ? ' · yozma' : ''}</div>`;
    }
    const codes = Core.codes(x.sec), labels = Core.labels(x.sec);
    const fl = flags && flags[q];
    if (x.kind === 'open' && !key) { html += `<div class="kr"><span class="n">${q + 1}.</span><span class="small muted">yozma — o'qituvchi baholaydi</span></div>`; return; }
    html += `<div class="kr ${fl ? 'flag' : ''}"><span class="n">${q + 1}.</span>${codes.map((o, i) => {
      let cls = '';
      const v = value[q];
      if (v === o) cls = key ? (key[q] && key[q] !== '-' && x.kind !== 'open' ? (key[q] === o ? 'ok' : 'no') : (x.kind === 'open' ? (o === '+' ? 'ok' : 'no') : 'on')) : 'on';
      if (key && x.kind !== 'open' && key[q] === o && v !== o) cls += ' key';
      return `<button type="button" class="kb ${cls}" data-q="${q}" data-o="${o}">${labels[i]}</button>`;
    }).join('')}${value[q] === '*' ? '<span class="small" style="color:var(--acc)">2+</span>' : ''}</div>`;
  });
  el.innerHTML = html;
  el.onclick = e => {
    const b = e.target.closest('.kb'); if (!b) return;
    const q = +b.dataset.q;
    const nv = onPick(q, b.dataset.o);
    if (!key) $$(`.kb[data-q="${q}"]`, el).forEach(x => x.classList.toggle('on', nv[q] === x.dataset.o));
  };
}

function resultText(t, r) {
  const st = r.studentId ? DB.student(r.studentId) : null;
  const ev = Scoring.evaluate(t, r);
  const R = t.type === 'rasch' ? Scoring.rasch(t, DB.resultsOfTest(t.id)).byResult[r.id] : null;
  const key = Core.normKey(t, Scoring.variantOf(t, r.variant).key);
  const info = Core.qInfo(t);
  const wrong = ev.marks.map((m, i) => (m === 0 && info[i].kind !== 'open' ? `${i + 1}(${Core.show(info[i].sec, r.answers[i])}→${Core.show(info[i].sec, key[i])})` : '')).filter(Boolean);
  return `📝 ${t.name} (${fmtDate(t.date)})\n👤 ${st ? st.name : (r.guestName || '')}\n` + (R ? `Rasch ball: ${R.T} / ${Core.raschCfg(t).max} · Daraja: ${R.grade}` : `Ball: ${ev.points} / ${ev.max} (${ev.percent}%)`) +
    `\nTo'g'ri: ${ev.correct}/${ev.total}` + (t.sections.length > 1 ? '\n' + ev.sections.map(s => `• ${s.title}: ${s.correct}/${s.count}${s.cert ? ' (sertifikat ' + s.cert + ')' : ''} — ${s.points}`).join('\n') : '') +
    (wrong.length ? `\n❌ Xatolar: ${wrong.slice(0, 40).join(', ')}${wrong.length > 40 ? '…' : ''}` : '');
}

/* O'quvchi profili: daraja, aniqlik, top-3, natijalar ketma-ketligi. */
function studentProgress(studentId) {
  const items = [];
  let right = 0, total = 0, top3 = 0;
  for (const r of DB.resultsOfStudent(studentId)) {
    const t = DB.test(r.testId); if (!t) continue;
    const tb = Scoring.table(t);
    const row = tb.rows.find(x => x.r.id === r.id); if (!row) continue;
    right += row.ev.correct; total += row.ev.total;
    if (row.rank <= 3 && tb.rows.length >= 3) top3++;
    items.push({ r, t, ev: row.ev, R: row.T != null ? { T: row.T, grade: row.grade } : null, rank: row.rank, of: tb.rows.length, pct: row.T != null ? round1(row.T / 75 * 100) : row.ev.percent });
  }
  items.sort((a, b) => (a.t.date || '').localeCompare(b.t.date || ''));
  const accuracy = total ? Math.round(right / total * 100) : 0;
  const level = !items.length ? '—' : accuracy >= 86 ? "A'lo" : accuracy >= 70 ? 'Yuqori' : accuracy >= 50 ? "O'rta" : "Boshlang'ich";
  return { items, accuracy, top3, level };
}
function progressSvg(items) {
  const pts = items.slice(-15);
  if (pts.length < 2) return `<p class="small muted">Grafik uchun kamida 2 ta natija kerak.</p>`;
  const W = 600, H = 160, P = 24;
  const xy = pts.map((x, i) => [P + i * (W - 2 * P) / (pts.length - 1), H - P - (x.pct / 100) * (H - 2 * P)]);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto"><g stroke="var(--line)">${[0, 50, 100].map(v => `<line x1="${P}" x2="${W - P}" y1="${H - P - v / 100 * (H - 2 * P)}" y2="${H - P - v / 100 * (H - 2 * P)}"/>`).join('')}</g>
    <polyline fill="none" stroke="var(--pri)" stroke-width="3" points="${xy.map(p => p.join(',')).join(' ')}"/>
    ${xy.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--pri)"><title>${esc(pts[i].t.name)}: ${pts[i].pct}%</title></circle>`).join('')}
    <text x="${P}" y="14" font-size="12" fill="var(--muted)">%</text></svg>`;
}

function studentModal(s, after) {
  const groups = DB.myGroups();
  const certs = s ? (s.certs || []).map(c => Object.assign({}, c)) : [];
  const certRows = () => certs.map((c, i) => `<div class="row" style="margin-bottom:6px"><select class="in" data-cs="${i}">${SUBJECTS.map(x => `<option ${x === c.subject ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select><select class="in" data-cg="${i}" style="max-width:80px">${GRADES.map(g => `<option ${g === c.grade ? 'selected' : ''}>${g}</option>`).join('')}</select><input class="in" data-cp="${i}" type="number" min="0" max="100" step="0.1" placeholder="%" value="${c.percent ?? ''}" style="max-width:76px"><button type="button" class="btn sm danger" data-cx="${i}">✕</button></div>`).join('');
  modal(`<h2>${s ? "O'quvchini tahrirlash" : "Yangi o'quvchi"}</h2><form id="sf">
    <label class="f"><span>Ism familiya</span><input class="in" name="name" required value="${esc(s ? s.name : '')}"></label>
    <label class="f"><span>Telefon (botga ulanish uchun)</span><input class="in" name="phone" type="tel" value="${esc(s && s.phone ? '+' + s.phone : '')}"></label>
    <label class="f"><span>Guruh</span><select class="in" name="group"><option value="">— Guruhsiz —</option>${groups.map(g => `<option value="${g.id}" ${(s ? s.groupId : V._sg) === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
    <div class="f"><span class="small muted">Milliy sertifikatlar (fan · daraja · foiz). B+, B, C+, C uchun foiz shart.</span><div id="certs" style="margin-top:6px"></div><button type="button" class="btn sm" id="addc">＋ Sertifikat</button></div>
    ${s && s.tg ? `<label class="chk"><input type="checkbox" name="untg"> Telegram bog'lanishini uzish</label>` : ''}
    <div class="btns"><button type="button" class="btn sp" data-close>Bekor</button><button class="btn pri sp">Saqlash</button></div></form>`, (el, close) => {
    const rc = () => {
      $('#certs', el).innerHTML = certRows();
      $$('[data-cs]', el).forEach(x => x.onchange = () => certs[+x.dataset.cs].subject = x.value);
      $$('[data-cg]', el).forEach(x => x.onchange = () => certs[+x.dataset.cg].grade = x.value);
      $$('[data-cp]', el).forEach(x => x.oninput = () => certs[+x.dataset.cp].percent = x.value === '' ? null : Math.min(100, parseFloat(x.value)));
      $$('[data-cx]', el).forEach(x => x.onclick = () => { certs.splice(+x.dataset.cx, 1); rc(); });
    };
    rc();
    $('#addc', el).onclick = () => { certs.push({ subject: 'Matematika', grade: 'A', percent: null }); rc(); };
    $('#sf', el).onsubmit = e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      const miss = certs.find(c => !['A+', 'A'].includes(c.grade) && !(c.percent > 0));
      if (miss) { toast(`${miss.subject} (${miss.grade}) uchun sertifikat foizini kiriting`, 'err'); return; }
      const o = s || { id: DB.id(), createdAt: new Date().toISOString() };
      Object.assign(o, { name: f.name.trim(), phone: normPhone(f.phone), groupId: f.group, certs });
      if (f.untg) delete o.tg;
      if (!s) DB.data.students.push(o);
      DB.save(); close(); toast('Saqlandi'); after && after();
    };
  });
}

function bulkStudents(after) {
  const groups = DB.myGroups();
  if (!groups.length) { toast('Avval guruh yarating', 'err'); return; }
  modal(`<h2>Ro'yxatdan qo'shish</h2><form id="bf">
    <label class="f"><span>Guruh</span><select class="in" name="group">${groups.map(g => `<option value="${g.id}" ${V._sg === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
    <label class="f"><span>Har bir qatorda bitta o'quvchi (ixtiyoriy: ism, telefon)</span><textarea class="in" name="list" rows="8" placeholder="Aliyev Vali&#10;Karimova Nodira, 901234567"></textarea></label>
    <div class="btns"><button type="button" class="btn sp" data-close>Bekor</button><button class="btn pri sp">Qo'shish</button></div></form>`, (el, close) => {
    $('#bf', el).onsubmit = e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      let k = 0;
      f.list.split(/\r?\n/).map(x => x.trim()).filter(Boolean).forEach(line => {
        const [name, phone] = line.split(/[,;\t]/).map(x => x.trim());
        if (!name) return;
        DB.data.students.push({ id: DB.id(), name, phone: normPhone(phone), groupId: f.group, certs: [], createdAt: new Date().toISOString() }); k++;
      });
      DB.save(); close(); toast(`${k} ta o'quvchi qo'shildi`); after && after();
    };
  });
}

function groupModal(g) {
  const adm = DB.isAdmin();
  const teachers = DB.data.users;
  modal(`<h2>${g ? 'Guruhni tahrirlash' : 'Yangi guruh'}</h2><form id="gf">
    <label class="f"><span>Guruh nomi</span><input class="in" name="name" required value="${esc(g ? g.name : '')}" placeholder="Masalan: Matematika 1"></label>
    ${adm ? `<label class="f"><span>O'qituvchi</span><select class="in" name="teacher">${teachers.map(u => `<option value="${u.id}" ${(g ? g.teacherId : DB.me().id) === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>` : ''}
    <div class="btns">${g ? `<button type="button" class="btn danger" id="gd">O'chirish</button>` : ''}<button type="button" class="btn sp" data-close>Bekor</button><button class="btn pri sp">Saqlash</button></div></form>`, (el, close) => {
    $('#gf', el).onsubmit = e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      const o = g || { id: DB.id(), createdAt: new Date().toISOString() };
      o.name = f.name.trim(); o.teacherId = adm ? f.teacher : (g ? g.teacherId : DB.me().id);
      if (!g) DB.data.groups.push(o);
      DB.save(); close(); V.groups();
    };
    if ($('#gd', el)) $('#gd', el).onclick = async () => {
      close();
      if (await confirmBox(`"${g.name}" guruhi o'chirilsinmi? O'quvchilar guruhsiz qoladi.`)) { DB.removeGroup(g.id); DB.save(); V.groups(); }
    };
  });
}

function passModal(u) {
  modal(`<h2>Yangi parol — ${esc(u.name)}</h2><form id="pf"><label class="f"><span>Yangi parol</span><input class="in" name="p" type="password" minlength="4" required></label>
    <div class="btns"><button type="button" class="btn sp" data-close>Bekor</button><button class="btn pri sp">Saqlash</button></div></form>`, (el, close) => {
    $('#pf', el).onsubmit = async e => { e.preventDefault(); u.pass = await hashPass(new FormData(e.target).get('p')); DB.save(); close(); toast("Parol o'zgartirildi"); };
  });
}

function manualResult(t) {
  const students = DB.studentsOfGroups(t.groupIds);
  const hasTF = Core.qInfo(t).some(x => x.kind === 'tf');
  modal(`<h2>Qo'lda kiritish</h2><form id="mf">
    <label class="f"><span>O'quvchi</span><select class="in" name="s" required>${students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('') || DB.myStudents().map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
    <label class="f"><span>Variant</span><select class="in" name="v">${t.variants.map(v => `<option>${v.code}</option>`).join('')}</select></label>
    <label class="f"><span>Javoblar (ixtiyoriy, masalan ABCD…${hasTF ? ', T/F' : ''}; keyin tahrirlash mumkin)</span><input class="in" name="a" autocapitalize="characters"></label>
    <div class="btns"><button type="button" class="btn sp" data-close>Bekor</button><button class="btn pri sp">Davom etish</button></div></form>`, (el, close) => {
    $('#mf', el).onsubmit = e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      if (!f.s) { toast("O'quvchi yo'q", 'err'); return; }
      const n = Scoring.qCount(t);
      const a = quickToString(t, f.a || '', '-'.repeat(n)).value;
      const r = saveResult(t, f.s, f.v, a, 'manual');
      close(); location.hash = `#/result/${r.id}`;
    };
  });
}

function saveResult(t, studentId, variant, answers, source, image) {
  let r = studentId ? DB.data.results.find(x => x.testId === t.id && x.studentId === studentId) : null;
  if (!r) { r = { id: DB.id(), testId: t.id, studentId }; DB.data.results.push(r); }
  Object.assign(r, { variant, answers, source, scannedAt: new Date().toISOString() });
  if (image) r.image = image; else delete r.image;
  DB.save();
  return r;
}

/* Test natijalarini Excel'ga. */
function exportTestXlsx(t) {
  if (typeof XLSX === 'undefined') { toast("Excel kutubxonasi yuklanmadi (internet kerak)", 'err'); return; }
  const { rows } = Scoring.table(t);
  const info = Core.qInfo(t);
  const isR = t.type === 'rasch';
  const head = ["O'rin", "O'quvchi", 'Guruh', 'Variant', "To'g'ri", "Noto'g'ri", "Bo'sh", 'Ball', 'Maks', '%', ...(isR ? ['Rasch ball', 'Daraja'] : []), ...t.sections.map(s => s.title), ...info.map((_, i) => 'Q' + (i + 1))];
  const data = rows.map(x => [x.rank, x.name, x.group, x.r.variant, x.ev.correct, x.ev.wrong, x.ev.blank, x.ev.points, x.ev.max, x.ev.percent, ...(isR ? [x.T, x.grade] : []), ...x.ev.sections.map(s => s.points), ...info.map((q, i) => Core.show(q.sec, (x.r.answers || '')[i]))]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...data]), 'Natijalar');
  const keys = t.variants.map(v => { const k = Core.normKey(t, v.key); return ['Variant ' + v.code, ...info.map((q, i) => Core.show(q.sec, k[i]))]; });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['', ...info.map((_, i) => 'Q' + (i + 1))], ...keys]), 'Kalitlar');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  shareOrDownload(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `natijalar_${PDF.fname(t.name)}.xlsx`);
}
