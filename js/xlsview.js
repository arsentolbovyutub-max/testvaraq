/* Tayyor Excel jadvalni (EvalBee hisoboti yoki "Ism + javoblar" jadvali) yuklab, to'liq hisoblash. */
V.xls = function () {
  const st = V._xls || (V._xls = { R: null, parsed: null, file: '', opts: {} });
  const body = `<div class="card"><h3>📊 Excel jadvalni hisoblash</h3>
      <p class="small muted" style="margin-top:0">Qo'llab-quvvatlanadi: <b>EvalBee hisoboti</b> (Q1 Options / Key / Marks ustunlari) va oddiy jadval: <b>Ism | Raqam | 1 | 2 | 3 …</b>, birinchi qatorda <b>Kalit</b>. Variantlar A–F, True/False, ikki belgi ("C, F") — noto'g'ri.</p>
      <input type="file" id="xf" class="in" accept=".xlsx,.xls,.csv,.ods,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
      <div class="btns"><button class="btn sm" id="tpl">Bo'sh shablon (.xlsx)</button></div></div>
    <div id="xout"></div>`;
  layout('Excel hisoblash', body, { back: '#/more', tab: 'more' });
  if (typeof XLSX === 'undefined') { $('#xout').innerHTML = `<div class="card bad">Excel kutubxonasi yuklanmadi — internetni tekshirib sahifani yangilang.</div>`; return; }
  $('#tpl').onclick = () => {
    const n = 20;
    const rows = [['Ism', 'Raqam', ...Array.from({ length: n }, (_, i) => i + 1)], ['Kalit', '', ...Array.from({ length: n }, (_, i) => 'ABCD'[i % 4])], ['Aliyev Vali', '001'], ['Karimova Nodira', '002']];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Javoblar');
    shareOrDownload(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' }), 'shablon_javoblar.xlsx');
  };
  $('#xf').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' });
      const a = XlsCalc.analyze(XLSX, wb);
      if (a.error) { $('#xout').innerHTML = `<div class="card"><h3 class="bad">Hisoblab bo'lmadi</h3><p class="small">${esc(a.error)}</p></div>`; return; }
      Object.assign(st, { R: a.result, parsed: a.parsed, file: f.name, format: a.format, sections: a.result.sections.map(s => Object.assign({}, s)), negative: 0, raschMode: st.raschMode || 'bmba', raschMax: st.raschMax || 75 });
      recompute(); return;
      drawResult();
    } catch (err) { console.error(err); $('#xout').innerHTML = `<div class="card bad">Faylni o'qib bo'lmadi: ${esc(err.message)}</div>`; }
  };
  if (st.R) drawResult();

  function recompute() { st.R = XlsCalc.compute(st.parsed, { sections: st.sections, negative: st.negative, raschMode: st.raschMode, raschMax: st.raschMax }); drawResult(); }

  function drawResult() {
    const R = st.R, S = R.stats, ck = R.checks;
    const ok = ck.compared && !ck.total && !ck.rank && !ck.correct && !ck.topics;
    $('#xout').innerHTML = `
      <div class="card"><div class="row"><b>${esc(R.exam || st.file)}</b><span class="sp"></span><span class="badge">${st.format === 'evalbee' ? 'EvalBee' : 'Jadval'}</span></div>
        <div class="small muted">${S.count} o'quvchi · ${R.key.length} savol · maksimal ${R.maxPoints} ball</div>
        ${ck.compared ? `<p class="small ${ok ? 'ok' : 'bad'}" style="margin-bottom:0">${ok ? `✓ Hisob fayldagi ball, o'rin va mavzular bilan to'liq mos (${ck.compared}/${ck.compared})` : `⚠ Fayldagidan farq: ball ${ck.total}, o'rin ${ck.rank}, mavzu ${ck.topics} ta qatorda (ball sozlamalari o'zgargan bo'lishi mumkin)`}</p>` : ''}</div>
      <div class="grid4" style="margin-bottom:12px">
        <div class="stat"><b>${S.mean}</b><span>O'rtacha</span></div><div class="stat"><b>${S.median}</b><span>Mediana</span></div>
        <div class="stat"><b>${S.max}</b><span>Eng yuqori</span></div><div class="stat"><b>${S.min}</b><span>Eng past</span></div></div>
      <div class="card tw"><h3>Bo'limlar (mavzular)</h3><p class="small muted" style="margin-top:0">Fayldan avtomatik aniqlandi. Ballni o'zgartirsangiz qayta hisoblanadi.</p>
        <table class="t"><thead><tr><th>Bo'lim</th><th>Savollar</th><th>Turi</th><th class="num">Ball/savol</th><th class="num">O'rtacha</th></tr></thead><tbody>
        ${st.sections.map((s, i) => `<tr><td>${esc(s.title)}</td><td>${s.start + 1}–${s.start + s.count}</td><td>${s.kind === 'tf' ? 'True/False' : 'A–' + Core.LETTERS[s.options - 1]}</td><td class="num"><input class="in" data-w="${i}" type="number" step="0.1" min="0" value="${s.weight}" style="width:80px;min-height:32px;padding:4px 8px"></td><td class="num">${S.sectionStats[i].avg} / ${S.sectionStats[i].max}</td></tr>`).join('')}
        </tbody></table>
        <label class="f" style="margin-top:10px"><span>Noto'g'ri javob uchun ayiriladigan ball (0 — ayirilmaydi)</span><input class="in" id="neg" type="number" step="0.05" min="0" value="${st.negative}" style="max-width:140px"></label>
        ${S.kr20 != null ? `<p class="small muted" style="margin:0">Test ishonchliligi (KR-20): <b>${S.kr20}</b> ${S.kr20 >= 0.8 ? '— yaxshi' : S.kr20 >= 0.6 ? "— o'rtacha" : '— past'}</p>` : ''}</div>
      <div class="card"><h3>Rasch hisoblash</h3>
        <div class="grid2"><label class="f"><span>Usul</span><select class="in" id="rmode">${RASCH_MODES.map(([k, l]) => `<option value="${k}" ${st.raschMode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${st.raschMode === 'weighted' ? `<label class="f"><span>Savollar ballari yig'indisi</span><input class="in" id="rmax" type="number" min="10" max="1000" value="${st.raschMax}"></label>` : `<label class="f"><span>Maksimal ball</span><input class="in" value="Chegarasiz (shartli 75)" disabled></label>`}</div>
        <p class="small muted" style="margin:0">${RASCH_DESC[st.raschMode] || ''}${R.few ? ' <b class="bad">Ishtirokchi kam — natija taxminiy.</b>' : ''}</p>${st.raschMode !== 'weighted' ? `<p class="small muted" style="margin:6px 0 0">Hisob: ${R.method || 'CML'} · θ o'rtacha ${R.mu} · standart og'ish ${R.sd}</p>` : ''}</div>
      <div class="btns" style="margin:0 0 12px"><button class="btn pri sm" id="xx">⬇ Excel (to'liq hisob)</button><button class="btn sm" id="xp">PDF</button><button class="btn sm" id="xi">Ilovaga test sifatida saqlash</button></div>
      <div class="card tw" style="padding:4px 8px"><table class="t"><thead><tr><th>#</th><th>O'quvchi</th><th class="num">Ball</th><th>Daraja</th><th class="num">OTM foizi</th><th class="num">Xom ball</th><th class="num">%</th><th class="num">✓/✗/○</th>${R.sections.map(s => `<th class="num">${esc(s.title)}</th>`).join('')}</tr></thead><tbody>
        ${R.rows.map(r => `<tr><td>${r.rank}</td><td><b>${esc(r.name)}</b><div class="small muted">${esc(r.roll)}</div></td><td class="num"><b>${r.rasch.T}</b></td><td><span class="pill">${r.rasch.grade}</span></td><td class="num">${r.rasch.otm}%</td><td class="num">${r.points}</td><td class="num">${r.percent}</td><td class="num">${r.correct}/${r.wrong}/${r.blank}</td>${r.sections.map(s => `<td class="num">${s.points}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <div class="card tw"><h3>Savollar tahlili</h3><table class="t"><thead><tr><th>Savol</th><th>Kalit</th><th>To'g'ri</th><th style="width:28%"></th><th class="num">Savol balli</th><th class="num">Ajratish</th><th class="num">Qiyinlik</th><th>Javoblar</th></tr></thead><tbody>
        ${R.items.map(it => `<tr><td>${it.n}</td><td>${esc(it.key)}</td><td>${it.right}/${S.count}</td><td><div class="bar"><i style="width:${it.p}%;background:${it.p < 35 ? 'var(--bad)' : it.p < 65 ? 'var(--acc)' : 'var(--ok)'}"></i></div></td><td class="num"><b>${it.w}</b></td><td class="num ${it.disc < 0 ? 'bad' : ''}">${it.disc}</td><td class="num">${it.b}</td><td class="small muted">${Object.entries(it.dist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)}:${v}`).join(' ')}</td></tr>`).join('')}
      </tbody></table>
      ${R.items.filter(it => it.p === 0).length ? `<p class="small warnbox">⚠ Hech kim to'g'ri topmagan savollar: ${R.items.filter(it => it.p === 0).map(it => it.n).join(', ')} — kalitni tekshiring.</p>` : ''}
      ${R.items.filter(it => it.disc < 0).length ? `<p class="small warnbox">⚠ Manfiy ajratish (kuchli o'quvchilar ko'proq xato qilgan): ${R.items.filter(it => it.disc < 0).map(it => it.n).join(', ')} — savol yoki kalitni tekshiring.</p>` : ''}</div>`;
    $$('[data-w]').forEach(inp => inp.onchange = () => { st.sections[+inp.dataset.w].weight = Math.max(0, parseFloat(inp.value) || 0); recompute(); });
    $('#neg').onchange = e => { st.negative = Math.max(0, parseFloat(e.target.value) || 0); recompute(); };
    $('#rmode').onchange = e => { st.raschMode = e.target.value; recompute(); };
    if ($('#rmax')) $('#rmax').onchange = e => { st.raschMax = Math.max(10, Math.min(1000, parseFloat(e.target.value) || 75)); recompute(); };
    $('#xx').onclick = () => shareOrDownload(new Blob([XLSX.write(XlsCalc.toWorkbook(XLSX, st.R), { bookType: 'xlsx', type: 'array' })], { type: 'application/octet-stream' }), `hisob_${PDF.fname(st.file.replace(/\.\w+$/, ''))}.xlsx`);
    $('#xp').onclick = async () => {
      const doc = await PDF.doc('l');
      const T = s => PDF.T(doc, s);
      doc.setFontSize(15); doc.text(T(`Natijalar: ${R.exam || st.file}`), 14, 15);
      doc.setFontSize(9); doc.text(T(`${S.count} o'quvchi · o'rtacha ${S.mean} / ${R.maxPoints} · ${(DB.data.center || {}).name || ''}`), 14, 21);
      PDF.tbl(doc, { startY: 25, head: [['NO', T('ISM FAMILIYA'), 'Raqam', 'BALL', 'DARAJA', 'OTM FOIZI', T("To'g'ri"), T("Noto'g'ri"), T("Bo'sh"), ...R.sections.map(s => T(s.title))]],
        body: R.rows.map(r => [r.rank, T(r.name), r.roll, r.rasch.T.toFixed(2), r.rasch.grade, r.rasch.otm.toFixed(2) + '%', r.correct, r.wrong, r.blank, ...r.sections.map(s => s.points)]), theme: 'striped', styles: { fontSize: 8.5 } });
      doc.addPage();
      doc.setFontSize(13); doc.text(T('Savollar tahlili'), 14, 15);
      PDF.tbl(doc, { startY: 20, head: [['Savol', T("Bo'lim"), 'Kalit', T("To'g'ri"), '%', 'Savol balli', 'Ajratish', 'Qiyinlik']], body: R.items.map(it => [it.n, T(it.section), it.key, it.right, it.p, it.w, it.disc, it.b]), theme: 'grid', styles: { fontSize: 8, halign: 'center' } });
      shareOrDownload(doc.output('blob'), `hisob_${PDF.fname(st.file.replace(/\.\w+$/, ''))}.pdf`);
    };
    $('#xi').onclick = () => importAsTest();
  }

  function importAsTest() {
    const P = st.parsed, R = st.R;
    const conv = (v, multi) => (multi ? (String(v).split(',').every(L => 'ABCDEF'.includes(L)) ? Core.encSet(String(v).split(',')) : '*') : !v ? '-' : v === 'T' ? 'A' : v === 'F_' ? 'B' : v);
    const sections = st.sections.map(s => ({ title: s.title, subject: 'Boshqa', count: s.count, weight: s.weight, kind: s.kind === 'tf' ? 'tf' : 'choice', options: s.kind === 'tf' ? 2 : s.options }));
    const key = R.key.map(k => (k === 'True' ? 'A' : k === 'False' ? 'B' : k && k.includes(',') ? Core.encSet(k.split(',')) : k || '-')).join('');
    const name = (R.exam || st.file.replace(/\.\w+$/, '')).trim();
    const g = { id: DB.id(), name: 'Import: ' + name, teacherId: DB.me().id, createdAt: new Date().toISOString() };
    const t = { id: DB.id(), type: 'rasch', rasch: { mode: st.raschMode || 'bmba', max: st.raschMax || 75 }, name, date: today(), sections, variants: [{ code: 'A', key }], groupIds: [g.id], createdAt: new Date().toISOString(), createdBy: DB.me().id, source: 'excel' };
    DB.data.groups.push(g);
    DB.data.tests.push(t);
    let created = 0, matched = 0;
    for (const s of P.students) {
      const nm = (s.name || s.roll || "O'quvchi").trim();
      let stu = DB.data.students.find(x => x.name.trim().toLowerCase() === nm.toLowerCase());
      if (stu) matched++;
      else { stu = { id: DB.id(), name: nm, phone: '', groupId: g.id, certs: [], roll: s.roll, createdAt: new Date().toISOString() }; DB.data.students.push(stu); created++; }
      DB.data.results.push({ id: DB.id(), testId: t.id, studentId: stu.id, variant: 'A', answers: s.answers.map(a => conv(a.v, a.multi)).join(''), source: 'excel', scannedAt: new Date().toISOString() });
    }
    DB.save();
    toast(`Test saqlandi: ${P.students.length} natija (${created} yangi o'quvchi, ${matched} mavjud)`);
    location.hash = `#/test/${t.id}/natija`;
  }
};
