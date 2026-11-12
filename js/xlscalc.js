/* Tayyor Excel jadvallarini (EvalBee hisobotlari va oddiy "ism + javoblar" jadvallari) o'qish va to'liq hisoblash.
   Brauzerda XLSX (SheetJS) global obyekti bilan ishlaydi; Node'da testlash uchun module.exports. */
const XlsCalc = (() => {
  const CoreRef = typeof Core !== 'undefined' ? Core : (typeof require !== 'undefined' ? require('./core.js') : null);
  const LETTERS = 'ABCDEF';
  const norm = v => (v == null ? '' : String(v)).trim();
  const low = v => norm(v).toLowerCase().replace(/[‘’ʻʼ`']/g, "'");
  const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(x) ? null : x; };
  const r2 = x => Math.round(x * 100) / 100;

  /* Javob katakchasini normallashtirish: '' -> blank, 'A' -> 'A', 'True' -> 'T', 'C, F' -> multi. */
  function cell(v) {
    const s = norm(v);
    if (!s || s === '-' || s === '—') return { v: '', multi: false };
    const parts = s.split(/[,;/|]+|\s+/).map(p => p.trim()).filter(Boolean).map(p => {
      const l = p.toLowerCase();
      if (l === 'true' || l === 't' || l === "to'g'ri" || l === 'ha') return 'T';
      if (l === 'false' || l === 'f_' || l === "noto'g'ri" || l === "yo'q") return 'F_';
      return p.toUpperCase();
    });
    if (parts.length > 1) return { v: parts.join(','), multi: true };
    return { v: parts[0], multi: false };
  }
  const isTF = k => k === 'T' || k === 'F_';
  /* Bir nechta to'g'ri javobli savollar (kalit "A, D"): to'plamlar teng bo'lsa to'g'ri. */
  const sameAns = (a, k) => !!a && !!k && String(a).split(',').sort().join(',') === String(k).split(',').sort().join(',');
  const show = v => (v === 'T' ? 'True' : v === 'F_' ? 'False' : v);

  /* Ish varag'idan 2D massiv. */
  function sheetRows(XLSX, ws) {
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  }

  function findCol(hdr, names) {
    const H = hdr.map(low);
    for (const n of names) { const i = H.indexOf(n); if (i >= 0) return i; }
    for (const n of names) { const i = H.findIndex(h => h.startsWith(n)); if (i >= 0) return i; }
    return -1;
  }

  /* --- 1-format: EvalBee hisoboti (Q n Options / Q n Key / Q n Marks) --- */
  function parseEvalBee(rows) {
    const hdr = rows[0].map(norm);
    const qcols = [];
    hdr.forEach((h, i) => {
      const m = /^q\s*(\d+)\s+(options|key|marks)$/i.exec(h);
      if (m) { const n = +m[1]; qcols[n] = qcols[n] || {}; qcols[n][m[2].toLowerCase()] = i; }
    });
    const qs = qcols.map((c, n) => c && c.options != null && c.key != null ? { n, ...c } : null).filter(Boolean);
    if (qs.length < 2) return null;
    const col = {
      exam: findCol(hdr, ['imtihon', 'exam', 'exam name']),
      set: findCol(hdr, ['imtihon to\'plami', 'exam set', 'set']),
      roll: findCol(hdr, ['rolik raqami', 'roll number', 'roll no', 'roll']),
      name: findCol(hdr, ['ism', 'name', 'student name', 'f.i.sh', 'fish']),
      total: findCol(hdr, ['jami ball', 'total marks', 'total', 'score']),
      grade: findCol(hdr, ['baho', 'grade']),
      rank: findCol(hdr, ['runt', 'rank']),
      correct: findCol(hdr, ['to\'g\'ri javoblar', 'correct answers', 'correct']),
      wrong: findCol(hdr, ['noto\'g\'ri javoblar', 'incorrect answers', 'wrong']),
      blank: findCol(hdr, ['not attempted', 'javobsiz', 'unattempted'])
    };
    const topicCols = [];
    hdr.forEach((h, i) => { const m = /^(mavzu|topic|subject|bo'lim|section)\s*(\d+)?/i.exec(low(h)); if (m && !/^q\s*\d/i.test(h)) topicCols.push({ name: h, i }); });
    const students = [];
    for (const r of rows.slice(1)) {
      if (!r || r.every(v => !norm(v))) continue;
      const answers = [], keys = [], marks = [];
      for (const q of qs) {
        answers.push(cell(r[q.options]));
        keys.push(cell(r[q.key]).v);
        marks.push(q.marks != null ? num(r[q.marks]) : null);
      }
      students.push({
        roll: col.roll >= 0 ? norm(r[col.roll]) : '',
        name: col.name >= 0 ? norm(r[col.name]) : '',
        exam: col.exam >= 0 ? norm(r[col.exam]) : '',
        answers, keys, marks,
        file: {
          total: col.total >= 0 ? num(r[col.total]) : null,
          rank: col.rank >= 0 ? num(r[col.rank]) : null,
          correct: col.correct >= 0 ? num(r[col.correct]) : null,
          wrong: col.wrong >= 0 ? num(r[col.wrong]) : null,
          blank: col.blank >= 0 ? num(r[col.blank]) : null,
          grade: col.grade >= 0 ? norm(r[col.grade]) : '',
          topics: topicCols.map(t => num(r[t.i]))
        }
      });
    }
    return { format: 'evalbee', qCount: qs.length, students, topicNames: topicCols.map(t => t.name) };
  }

  /* --- 2-format: oddiy jadval: Ism | (Raqam) | 1 | 2 | ... ; "Kalit" qatori javob kaliti --- */
  function parseSimple(rows) {
    let hi = rows.findIndex(r => r.filter(v => /^(q\s*)?\d{1,3}$/i.test(norm(v))).length >= 3);
    if (hi < 0) return null;
    const hdr = rows[hi].map(norm);
    const qIdx = [];
    hdr.forEach((h, i) => { const m = /^(?:q\s*)?(\d{1,3})$/i.exec(h); if (m) qIdx.push({ n: +m[1], i }); });
    qIdx.sort((a, b) => a.n - b.n);
    const nameCol = (() => { const c = findCol(hdr, ['ism', 'f.i.sh', 'fish', 'name', 'o\'quvchi', 'familiya']); return c >= 0 ? c : 0; })();
    const rollCol = findCol(hdr, ['raqam', 'id', 'roll', 'rolik raqami', '№', 'no']);
    let key = null;
    const students = [];
    for (const r of rows.slice(hi + 1)) {
      if (!r || r.every(v => !norm(v))) continue;
      const nm = norm(r[nameCol]);
      const answers = qIdx.map(q => cell(r[q.i]));
      if (/^(kalit|key|javoblar kaliti|answer key|to'g'ri javob)/i.test(low(nm))) { key = answers.map(a => a.v); continue; }
      students.push({ roll: rollCol >= 0 && rollCol !== nameCol ? norm(r[rollCol]) : '', name: nm, answers, keys: null, marks: qIdx.map(() => null), file: {} });
    }
    if (!key) return { format: 'simple', error: "Jadvalda \"Kalit\" qatori topilmadi: birinchi ustunga Kalit deb yozib, to'g'ri javoblarni kiriting.", qCount: qIdx.length, students };
    students.forEach(s => { s.keys = key; });
    return { format: 'simple', qCount: qIdx.length, students, topicNames: [] };
  }

  /* Mavzu chegaralarini topish: har o'quvchining mavzu bo'yicha balli ketma-ket savollar yig'indisiga teng bo'lishi kerak. */
  function inferTopics(p, kinds) {
    const n = p.qCount, S = p.students;
    const T = p.topicNames.length;
    if (!T || S.some(s => s.marks.some(m => m == null) || s.file.topics.some(t => t == null))) return null;
    const pre = S.map(s => { const a = [0]; s.marks.forEach(m => a.push(a[a.length - 1] + m)); return a; });
    const bounds = [];
    let start = 0;
    for (let t = 0; t < T; t++) {
      if (t === T - 1) { bounds.push([start, n]); break; }
      const cand = [];
      for (let e = start + 1; e < n; e++) if (S.every((s, k) => Math.abs(pre[k][e] - pre[k][start] - s.file.topics[t]) < 1e-6)) cand.push(e);
      if (!cand.length) return null;
      // Bir nechta mos chegara bo'lsa: savol turi o'zgargan joy ustun.
      const typed = cand.find(e => kinds[e] !== kinds[e - 1]);
      const e = typed ?? cand[0];
      bounds.push([start, e]);
      start = e;
    }
    const last = bounds[bounds.length - 1];
    if (!S.every((s, k) => Math.abs(pre[k][last[1]] - pre[k][last[0]] - s.file.topics[T - 1]) < 1e-6)) return null;
    return bounds;
  }

  /* Savol turlari: kalit True/False bo'lsa -> tf; aks holda kuzatilgan eng katta harf. */
  function questionKinds(p) {
    const out = [];
    for (let q = 0; q < p.qCount; q++) {
      const key = p.students.map(s => s.keys?.[q]).find(Boolean) || '';
      if (isTF(key)) { out.push('tf'); continue; }
      let max = 3;
      for (const s of p.students) for (const v of [s.keys?.[q], ...String(s.answers[q].v).split(',')]) {
        const i = LETTERS.indexOf(v); if (i > max) max = i;
      }
      out.push('o' + (max + 1));
    }
    return out;
  }

  /* Bo'limlarni yasash: mavzu chegaralari (bo'lsa) yoki savol turi o'zgarishi bo'yicha. */
  function buildSections(p) {
    const kinds = questionKinds(p);
    let bounds = inferTopics(p, kinds);
    let named = !!bounds;
    if (!bounds) {
      bounds = [];
      let s = 0;
      for (let q = 1; q <= p.qCount; q++) if (q === p.qCount || kinds[q] !== kinds[s]) { bounds.push([s, q]); s = q; }
      named = false;
    }
    return bounds.map(([a, b], i) => {
      const ks = kinds.slice(a, b);
      const tf = ks.every(k => k === 'tf');
      const opts = tf ? 2 : Math.max(...ks.map(k => (k === 'tf' ? 2 : +k.slice(1))));
      return { title: named ? (p.topicNames[i] || `Mavzu ${i + 1}`) : `Bo'lim ${i + 1}`, start: a, count: b - a, kind: tf ? 'tf' : 'choice', options: opts, weight: 1 };
    });
  }

  /* Rasch (JML), hisob uchun mustaqil nusxa. */
  function rasch(X) {
    const P = X.length, I = P ? X[0].length : 0;
    const sig = x => 1 / (1 + Math.exp(-x));
    const pr = X.map(r => r.reduce((a, b) => a + b, 0));
    const ir = Array.from({ length: I }, (_, i) => X.reduce((a, r) => a + r[i], 0));
    const cl = (s, n) => Math.min(n - 0.3, Math.max(0.3, s));
    const th = pr.map(s => Math.log(cl(s, I) / (I - cl(s, I))));
    const b = ir.map(s => (P >= 3 ? Math.log((P - cl(s, P)) / cl(s, P)) : 0));
    for (let it = 0; it < 200; it++) {
      let md = 0;
      if (P >= 3) {
        for (let i = 0; i < I; i++) { let e = 0, v = 0; for (let p = 0; p < P; p++) { const q = sig(th[p] - b[i]); e += q; v += q * (1 - q); } const d = Math.max(-1, Math.min(1, (e - cl(ir[i], P)) / (v || 1e-6))); b[i] += d; md = Math.max(md, Math.abs(d)); }
        const m = b.reduce((a, x) => a + x, 0) / (I || 1); for (let i = 0; i < I; i++) b[i] -= m;
      }
      for (let p = 0; p < P; p++) { let e = 0, v = 0; for (let i = 0; i < I; i++) { const q = sig(th[p] - b[i]); e += q; v += q * (1 - q); } const d = Math.max(-1, Math.min(1, (cl(pr[p], I) - e) / (v || 1e-6))); th[p] += d; md = Math.max(md, Math.abs(d)); }
      if (md < 1e-5) break;
    }
    const c = P >= 3 && I > 1 ? (I - 1) / I : 1;
    return { theta: th, b: b.map(x => x * c) };
  }
  const raschGrade = T => (T >= 70 ? 'A+' : T >= 65 ? 'A' : T >= 60 ? 'B+' : T >= 55 ? 'B' : T >= 50 ? 'C+' : T >= 46 ? 'C' : '—');
  const fiveGrade = pct => (pct >= 86 ? 5 : pct >= 71 ? 4 : pct >= 56 ? 3 : 2);

  /* To'liq hisob. opts: {weights:[per section], negative: 0 (noto'g'ri uchun ayiriladigan ball)} */
  function compute(p, opts = {}) {
    const sections = opts.sections || buildSections(p);
    const neg = Number(opts.negative || 0);
    const secOf = q => sections.findIndex(s => q >= s.start && q < s.start + s.count);
    const key = [];
    for (let q = 0; q < p.qCount; q++) key.push(p.students.map(s => s.keys?.[q]).find(Boolean) || '');
    const maxPoints = r2(sections.reduce((a, s) => a + s.count * (s.weight ?? 1), 0));
    const rows = p.students.map(s => {
      let correct = 0, wrong = 0, blank = 0, multi = 0, points = 0;
      const secs = sections.map(sec => ({ title: sec.title, correct: 0, wrong: 0, blank: 0, points: 0, max: r2(sec.count * (sec.weight ?? 1)) }));
      const marks = [];
      for (let q = 0; q < p.qCount; q++) {
        const a = s.answers[q], k = s.keys?.[q] || key[q], si = secOf(q), w = sections[si]?.weight ?? 1;
        let m;
        if (!a.v) { blank++; secs[si].blank++; m = -1; }
        else if (!sameAns(a.v, k)) { wrong++; secs[si].wrong++; if (a.multi) multi++; m = 0; points -= neg; secs[si].points -= neg; }
        else { correct++; secs[si].correct++; points += w; secs[si].points += w; m = 1; }
        marks.push(m);
      }
      secs.forEach(x => { x.points = r2(x.points); });
      points = r2(points);
      const percent = maxPoints ? r2(points / maxPoints * 100) : 0;
      return { roll: s.roll, name: s.name || s.roll || "Noma'lum", correct, wrong, blank, multi, points, percent, grade5: fiveGrade(percent), sections: secs, marks, answers: s.answers.map(a => show(a.v)), file: s.file };
    });
    // Xom ball bo'yicha o'rin (fayl bilan solishtirish uchun)
    const rawSorted = [...rows].sort((a, b) => b.points - a.points || b.correct - a.correct || a.name.localeCompare(b.name));
    rawSorted.forEach((r, i) => { r.rawRank = i && r.points === rawSorted[i - 1].points ? rawSorted[i - 1].rawRank : i + 1; });
    // Rasch: savol qiyinligi bo'yicha ball (yoki BMBA T-ball)
    const scoring = opts.scoring || 'rasch';
    const cfg = { mode: ['weighted', 'bmba', 'rasch'].includes(opts.raschMode) ? opts.raschMode : 'rasch', max: opts.raschMax > 0 ? +opts.raschMax : 75 };
    const X = rows.map(r => r.marks.map(m => (m === 1 ? 1 : 0)));
    const M = rows.length ? CoreRef.raschScoreMatrix(X, cfg) : { rows: [], b: [], w: [], few: true };
    rows.forEach((r, i) => { const o = M.rows[i]; const T = r2(o.score); r.rasch = { theta: r2(o.theta), T, grade: CoreRef.grade(T * 75 / cfg.max), otm: CoreRef.otmPercent(T * 75 / cfg.max), weighted: o.weighted, bmba: o.T, rt: o.R, pts: o.pts }; });
    const key2 = r => (scoring === 'rasch' ? r.rasch.T : r.points);
    const sorted = [...rows].sort((a, b) => key2(b) - key2(a) || b.correct - a.correct || a.name.localeCompare(b.name));
    sorted.forEach((r, i) => { r.rank = i && key2(r) === key2(sorted[i - 1]) ? sorted[i - 1].rank : i + 1; });
    const R = { b: M.b, w: M.w };
    // Savollar tahlili: qiyinlik, ajratish indeksi (yuqori/quyi 27%), variantlar taqsimoti
    const g = Math.max(1, Math.round(rows.length * 0.27));
    const upper = sorted.slice(0, g), lower = sorted.slice(-g);
    const items = key.map((k, q) => {
      const dist = {};
      let right = 0;
      rows.forEach(r => { const a = r.answers[q] || '—'; dist[a] = (dist[a] || 0) + 1; if (r.marks[q] === 1) right++; });
      const pu = upper.filter(r => r.marks[q] === 1).length / g, pl = lower.filter(r => r.marks[q] === 1).length / g;
      const sec = sections[secOf(q)];
      return { n: q + 1, key: show(k), section: sec?.title, kind: sec?.kind, right, p: rows.length ? r2(right / rows.length * 100) : 0, disc: r2(pu - pl), b: r2(R.b[q] ?? 0), w: r2(R.w[q] ?? 0), dist };
    });
    // Fayldagi qiymatlar bilan solishtirish
    const checks = { total: 0, rank: 0, correct: 0, topics: 0, compared: 0 };
    rows.forEach(r => {
      const f = r.file || {};
      if (f.total != null) { checks.compared++; if (Math.abs(f.total - r.points) > 1e-6) checks.total++; }
      if (f.rank != null && f.rank !== r.rawRank) checks.rank++;
      if (f.correct != null && f.correct !== r.correct) checks.correct++;
      if (f.topics && f.topics.length === r.sections.length && f.topics.some((t, i) => t != null && Math.abs(t - r.sections[i].points) > 1e-6)) checks.topics++;
    });
    const pts = rows.map(r => r.points);
    const mean = pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : 0;
    const sd = pts.length ? Math.sqrt(pts.reduce((a, b) => a + (b - mean) ** 2, 0) / pts.length) : 0;
    const med = (() => { const s = [...pts].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; })();
    // KR-20 ishonchlilik
    const I = key.length;
    const pq = items.reduce((a, it) => { const pp = it.right / (rows.length || 1); return a + pp * (1 - pp); }, 0);
    const varT = rows.length ? rows.map(r => r.correct).reduce((a, x, _, arr) => a + (x - arr.reduce((s, y) => s + y, 0) / arr.length) ** 2, 0) / rows.length : 0;
    const kr20 = I > 1 && varT ? r2((I / (I - 1)) * (1 - pq / varT)) : null;
    const sectionStats = sections.map((s, i) => ({ title: s.title, avg: rows.length ? r2(rows.reduce((a, r) => a + r.sections[i].points, 0) / rows.length) : 0, max: r2(s.count * (s.weight ?? 1)) }));
    return {
      exam: p.students[0]?.exam || '', sections, key: key.map(show), maxPoints, rows: sorted, items, checks, scoring, rcfg: cfg, few: M.few,
      stats: { count: rows.length, mean: r2(mean), median: r2(med), sd: r2(sd), max: Math.max(...pts, 0), min: pts.length ? Math.min(...pts) : 0, kr20, sectionStats }
    };
  }

  /* Workbook -> tahlil. */
  function analyze(XLSX, wb, opts) {
    for (const name of wb.SheetNames) {
      const rows = sheetRows(XLSX, wb.Sheets[name]);
      if (!rows.length) continue;
      const p = parseEvalBee(rows) || parseSimple(rows);
      if (!p) continue;
      if (p.error) return { error: p.error };
      if (!p.students.length) continue;
      return { sheet: name, format: p.format, parsed: p, result: compute(p, opts) };
    }
    return { error: "Jadvalda javoblar topilmadi. EvalBee hisobotini yoki 'Ism, 1, 2, 3…' ustunli jadvalni yuklang." };
  }

  /* Natijalarni Excel'ga yozish (3 varaq). */
  function toWorkbook(XLSX, R) {
    const wb = XLSX.utils.book_new();
    const head = ['O‘rin', 'Raqam', 'Ism', `Ball (${R.rcfg.max})`, 'Daraja', 'OTM foizi', 'Rasch T (θ − o‘rtacha)', 'BMBA T (Z)', 'Qiyinlik bo‘yicha ball', 'Xom ball', 'Maks', '%', 'Baho (5)', 'To‘g‘ri', 'Noto‘g‘ri', 'Javobsiz', ...R.sections.map(s => s.title)];
    const data = R.rows.map(r => [r.rank, r.roll, r.name, r.rasch.T, r.rasch.grade, r.rasch.otm / 100, r.rasch.rt, r.rasch.bmba, r.rasch.weighted, r.points, R.maxPoints, r.percent, r.grade5, r.correct, r.wrong, r.blank, ...r.sections.map(s => s.points)]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...data]), 'Natijalar');
    const ih = ['Savol', 'Bo‘lim', 'Kalit', 'To‘g‘ri soni', 'To‘g‘ri %', 'Savol balli', 'Rasch qiyinlik (logit)', 'Ajratish', 'Javoblar taqsimoti'];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([ih, ...R.items.map(it => [it.n, it.section, it.key, it.right, it.p, it.w, it.b, it.disc, Object.entries(it.dist).map(([k, v]) => `${k}:${v}`).join('  ')])]), 'Savollar tahlili');
    const mh = ['Ism', ...R.items.map(it => 'Q' + it.n)];
    const mr = R.rows.map(r => [r.name, ...r.answers.map((a, i) => (r.marks[i] === 1 ? `✓ ${a} (+${r.rasch.pts[i]})` : (r.marks[i] === 0 ? '✗ ' : '') + (a || '—')))]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([mh, ['KALIT', ...R.key], ...mr]), 'Javoblar');
    return wb;
  }

  return { analyze, compute, buildSections, parseEvalBee, parseSimple, toWorkbook, cell, show };
})();
if (typeof module !== 'undefined') module.exports = XlsCalc;
