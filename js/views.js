/* Screens. Each view renders into #app and binds its own events. */
const TYPE_NAME = { block: 'Blok test', simple: 'Oddiy test', rasch: 'Rasch test' };

function layout(title, body, o = {}) {
  const tabs = [['home', '⌂', 'Asosiy'], ['tests', '✎', 'Testlar'], ['scan', '⌖', 'Skaner'], ['students', '☺', "O'quvchilar"], ['more', '☰', 'Yana']];
  const nav = o.noNav ? '' : `<nav class="nav">${tabs.map(([k, i, l]) =>
    `<a href="#/${k}" class="${k === 'scan' ? 'scan ' : ''}${o.tab === k ? 'on' : ''}"><span class="i">${i}</span>${l}</a>`).join('')}</nav>`;
  $('#app').innerHTML = `<header class="top">${o.back ? `<button class="ib" id="back" aria-label="Orqaga">←</button>` : ''}<h1>${esc(title)}</h1>${o.actions || ''}</header><main>${body}</main>${nav}`;
  if (o.back) $('#back').onclick = () => { location.hash = o.back; };
  window.scrollTo(0, 0);
}

function emptyBox(icon, text, btn) {
  return `<div class="empty"><div class="i">${icon}</div><p>${text}</p>${btn || ''}</div>`;
}

