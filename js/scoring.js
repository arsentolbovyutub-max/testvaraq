/* Test structures and scoring: block (DTM), simple and Rasch. */
const OPTIONS = ['A', 'B', 'C', 'D'];

const Scoring = {
  /* DTM block format: 3 mandatory x 10 q (1.1), main subject 1: 30 q (3.1), main subject 2: 30 q (2.1) = 90 q, 189 points */
  blockSections(main1, main2) {
    return [
      { title: 'Ona tili', subject: 'Ona tili va adabiyot', count: 10, weight: 1.1 },
      { title: 'Matematika (majburiy)', subject: 'Matematika', count: 10, weight: 1.1 },
      { title: "O'zbekiston tarixi", subject: "O'zbekiston tarixi", count: 10, weight: 1.1 },
      { title: main1, subject: main1, count: 30, weight: 3.1 },
      { title: main2, subject: main2, count: 30, weight: 2.1 }
    ];
  },

  qCount(test) { return test.sections.reduce((a, s) => a + s.count, 0); },
  maxPoints(test) { return round1(test.sections.reduce((a, s) => a + s.count * s.weight, 0)); },

  /* section that owns question index q (0-based) */
  sectionAt(test, q) {
    let start = 0;
    for (const s of test.sections) { if (q < start + s.count) return { sec: s, start }; start += s.count; }
    return null;
  },

  variantOf(test, code) { return test.variants.find(v => v.code === code) || test.variants[0]; },

  /* per-question marks: 1 correct, 0 wrong, -1 blank/invalid, null = key not set */
  marks(test, result) {
    const key = this.variantOf(test, result.variant).key;
    const n = this.qCount(test);
    const out = [];
    for (let i = 0; i < n; i++) {
      const k = key[i], a = result.answers[i];
      if (!k || k === '-') out.push(null);
      else if (!a || a === '-' || a === '*') out.push(-1);
      else out.push(a === k ? 1 : 0);
    }
    return out;
  },

  evaluate(test, result) {
    const student = result.studentId ? DB.student(result.studentId) : null;
    const m = this.marks(test, result);
    const pct = DB.data.settings.certPercent || {};
    let start = 0, points = 0, correct = 0, wrong = 0, blank = 0;
    const sections = test.sections.map(s => {
      let c = 0;
      for (let i = start; i < start + s.count; i++) {
        if (m[i] === 1) c++; else if (m[i] === 0) wrong++; else if (m[i] === -1) blank++;
      }
      start += s.count;
      const max = round1(s.count * s.weight);
      let p = round1(c * s.weight);
      let cert = null;
      if (test.type === 'block' && student && Array.isArray(student.certs)) {
        const ce = student.certs.find(x => x.subject === s.subject);
        if (ce) {
          const certPts = round1(max * (pct[ce.grade] ?? 100) / 100);
          if (certPts > p) { p = certPts; cert = ce.grade; }
        }
      }
      points += p; correct += c;
      return { title: s.title, subject: s.subject, count: s.count, weight: s.weight, correct: c, points: p, max, cert };
    });
    const max = this.maxPoints(test);
    points = round1(points);
    return { correct, wrong, blank, total: m.length, points, max, percent: max ? Math.round(points / max * 100) : 0, sections, marks: m };
  },

  grade(T) {
    if (T >= 70) return 'A+';
    if (T >= 65) return 'A';
    if (T >= 60) return 'B+';
    if (T >= 55) return 'B';
    if (T >= 50) return 'C+';
    if (T >= 46) return 'C';
    return '—';
  },

  /* Rasch (1PL) by joint maximum likelihood. Returns scaled scores (T = 50 + 10z, 0..75) and item stats. */
  rasch(test, results) {
    const n = this.qCount(test);
    const X = results.map(r => this.marks(test, r).map(v => v === 1 ? 1 : 0));
    const P = X.length;
    const items = [];
    for (let i = 0; i < n; i++) {
      let s = 0; for (let p = 0; p < P; p++) s += X[p][i];
      items.push({ q: i + 1, s, p: P ? s / P : 0, b: 0 });
    }
    const byResult = {};
    const raw = X.map(r => r.reduce((a, b) => a + b, 0));

    if (P < 3) {
      results.forEach((r, k) => {
        const T = round1(75 * raw[k] / (n || 1));
        byResult[r.id] = { theta: null, T, grade: this.grade(T), raw: raw[k] };
      });
      items.forEach(it => { it.b = it.p >= 1 ? -3 : it.p <= 0 ? 3 : Math.round(Math.log((1 - it.p) / it.p) * 100) / 100; });
      return { byResult, items, few: true };
    }

    const activeI = items.map(it => it.s > 0 && it.s < P);
    const nAct = activeI.filter(Boolean).length;
    const rawAct = X.map(r => r.reduce((a, v, i) => a + (activeI[i] ? v : 0), 0));
    const activeP = rawAct.map(r => r > 0 && r < nAct);
    const theta = rawAct.map((r, p) => activeP[p] ? Math.log(r / (nAct - r)) : 0);
    const b = items.map((it, i) => activeI[i] ? Math.log((P - it.s) / it.s) : 0);

    for (let iter = 0; iter < 200; iter++) {
      let maxD = 0;
      for (let p = 0; p < P; p++) {
        if (!activeP[p]) continue;
        let e = 0, v = 0;
        for (let i = 0; i < n; i++) { if (!activeI[i]) continue; const pr = 1 / (1 + Math.exp(b[i] - theta[p])); e += pr; v += pr * (1 - pr); }
        const d = Math.max(-1, Math.min(1, (rawAct[p] - e) / (v || 1)));
        theta[p] += d; maxD = Math.max(maxD, Math.abs(d));
      }
      let mean = 0;
      for (let i = 0; i < n; i++) {
        if (!activeI[i]) continue;
        let e = 0, v = 0;
        for (let p = 0; p < P; p++) { if (!activeP[p]) continue; const pr = 1 / (1 + Math.exp(b[i] - theta[p])); e += pr; v += pr * (1 - pr); }
        let s = 0; for (let p = 0; p < P; p++) if (activeP[p]) s += X[p][i];
        const d = Math.max(-1, Math.min(1, (e - s) / (v || 1)));
        b[i] += d; maxD = Math.max(maxD, Math.abs(d)); mean += b[i];
      }
      mean /= (nAct || 1);
      for (let i = 0; i < n; i++) if (activeI[i]) b[i] -= mean;
      if (maxD < 1e-4) break;
    }
    const corr = nAct > 1 ? (nAct - 1) / nAct : 1;
    const act = theta.filter((t, p) => activeP[p]).map(t => t * corr);
    const lo = act.length ? Math.min(...act) - 1 : -3, hi = act.length ? Math.max(...act) + 1 : 3;
    const th = theta.map((t, p) => activeP[p] ? t * corr : (rawAct[p] <= 0 ? lo : hi));
    const bAct = b.filter((x, i) => activeI[i]);
    const bLo = bAct.length ? Math.min(...bAct) - 1 : -3, bHi = bAct.length ? Math.max(...bAct) + 1 : 3;
    items.forEach((it, i) => { it.b = Math.round((activeI[i] ? b[i] * corr : (it.s >= P ? bLo : bHi)) * 100) / 100; });

    const mu = th.reduce((a, x) => a + x, 0) / P;
    const sd = Math.sqrt(th.reduce((a, x) => a + (x - mu) ** 2, 0) / P) || 1;
    results.forEach((r, k) => {
      const T = round1(Math.max(0, Math.min(75, 50 + 10 * (th[k] - mu) / sd)));
      byResult[r.id] = { theta: Math.round(th[k] * 100) / 100, T, grade: this.grade(T), raw: raw[k] };
    });
    return { byResult, items, few: false };
  },

  /* Ranked rows for a test (works for every type). */
  table(test) {
    const results = DB.resultsOfTest(test.id);
    const R = test.type === 'rasch' ? this.rasch(test, results) : null;
    const rows = results.map(r => {
      const ev = this.evaluate(test, r);
      const st = r.studentId ? DB.student(r.studentId) : null;
      const g = st && st.groupId ? DB.group(st.groupId) : null;
      const row = { r, ev, name: st ? st.name : (r.guestName || "Noma'lum"), group: g ? g.name : '', score: ev.points };
      if (R) { const x = R.byResult[r.id]; row.T = x.T; row.grade = x.grade; row.score = x.T; }
      return row;
    });
    rows.sort((a, b) => b.score - a.score || b.ev.correct - a.ev.correct);
    rows.forEach((x, i) => x.rank = i + 1);
    return { rows, rasch: R };
  }
};