const V = {
  /* ---------- auth ---------- */
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
      ${DB.data.center ? `<p class="small" style="margin-top:16px"><a href="#/login">Hisobim bor — kirish</a></p>` : ''}
    </div>`;
    $('#f').onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (DB.data.center) { toast('Bu qurilmada markaz allaqachon bor', 'err'); return; }
      const u = { id: DB.id(), name: f.name.trim(), phone: normPhone(f.phone), role: 'admin', pass: await hashPass(f.pass) };
      DB.data.center = { name: f.center.trim(), phone: u.phone, createdAt: new Date().toISOString() };
      DB.data.users.push(u);
      DB.data.session = { userId: u.id };
      DB.save();
      toast('Xush kelibsiz!');
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
        <button class="btn pri block">Kirish</button>
      </form>
      <p class="muted small" style="margin-top:16px">O'qituvchilar hisobini markaz administratori ochib beradi.</p>
    </div>`;
    $('#f').onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const ph = normPhone(f.phone), hp = await hashPass(f.pass);
      const u = DB.data.users.find(x => x.phone === ph && x.pass === hp);
      if (!u) { toast("Telefon yoki parol noto'g'ri", 'err'); return; }
      DB.data.session = { userId: u.id }; DB.save();
      location.hash = '#/home';
    };
  },

  /* ---------- home ---------- */
  home() {
    const me = DB.me();
    const tests = DB.myTests().slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const tIds = new Set(tests.map(t => t.id));
    const res = DB.data.results.filter(r => tIds.has(r.testId)).sort((a, b) => (b.scannedAt || '').localeCompare(a.scannedAt || ''));
    const body = `
      <p class="muted" style="margin:0 0 12px">Salom, <b>${esc(me.name)}</b> · ${esc(DB.data.center.name)}</p>
      <div class="grid4" style="margin-bottom:14px">
        <a class="stat" href="#/tests" style="text-decoration:none;color:inherit"><b>${tests.length}</b><span>Testlar</span></a>
        <a class="stat" href="#/students" style="text-decoration:none;color:inherit"><b>${DB.myStudents().length}</b><span>O'quvchilar</span></a>
        <a class="stat" href="#/groups" style="text-decoration:none;color:inherit"><b>${DB.myGroups().length}</b><span>Guruhlar</span></a>
        <div class="stat"><b>${res.length}</b><span>Tekshirilgan varaqlar</span></div>
      </div>
      <div class="grid2" style="margin-bottom:16px">
        <a class="btn pri" href="#/test-new">＋ Yangi test</a>
        <a class="btn" href="#/scan">⌖ Varaq skanerlash</a>
      </div>
      <h3>So'nggi testlar</h3>
      ${tests.length ? tests.slice(0, 5).map(testItem).join('') : emptyBox('✎', "Hali test yo'q. Birinchi testni yarating.", '<a class="btn pri" href="#/test-new">Test yaratish</a>')}
      ${res.length ? `<h3 style="margin-top:18px">So'nggi natijalar</h3>` + res.slice(0, 6).map(resultItem).join('') : ''}
    `;
    layout('TestVaraq', body, { tab: 'home' });
  },

  /* ---------- tests ---------- */
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
    const st = {
      type: t ? t.type : 'block', name: t ? t.name : '', date: t ? t.date : today(),
      main1: t && t.type === 'block' ? t.sections[3].subject : 'Matematika', main2: t && t.type === 'block' ? t.sections[4].subject : 'Fizika',
      subject: t && t.type !== 'block' ? t.sections[0].subject : 'Matematika', count: t && t.type !== 'block' ? t.sections[0].count : 30,
      variants: t ? t.variants.length : 1, groupIds: t ? (t.groupIds || []).slice() : []
    };
    const subjOpts = sel => SUBJECTS.map(s => `<option ${s === sel ? 'selected' : ''}>${esc(s)}</option>`).join('');
    const draw = () => {
      const groups = DB.myGroups();
      const body = `<form id="f">
        <div class="card"><h3>Test turi</h3>
          <div class="tabs">${['block', 'simple', 'rasch'].map(k => `<button type="button" data-t="${k}" class="${st.type === k ? 'on' : ''}" ${t ? 'disabled' : ''}>${TYPE_NAME[k]}</button>`).join('')}</div>
          <p class="small muted" style="margin:0">${{
            block: "DTM formati: 3 ta majburiy fan (10 tadan, 1.1 ball) + 2 ta asosiy fan (30 tadan, 3.1 va 2.1 ball). 90 savol, 189 ball. Milliy sertifikat avtomatik hisobga olinadi.",
            simple: "Bitta fan, istalgan savol soni (1–120). Har bir to'g'ri javob 1 ball.",
            rasch: "Rasch modeli bo'yicha milliy sertifikatdagidek ball va daraja (A+ … C), har bir savol tahlili."
          }[st.type]}</p>
        </div>
        <div class="card">
          <label class="f"><span>Test nomi</span><input class="in" name="name" required value="${esc(st.name)}" placeholder="Masalan: 1-blok test, oktabr"></label>
          <label class="f"><span>Sana</span><input class="in" name="date" type="date" value="${esc(st.date)}"></label>
          ${st.type === 'block' ? `
            <div class="grid2">
              <label class="f"><span>1-asosiy fan (3.1 ball)</span><select class="in" name="main1">${subjOpts(st.main1)}</select></label>
              <label class="f"><span>2-asosiy fan (2.1 ball)</span><select class="in" name="main2">${subjOpts(st.main2)}</select></label>
            </div>` : `
            <div class="grid2">
              <label class="f"><span>Fan</span><select class="in" name="subject">${subjOpts(st.subject)}</select></label>
              <label class="f"><span>Savollar soni</span><input class="in" name="count" type="number" min="1" max="120" value="${st.count}"></label>
            </div>`}
          <label class="f"><span>Variantlar soni</span><select class="in" name="variants">${[1, 2, 3, 4, 5, 6, 7, 8].map(k => `<option ${k === st.variants ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        </div>
        <div class="card"><h3>Guruhlar</h3>
          ${groups.length ? groups.map(g => `<label class="chk"><input type="checkbox" name="g" value="${g.id}" ${st.groupIds.includes(g.id) ? 'checked' : ''}> ${esc(g.name)} <span class="muted small">· ${DB.studentsOfGroups([g.id]).length} o'quvchi</span></label>`).join('') : `<p class="muted small">Guruh yo'q. <a href="#/groups">Guruh qo'shing</a> — keyin o'quvchilar uchun varaqlar chiqarasiz.</p>`}
        </div>
        <button class="btn pri block">${t ? 'Saqlash' : 'Yaratish va kalitni kiritish'}</button>
      </form>`;
      layout(t ? 'Testni tahrirlash' : 'Yangi test', body, { back: t ? `#/test/${t.id}` : '#/tests', tab: 'tests' });
      const form = $('#f');
      const grab = () => {
        const fd = new FormData(form);
        st.name = fd.get('name'); st.date = fd.get('date');
        if (fd.get('main1')) { st.main1 = fd.get('main1'); st.main2 = fd.get('main2'); }
        if (fd.get('subject')) { st.subject = fd.get('subject'); st.count = Math.max(1, Math.min(120, parseInt(fd.get('count')) || 30)); }
        st.variants = parseInt(fd.get('variants')) || 1;
        st.groupIds = fd.getAll('g');
      };
      $$('[data-t]').forEach(b => b.onclick = () => { grab(); st.type = b.dataset.t; draw(); });
      form.onsubmit = e => {
        e.preventDefault(); grab();
        if (st.type === 'block' && st.main1 === st.main2) { toast('Asosiy fanlar har xil bo‘lsin', 'err'); return; }
        const sections = st.type === 'block' ? Scoring.blockSections(st.main1, st.main2) : [{ title: st.subject, subject: st.subject, count: st.count, weight: 1 }];
        const n = sections.reduce((a, s) => a + s.count, 0);
        const codes = 'ABCDEFGH'.split('').slice(0, st.variants);
        const old = t ? t.variants : [];
        const variants = codes.map(code => {
          const o = old.find(v => v.code === code);
          let key = o ? o.key : '';
          key = (key + '-'.repeat(n)).slice(0, n);
          return { code, key };
        });
        const obj = t || { id: DB.id(), createdAt: new Date().toISOString(), createdBy: DB.me().id };
        Object.assign(obj, { type: st.type, name: st.name.trim(), date: st.date, sections, variants, groupIds: st.groupIds });
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
    const keyDone = t.variants.every(v => !v.key.includes('-'));
    const head = `<div class="card">
      <div class="row"><span class="badge ${t.type}">${TYPE_NAME[t.type]}</span><span class="muted small">${fmtDate(t.date)} · ${n} savol${t.type !== 'rasch' ? ' · ' + Scoring.maxPoints(t) + ' ball' : ''} · ${t.variants.length} variant</span></div>
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
      const filled = v.key.split('').filter(x => x !== '-').length;
      c.innerHTML = `<div class="card">
        ${t.variants.length > 1 ? `<div class="tabs">${t.variants.map((x, i) => `<button data-v="${i}" class="${i === vi ? 'on' : ''}">Variant ${x.code}</button>`).join('')}</div>` : ''}
        <div class="row"><b>Variant ${v.code}</b><span class="sp"></span><span class="muted small">${filled} / ${v.key.length}</span></div>
        <label class="f" style="margin-top:10px"><span>Tez kiritish (masalan: ABCDA BCD…, bo'shliqlar e'tiborga olinmaydi)</span>
          <div class="row"><input class="in" id="quick" placeholder="ABCD…" autocapitalize="characters"><button class="btn" id="qapply">Qo'llash</button></div></label>
        <div class="keys" id="keys"></div>
        <div class="btns"><button class="btn pri" id="kpdf">Kalit PDF</button>${t.variants.length > 1 ? `<button class="btn" id="kcopy">Boshqa variantlarga nusxalash</button>` : ''}<button class="btn danger" id="kclr">Tozalash</button></div>
      </div>`;
      renderKeyGrid($('#keys', c), t, v.key, (q, opt) => {
        const arr = v.key.split(''); arr[q] = arr[q] === opt ? '-' : opt; v.key = arr.join(''); DB.save();
        return v.key;
      });
      $$('[data-v]', c).forEach(b => b.onclick = () => { vi = +b.dataset.v; V._kv = { t: t.id, i: vi }; draw(); });
      $('#qapply', c).onclick = () => {
        const s = $('#quick', c).value.toUpperCase().replace(/[^ABCD\-]/g, '');
        if (!s) return;
        v.key = (s + v.key.slice(s.length)).slice(0, v.key.length);
        DB.save(); toast(`${Math.min(s.length, v.key.length)} ta javob kiritildi`); draw();
      };
      $('#kclr', c).onclick = async () => { if (await confirmBox(`Variant ${v.code} kaliti tozalansinmi?`, 'Tozalash')) { v.key = '-'.repeat(v.key.length); DB.save(); draw(); } };
      if ($('#kcopy', c)) $('#kcopy', c).onclick = async () => {
        if (await confirmBox(`Variant ${v.code} kaliti boshqa barcha variantlarga yoziladi.`, 'Nusxalash')) { t.variants.forEach(x => x.key = v.key); DB.save(); toast('Nusxalandi'); }
      };
      $('#kpdf', c).onclick = async () => shareOrDownload(PDF.key(t), `kalit_${PDF.fname(t.name)}.pdf`);
    };
    draw();
  },

  tabSheets(t, c) {
    const groups = (t.groupIds || []).map(g => DB.group(g)).filter(Boolean);
    const students = DB.studentsOfGroups(t.groupIds);
    c.innerHTML = `<div class="card"><h3>O'quvchilar uchun varaqlar</h3>
      <p class="small muted" style="margin-top:0">Har bir varaqda QR kod bor: skaner testni, o'quvchini va variantni o'zi aniqlaydi.</p>
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
    c.innerHTML = `<div class="btns" style="margin:0 0 12px">
        <a class="btn pri sm" href="#/scan/${t.id}">⌖ Skanerlash</a>
        <button class="btn sm" id="man">＋ Qo'lda kiritish</button>
        ${rows.length ? `<button class="btn sm" id="rpdf">Natijalar PDF</button><button class="btn sm" id="tg">Telegramga ulashish</button>` : ''}
      </div>
      ${rasch && rasch.few ? `<p class="small" style="color:var(--acc)">Rasch hisobi uchun kamida 3 ta natija kerak. Hozircha ball to'g'ri javoblar ulushidan hisoblandi.</p>` : ''}
      ${rows.length ? `<div class="card tw" style="padding:4px 8px"><table class="t"><thead><tr><th>#</th><th>O'quvchi</th>${isR ? `<th class="num">To'g'ri</th><th class="num">Ball</th><th>Daraja</th>` : `<th class="num">To'g'ri</th><th class="num">Ball</th><th class="num">%</th>`}</tr></thead><tbody>
        ${rows.map(x => `<tr class="click" data-r="${x.r.id}"><td>${x.rank}</td><td><b>${esc(x.name)}</b><div class="small muted">${esc(x.group)} · ${x.r.variant}</div></td>
          ${isR ? `<td class="num">${x.ev.correct}/${x.ev.total}</td><td class="num"><b>${x.T}</b></td><td><span class="pill">${x.grade}</span></td>`
               : `<td class="num">${x.ev.correct}/${x.ev.total}</td><td class="num"><b>${x.ev.points}</b>${x.ev.sections.some(s => s.cert) ? ' <span class="badge">S</span>' : ''}</td><td class="num">${x.ev.percent}%</td>`}</tr>`).join('')}
      </tbody></table></div>` : emptyBox('⌖', "Hali natija yo'q. Javob varaqalarini skanerlang.")}`;
    $$('[data-r]', c).forEach(tr => tr.onclick = () => location.hash = `#/result/${tr.dataset.r}`);
    $('#man', c).onclick = () => manualResult(t);
    if ($('#rpdf', c)) $('#rpdf', c).onclick = () => shareOrDownload(PDF.results(t), `natijalar_${PDF.fname(t.name)}.pdf`);
    if ($('#tg', c)) $('#tg', c).onclick = () => {
      const lines = rows.slice(0, 30).map(x => `${x.rank}. ${x.name} — ${isR ? x.T + ' (' + x.grade + ')' : x.ev.points + ' ball'}`);
      const text = `📊 ${t.name} (${fmtDate(t.date)})\n${DB.data.center.name}\n\n${lines.join('\n')}`;
      window.open('https://t.me/share/url?url=' + encodeURIComponent(' ') + '&text=' + encodeURIComponent(text), '_blank');
    };
  },

  tabAnalysis(t, c) {
    const { rows, rasch } = Scoring.table(t);
    if (!rows.length) { c.innerHTML = emptyBox('▥', "Tahlil uchun natijalar kerak"); return; }
    const n = Scoring.qCount(t);
    const right = new Array(n).fill(0), blank = new Array(n).fill(0);
    rows.forEach(x => x.ev.marks.forEach((m, i) => { if (m === 1) right[i]++; if (m === -1) blank[i]++; }));
    const sc = rows.map(x => x.score);
    const avg = round1(sc.reduce((a, b) => a + b, 0) / sc.length);
    const grades = {};
    if (rasch) rows.forEach(x => grades[x.grade] = (grades[x.grade] || 0) + 1);
    const hard = right.map((r, i) => [r / rows.length, i]).sort((a, b) => a[0] - b[0]).slice(0, 5);
    c.innerHTML = `<div class="grid4" style="margin-bottom:12px">
        <div class="stat"><b>${rows.length}</b><span>Ishtirokchi</span></div>
        <div class="stat"><b>${avg}</b><span>O'rtacha ball</span></div>
        <div class="stat"><b>${round1(Math.max(...sc))}</b><span>Eng yuqori</span></div>
        <div class="stat"><b>${round1(Math.min(...sc))}</b><span>Eng past</span></div>
      </div>
      ${rasch ? `<div class="card"><h3>Darajalar</h3><div class="row wrap">${['A+', ...GRADES.slice(1), '—'].map(g => `<div class="stat" style="min-width:70px;text-align:center"><b>${grades[g] || 0}</b><span>${g}</span></div>`).join('')}</div></div>` : ''}
      ${t.sections.length > 1 ? `<div class="card"><h3>Fanlar bo'yicha o'rtacha</h3>${t.sections.map((s, si) => {
        const a = rows.reduce((acc, x) => acc + x.ev.sections[si].correct, 0) / rows.length;
        return `<div style="margin-bottom:8px"><div class="row small"><span>${esc(s.title)}</span><span class="sp"></span><b>${round1(a)} / ${s.count}</b></div><div class="bar"><i style="width:${a / s.count * 100}%"></i></div></div>`;
      }).join('')}</div>` : ''}
      <div class="card"><h3>Eng qiyin savollar</h3>${hard.map(([p, i]) => `<span class="pill" style="margin:2px">${i + 1}-savol · ${Math.round(p * 100)}%</span>`).join('')}</div>
      <div class="card tw"><h3>Har bir savol tahlili</h3><table class="t"><thead><tr><th>Savol</th><th>To'g'ri</th><th style="width:40%"></th><th class="num">Bo'sh</th>${rasch ? '<th class="num">Qiyinlik</th>' : ''}</tr></thead><tbody>
        ${right.map((r, i) => `<tr><td>${i + 1}</td><td>${r}/${rows.length}</td><td><div class="bar"><i style="width:${r / rows.length * 100}%;background:${r / rows.length < .35 ? 'var(--bad)' : r / rows.length < .65 ? 'var(--acc)' : 'var(--ok)'}"></i></div></td><td class="num">${blank[i]}</td>${rasch ? `<td class="num">${rasch.items[i].b}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>`;
  },

  /* ---------- result ---------- */
  result(id) {
    const r = DB.result(id);
    if (!r) { location.hash = '#/tests'; return; }
    const t = DB.test(r.testId);
    if (!t) { location.hash = '#/tests'; return; }
    const st = r.studentId ? DB.student(r.studentId) : null;
    const draw = () => {
      const ev = Scoring.evaluate(t, r);
      const R = t.type === 'rasch' ? Scoring.rasch(t, DB.resultsOfTest(t.id)).byResult[r.id] : null;
      const key = Scoring.variantOf(t, r.variant).key;
      const body = `<div class="card">
          <div class="row"><div class="av">${esc(initials(st ? st.name : '?'))}</div><div><div class="t"><b>${esc(st ? st.name : (r.guestName || "Noma'lum o'quvchi"))}</b></div><div class="small muted">${esc(t.name)} · ${fmtDate(t.date)}</div></div></div>
          <hr>
          <div class="row wrap">
            ${R ? `<div><div class="score">${R.T}</div><div class="small muted">Rasch ball</div></div><span class="grade">${R.grade}</span>`
                : `<div><div class="score">${ev.points}<span class="muted" style="font-size:16px"> / ${ev.max}</span></div><div class="small muted">Ball · ${ev.percent}%</div></div>`}
            <span class="sp"></span>
            <div class="small"><div class="ok">✓ To'g'ri: <b>${ev.correct}</b></div><div class="bad">✗ Noto'g'ri: <b>${ev.wrong}</b></div><div class="muted">○ Bo'sh: <b>${ev.blank}</b></div></div>
          </div>
          <label class="f" style="margin-top:12px"><span>Variant</span><select class="in" id="var">${t.variants.map(v => `<option ${v.code === r.variant ? 'selected' : ''}>${v.code}</option>`).join('')}</select></label>
          <div class="btns"><button class="btn sm" id="pdf">PDF hisobot</button><button class="btn sm" id="tg">Telegramga</button><button class="btn sm danger" id="del">O'chirish</button></div>
        </div>
        ${t.sections.length > 1 ? `<div class="card"><h3>Fanlar</h3><table class="t"><tbody>${ev.sections.map(s => `<tr><td>${esc(s.title)}${s.cert ? ` <span class="badge">Sertifikat ${s.cert}</span>` : ''}</td><td class="num">${s.correct}/${s.count}</td><td class="num"><b>${s.points}</b> / ${s.max}</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${r.image ? `<div class="card"><h3>Skanerlangan varaq</h3><img class="preview" src="${r.image}" alt=""></div>` : ''}
        <div class="card"><h3>Javoblar</h3><p class="small muted" style="margin-top:0">Noto'g'ri tanilgan bo'lsa, to'g'ri variantni bosing. Yashil chegarali — kalit.</p><div class="keys" id="ans"></div></div>`;
      layout('Natija', body, { back: `#/test/${t.id}/natija`, tab: 'tests' });
      renderKeyGrid($('#ans'), t, r.answers, (q, opt) => {
        const a = r.answers.split(''); a[q] = a[q] === opt ? '-' : opt; r.answers = a.join(''); DB.save();
        setTimeout(draw, 0); return r.answers;
      }, key);
      $('#var').onchange = e => { r.variant = e.target.value; DB.save(); draw(); };
      $('#del').onclick = async () => { if (await confirmBox("Natija o'chirilsinmi?")) { DB.data.results = DB.data.results.filter(x => x.id !== r.id); DB.save(); location.hash = `#/test/${t.id}/natija`; } };
      $('#pdf').onclick = () => shareOrDownload(PDF.studentReport(t, r), `natija_${PDF.fname(st ? st.name : 'oquvchi')}.pdf`);
      $('#tg').onclick = () => {
        const text = `📝 ${t.name} (${fmtDate(t.date)})\n👤 ${st ? st.name : ''}\n` + (R ? `Ball: ${R.T} · Daraja: ${R.grade}` : `Ball: ${ev.points} / ${ev.max} (${ev.percent}%)`) +
          `\nTo'g'ri: ${ev.correct}/${ev.total}` + (t.sections.length > 1 ? '\n' + ev.sections.map(s => `• ${s.title}: ${s.correct}/${s.count}${s.cert ? ' (sertifikat ' + s.cert + ')' : ''} — ${s.points}`).join('\n') : '');
        window.open('https://t.me/share/url?url=' + encodeURIComponent(' ') + '&text=' + encodeURIComponent(text), '_blank');
      };
    };
    draw();
  },

  /* ---------- students ---------- */
  students() {
    const q = (V._sq || '').toLowerCase(), gf = V._sg || '';
    const groups = DB.myGroups();
    const list = DB.myStudents().filter(s => (!gf || s.groupId === gf) && (!q || s.name.toLowerCase().includes(q) || (s.phone || '').includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
    const body = `<div class="row" style="margin-bottom:12px"><input class="in" id="q" placeholder="Qidirish…" value="${esc(V._sq || '')}">
        <select class="in" id="g" style="max-width:40%"><option value="">Barcha guruhlar</option>${groups.map(g => `<option value="${g.id}" ${g.id === gf ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
      <div class="btns" style="margin:0 0 12px"><button class="btn pri sm" id="add">＋ O'quvchi</button><button class="btn sm" id="bulk">Ro'yxatdan qo'shish</button><a class="btn sm" href="#/groups">Guruhlar</a></div>
      <div class="muted small" style="margin-bottom:6px">${list.length} ta o'quvchi</div>
      ${list.length ? list.map(s => { const g = DB.group(s.groupId); return `<a class="li" href="#/student/${s.id}"><div class="av">${esc(initials(s.name))}</div><div class="sp"><div class="t">${esc(s.name)}</div><div class="s">${esc(g ? g.name : 'Guruhsiz')}${s.phone ? ' · +' + esc(s.phone) : ''}${(s.certs || []).length ? ' · 🎓 ' + s.certs.map(c => esc(c.subject.split(' ')[0]) + ' ' + c.grade).join(', ') : ''}</div></div></a>`; }).join('')
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
    const res = DB.resultsOfStudent(s.id).map(r => ({ r, t: DB.test(r.testId) })).filter(x => x.t).sort((a, b) => (b.t.date || '').localeCompare(a.t.date || ''));
    const body = `<div class="card"><div class="row"><div class="av">${esc(initials(s.name))}</div><div class="sp"><b>${esc(s.name)}</b><div class="small muted">${esc(g ? g.name : 'Guruhsiz')}${s.phone ? ' · +' + esc(s.phone) : ''}</div></div></div>
        ${(s.certs || []).length ? `<hr><div class="small"><b>Milliy sertifikatlar:</b> ${s.certs.map(c => `<span class="pill" style="margin:2px">${esc(c.subject)} · ${c.grade}</span>`).join('')}</div>` : ''}
        <div class="btns"><button class="btn sm" id="ed">Tahrirlash</button><button class="btn sm danger" id="del">O'chirish</button></div></div>
      <h3>Natijalar tarixi</h3>
      ${res.length ? res.map(({ r, t }) => {
        const ev = Scoring.evaluate(t, r);
        const R = t.type === 'rasch' ? Scoring.rasch(t, DB.resultsOfTest(t.id)).byResult[r.id] : null;
        return `<a class="li" href="#/result/${r.id}"><div class="sp"><div class="t">${esc(t.name)}</div><div class="s"><span class="badge ${t.type}">${TYPE_NAME[t.type]}</span> ${fmtDate(t.date)}</div></div><div style="text-align:right"><b>${R ? R.T + ' · ' + R.grade : ev.points}</b><div class="s">${ev.correct}/${ev.total}</div></div></a>`;
      }).join('') : emptyBox('▥', "Natijalar yo'q")}`;
    layout(s.name, body, { back: '#/students', tab: 'students' });
    $('#ed').onclick = () => studentModal(s, () => V.student(id));
    $('#del').onclick = async () => { if (await confirmBox(`${s.name} va uning natijalari o'chiriladi.`)) { DB.removeStudent(s.id); DB.save(); location.hash = '#/students'; } };
  },

  /* ---------- groups ---------- */
  groups() {
    const groups = DB.myGroups().slice().sort((a, b) => a.name.localeCompare(b.name));
    const body = `<button class="btn pri block" id="add" style="margin-bottom:12px">＋ Guruh qo'shish</button>
      ${groups.length ? groups.map(g => { const tch = DB.user(g.teacherId); return `<div class="li" data-g="${g.id}"><div class="av">${esc(initials(g.name))}</div><div class="sp"><div class="t">${esc(g.name)}</div><div class="s">${DB.studentsOfGroups([g.id]).length} o'quvchi${tch ? ' · ' + esc(tch.name) : ''}</div></div><button class="btn sm" data-e="${g.id}">✎</button></div>`; }).join('') : emptyBox('☷', "Guruhlar yo'q")}`;
    layout('Guruhlar', body, { back: '#/more', tab: 'more' });
    $('#add').onclick = () => groupModal(null);
    $$('[data-g]').forEach(el => el.onclick = e => { if (e.target.closest('[data-e]')) return; V._sg = el.dataset.g; V._sq = ''; location.hash = '#/students'; });
    $$('[data-e]').forEach(b => b.onclick = () => groupModal(DB.group(b.dataset.e)));
  },

  /* ---------- teachers ---------- */
  teachers() {
    if (!DB.isAdmin()) { location.hash = '#/more'; return; }
    const us = DB.data.users;
    const body = `<button class="btn pri block" id="add" style="margin-bottom:12px">＋ O'qituvchi qo'shish</button>
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

  /* ---------- more ---------- */
  more() {
    const me = DB.me(), adm = DB.isAdmin();
    const body = `<div class="card"><div class="row"><div class="av">${esc(initials(me.name))}</div><div class="sp"><b>${esc(me.name)}</b><div class="small muted">+${esc(me.phone)} · ${adm ? 'Administrator' : "O'qituvchi"}</div></div></div>
        <div class="small muted" style="margin-top:8px">${esc(DB.data.center.name)}</div></div>
      <a class="li" href="#/groups"><span class="av">☷</span><span class="sp t">Guruhlar</span>›</a>
      ${adm ? `<a class="li" href="#/teachers"><span class="av">☻</span><span class="sp t">O'qituvchilar</span>›</a>` : ''}
      ${adm ? `<a class="li" href="#/settings"><span class="av">⚙</span><span class="sp t">Sozlamalar va milliy sertifikat</span>›</a>` : ''}
      <a class="li" href="#/backup"><span class="av">⇅</span><span class="sp t">Zaxira nusxa (eksport / import)</span>›</a>
      <a class="li" href="#/help"><span class="av">?</span><span class="sp t">Qo'llanma</span>›</a>
      <div class="li" id="pw"><span class="av">🔑</span><span class="sp t">Parolni o'zgartirish</span>›</div>
      <div class="li" id="out"><span class="av">⏻</span><span class="sp t bad">Chiqish</span></div>`;
    layout('Yana', body, { tab: 'more' });
    $('#out').onclick = () => { DB.data.session = null; DB.save(); location.hash = '#/login'; };
    $('#pw').onclick = () => passModal(me);
  },

  settings() {
    if (!DB.isAdmin()) { location.hash = '#/more'; return; }
    const cp = DB.data.settings.certPercent;
    const body = `<form id="f"><div class="card"><h3>O'quv markaz</h3>
        <label class="f"><span>Nomi (varaqlarda chiqadi)</span><input class="in" name="center" value="${esc(DB.data.center.name)}" required></label></div>
      <div class="card"><h3>Milliy sertifikat (blok testlar)</h3>
        <p class="small muted" style="margin-top:0">O'quvchida shu fandan sertifikat bo'lsa, blok testda o'sha fan uchun maksimal ballning necha foizi beriladi. Sertifikatlar o'quvchi kartasida kiritiladi.</p>
        <div class="grid2">${GRADES.map(g => `<label class="f"><span>${g}</span><input class="in" type="number" min="0" max="100" name="c_${g}" value="${cp[g] ?? 100}"></label>`).join('')}</div></div>
      <button class="btn pri block">Saqlash</button></form>
      <div class="card" style="margin-top:16px"><h3 class="bad">Xavfli hudud</h3><p class="small muted">Shu qurilmadagi barcha ma'lumotlar o'chiriladi.</p><button class="btn danger" id="wipe">Hammasini o'chirish</button></div>`;
    layout('Sozlamalar', body, { back: '#/more', tab: 'more' });
    $('#f').onsubmit = e => {
      e.preventDefault(); const fd = new FormData(e.target);
      DB.data.center.name = fd.get('center').trim();
      GRADES.forEach(g => cp[g] = Math.max(0, Math.min(100, parseFloat(fd.get('c_' + g)) || 0)));
      DB.save(); toast('Saqlandi');
    };
    $('#wipe').onclick = async () => {
      if (await confirmBox("Barcha testlar, o'quvchilar va natijalar butunlay o'chiriladi. Avval zaxira oling!", "Ha, o'chirish")) {
        localStorage.removeItem(DB_KEY); DB.load(); location.hash = '#/register';
      }
    };
  },

  backup() {
    const body = `<div class="card"><h3>Eksport</h3><p class="small muted" style="margin-top:0">Ma'lumotlar shu qurilma brauzerida saqlanadi. Muntazam zaxira oling va boshqa qurilmaga ko'chirish uchun import qiling.</p>
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
    const body = `<div class="card"><h3>1. Guruh va o'quvchilar</h3><p class="small">Guruhlar bo'limida guruh yarating, so'ng O'quvchilar bo'limida o'quvchilarni qo'shing (bittadan yoki ro'yxat bilan). Milliy sertifikati bor o'quvchiga sertifikat fan va darajasini kiriting.</p></div>
      <div class="card"><h3>2. Test yaratish</h3><p class="small"><b>Blok</b> — DTM formati (90 savol, 189 ball). <b>Oddiy</b> — bitta fan, istalgan savol soni. <b>Rasch</b> — milliy sertifikat uslubida ball va daraja. Har bir variant uchun javob kalitini kiriting.</p></div>
      <div class="card"><h3>3. Varaqlarni chop etish</h3><p class="small">Test → Javob varaqalari → PDF. Har bir varaqda o'quvchi ismi va QR kod bor. A4 qog'ozga 100% masshtabda chop eting.</p></div>
      <div class="card"><h3>4. Skanerlash</h3><p class="small">Skaner → kamerani varaqqa qarating: 4 ta qora burchak va QR kadrga tushsin. Yorug' joyda, soyasiz, varaqni tekis qo'yib suratga oling. Natija darhol chiqadi — kerak bo'lsa javobni qo'lda tuzating va saqlang.</p></div>
      <div class="card"><h3>5. Natijalar</h3><p class="small">Reyting, fanlar bo'yicha ball, savollar tahlili. PDF yoki Telegram orqali ulashing.</p></div>`;
    layout("Qo'llanma", body, { back: '#/more', tab: 'more' });
  }
};

/* ---------- shared widgets ---------- */
function testItem(t) {
  const rc = DB.resultsOfTest(t.id).length;
  return `<a class="li" href="#/test/${t.id}"><div class="sp"><div class="t">${esc(t.name)}</div><div class="s"><span class="badge ${t.type}">${TYPE_NAME[t.type]}</span> ${fmtDate(t.date)} · ${Scoring.qCount(t)} savol</div></div><div style="text-align:right"><b>${rc}</b><div class="s">natija</div></div></a>`;
}
function resultItem(r) {
  const t = DB.test(r.testId); if (!t) return '';
  const s = r.studentId ? DB.student(r.studentId) : null;
  const ev = Scoring.evaluate(t, r);
  return `<a class="li" href="#/result/${r.id}"><div class="av">${esc(initials(s ? s.name : '?'))}</div><div class="sp"><div class="t">${esc(s ? s.name : "Noma'lum")}</div><div class="s">${esc(t.name)}</div></div><div style="text-align:right"><b>${ev.points}</b><div class="s">${ev.correct}/${ev.total}</div></div></a>`;
}

/* Grid of A–D buttons per question. value: string; key (optional) highlights right/wrong. */
function renderKeyGrid(el, t, value, onPick, key) {
  const n = Scoring.qCount(t);
  let html = '', start = 0, si = 0;
  for (let q = 0; q < n; q++) {
    if (t.sections.length > 1 && q === start) { html += `<div class="sec-h">${esc(t.sections[si].title)} (${start + 1}–${start + t.sections[si].count})</div>`; start += t.sections[si].count; si++; }
    html += `<div class="kr"><span class="n">${q + 1}.</span>${OPTIONS.map(o => {
      let cls = '';
      const v = value[q];
      if (v === o) cls = key ? (key[q] && key[q] !== '-' ? (key[q] === o ? 'ok' : 'no') : 'on') : 'on';
      if (key && key[q] === o && v !== o) cls += ' key';
      return `<button type="button" class="kb ${cls}" data-q="${q}" data-o="${o}">${o}</button>`;
    }).join('')}${value[q] === '*' ? '<span class="small" style="color:var(--acc)">2+</span>' : ''}</div>`;
  }
  el.innerHTML = html;
  el.onclick = e => {
    const b = e.target.closest('.kb'); if (!b) return;
    const q = +b.dataset.q;
    const nv = onPick(q, b.dataset.o);
    if (!key) $$(`.kb[data-q="${q}"]`, el).forEach(x => x.classList.toggle('on', nv[q] === x.dataset.o));
  };
}

function studentModal(s, after) {
  const groups = DB.myGroups();
  const certs = s ? (s.certs || []).map(c => Object.assign({}, c)) : [];
  const certRows = () => certs.map((c, i) => `<div class="row" style="margin-bottom:6px"><select class="in" data-cs="${i}">${SUBJECTS.map(x => `<option ${x === c.subject ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select><select class="in" data-cg="${i}" style="max-width:90px">${GRADES.map(g => `<option ${g === c.grade ? 'selected' : ''}>${g}</option>`).join('')}</select><button type="button" class="btn sm danger" data-cx="${i}">✕</button></div>`).join('');
  modal(`<h2>${s ? "O'quvchini tahrirlash" : "Yangi o'quvchi"}</h2><form id="sf">
    <label class="f"><span>Ism familiya</span><input class="in" name="name" required value="${esc(s ? s.name : '')}"></label>
    <label class="f"><span>Telefon (ixtiyoriy)</span><input class="in" name="phone" type="tel" value="${esc(s && s.phone ? '+' + s.phone : '')}"></label>
    <label class="f"><span>Guruh</span><select class="in" name="group"><option value="">— Guruhsiz —</option>${groups.map(g => `<option value="${g.id}" ${(s ? s.groupId : V._sg) === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
    <div class="f"><span class="small muted">Milliy sertifikatlar</span><div id="certs" style="margin-top:6px"></div><button type="button" class="btn sm" id="addc">＋ Sertifikat</button></div>
    <div class="btns"><button type="button" class="btn sp" data-close>Bekor</button><button class="btn pri sp">Saqlash</button></div></form>`, (el, close) => {
    const rc = () => {
      $('#certs', el).innerHTML = certRows();
      $$('[data-cs]', el).forEach(x => x.onchange = () => certs[+x.dataset.cs].subject = x.value);
      $$('[data-cg]', el).forEach(x => x.onchange = () => certs[+x.dataset.cg].grade = x.value);
      $$('[data-cx]', el).forEach(x => x.onclick = () => { certs.splice(+x.dataset.cx, 1); rc(); });
    };
    rc();
    $('#addc', el).onclick = () => { certs.push({ subject: 'Matematika', grade: 'A' }); rc(); };
    $('#sf', el).onsubmit = e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      const o = s || { id: DB.id(), createdAt: new Date().toISOString() };
      Object.assign(o, { name: f.name.trim(), phone: normPhone(f.phone), groupId: f.group, certs });
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
  modal(`<h2>Qo'lda kiritish</h2><form id="mf">
    <label class="f"><span>O'quvchi</span><select class="in" name="s" required>${students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('') || DB.myStudents().map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
    <label class="f"><span>Variant</span><select class="in" name="v">${t.variants.map(v => `<option>${v.code}</option>`).join('')}</select></label>
    <label class="f"><span>Javoblar (ixtiyoriy, masalan ABCD…; keyin tahrirlash mumkin)</span><input class="in" name="a" autocapitalize="characters"></label>
    <div class="btns"><button type="button" class="btn sp" data-close>Bekor</button><button class="btn pri sp">Davom etish</button></div></form>`, (el, close) => {
    $('#mf', el).onsubmit = e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      if (!f.s) { toast("O'quvchi yo'q", 'err'); return; }
      const n = Scoring.qCount(t);
      const a = (f.a || '').toUpperCase().replace(/[^ABCD\-]/g, '');
      const r = saveResult(t, f.s, f.v, (a + '-'.repeat(n)).slice(0, n), 'manual');
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
