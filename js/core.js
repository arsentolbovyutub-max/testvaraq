/* Test tuzilmasi va ball hisoblash yadrosi. Brauzerda (global Core) va serverda (require) bir xil ishlaydi.
   Javoblar satri: har savolga 1 belgi. Tanlov: A–F; True/False: A = True, B = False; yozma savol: '+' to'g'ri, 'x' noto'g'ri.
   '-' = bo'sh / baholanmagan, '*' = bir nechta belgi (eski yozuvlar).
   Bir nechta to'g'ri javob (masalan A va D): bitta belgi bilan kodlanadi — U+0100 + bitmaska (A=1, B=2, C=4 …).
   Shu sababli har savolga baribir bitta belgi to'g'ri keladi va to'plamlar oddiy tenglik bilan solishtiriladi. */
(function (root) {
  const LETTERS = 'ABCDEF';
  const round1 = x => Math.round(x * 10) / 10;
  const round2 = x => Math.round(x * 100) / 100;

  const Core = {
    LETTERS,
    KIND_NAME: { choice: 'Variantli', tf: "To'g'ri / Noto'g'ri", open: 'Yozma javob' },

    /* DTM: 3 majburiy fan x 10 savol (1.1), 1-asosiy 30 (3.1), 2-asosiy 30 (2.1) = 90 savol, 189 ball. */
    blockSections(main1, main2) {
      return [
        { title: 'Ona tili', subject: 'Ona tili va adabiyot', count: 10, weight: 1.1, mandatory: true },
        { title: 'Matematika (majburiy)', subject: 'Matematika', count: 10, weight: 1.1, mandatory: true },
        { title: "O'zbekiston tarixi", subject: "O'zbekiston tarixi", count: 10, weight: 1.1, mandatory: true },
        { title: main1, subject: main1, count: 30, weight: 3.1 },
        { title: main2, subject: main2, count: 30, weight: 2.1 }
      ].map(s => Object.assign({ kind: 'choice', options: 4 }, s));
    },

    kind(s) { return s && (s.kind === 'tf' || s.kind === 'open') ? s.kind : 'choice'; },
    opts(s) { const k = this.kind(s); return k === 'tf' || k === 'open' ? 2 : Math.max(2, Math.min(6, s.options || 4)); },
    /* Savol uchun ko'rsatiladigan belgilar. */
    labels(s) {
      const k = this.kind(s);
      if (k === 'tf') return ['T', 'F'];
      if (k === 'open') return ['+', '−'];
      return LETTERS.slice(0, this.opts(s)).split('');
    },
    /* Ichki belgi (A..F / +,x) */
    codes(s) {
      const k = this.kind(s);
      if (k === 'open') return ['+', 'x'];
      return LETTERS.slice(0, this.opts(s)).split('');
    },
    /* Harflar to'plami <-> bitta belgi */
    encSet(letters) {
      const set = [...new Set((letters || []).filter(L => LETTERS.includes(L)))].sort();
      if (!set.length) return '-';
      if (set.length === 1) return set[0];
      return String.fromCharCode(0x100 + set.reduce((m, L) => m | (1 << LETTERS.indexOf(L)), 0));
    },
    decSet(ch) {
      if (!ch || ch === '-' || ch === '*') return [];
      const c = ch.charCodeAt(0);
      if (c >= 0x100 && c < 0x140) return LETTERS.split('').filter((L, i) => (c - 0x100) & (1 << i));
      return [ch];
    },
    isMulti(ch) { return !!ch && ch.charCodeAt(0) >= 0x100 && ch.charCodeAt(0) < 0x140; },
    /* Tugma bosilganda: multi=true bo'lsa harf to'plamga qo'shiladi/olinadi, aks holda bitta tanlov almashtiriladi. */
    pick(cur, o, multi) {
      if (!multi || o === '+' || o === 'x') return cur === o ? '-' : o;
      const set = this.decSet(cur);
      const i = set.indexOf(o);
      if (i >= 0) set.splice(i, 1); else set.push(o);
      return this.encSet(set);
    },
    show(s, ch) {
      if (!ch || ch === '-') return '—';
      if (ch === '*') return '2+';
      if (this.isMulti(ch)) return this.decSet(ch).join(',');
      const k = this.kind(s);
      if (k === 'tf') return ch === 'A' ? 'T' : ch === 'B' ? 'F' : ch;
      if (k === 'open') return ch === '+' ? '✓' : ch === 'x' ? '✗' : ch;
      return ch;
    },

    qCount(test) { return test.sections.reduce((a, s) => a + s.count, 0); },
    maxPoints(test) { return round1(test.sections.reduce((a, s) => a + s.count * (s.weight ?? 1), 0)); },
    sectionAt(test, q) {
      let start = 0;
      for (let i = 0; i < test.sections.length; i++) { const s = test.sections[i]; if (q < start + s.count) return { sec: s, start, index: i }; start += s.count; }
      return null;
    },
    /* Har savol uchun bo'lim ma'lumoti. */
    qInfo(test) {
      const out = [];
      test.sections.forEach((s, si) => { for (let i = 0; i < s.count; i++) out.push({ sec: s, si, kind: this.kind(s), first: i === 0 }); });
      return out;
    },
    /* Yozma savollar uchun kalit avtomatik '+'. */
    defaultKey(test) { return this.qInfo(test).map(x => (x.kind === 'open' ? '+' : '-')).join(''); },
    normKey(test, key) {
      const info = this.qInfo(test);
      return info.map((x, i) => (x.kind === 'open' ? '+' : (key || '')[i] || '-')).join('');
    },
    keyComplete(test, key) { return !this.normKey(test, key).includes('-'); },
    variantOf(test, code) { return test.variants.find(v => v.code === code) || test.variants[0]; },

    /* 1 to'g'ri, 0 noto'g'ri, -1 bo'sh/baholanmagan, null kalit yo'q */
    marks(test, result) {
      const key = this.normKey(test, this.variantOf(test, result.variant).key);
      const ans = result.answers || '';
      return this.qInfo(test).map((x, i) => {
        const a = ans[i];
        if (x.kind === 'open') return a === '+' ? 1 : a === 'x' ? 0 : -1;
        const k = key[i];
        if (!k || k === '-') return null;
        if (!a || a === '-') return -1;
        if (a === '*') return 0;
        return a === k ? 1 : 0;
      });
    },

    /* Milliy sertifikat: majburiy fan -> maksimal; A+/A -> maksimal; B+..C -> maksimal x foiz. */
    certPoints(sec, cert) {
      const max = round1(sec.count * sec.weight);
      if (sec.mandatory) return { pts: max, note: cert.grade };
      if (cert.grade === 'A+' || cert.grade === 'A') return { pts: max, note: cert.grade };
      const p = parseFloat(cert.percent);
      if (!(p > 0)) return { pts: 0, note: cert.grade + ' (foiz kiritilmagan)' };
      return { pts: round1(max * Math.min(100, p) / 100), note: `${cert.grade} · ${p}%` };
    },
    certFor(test, sec, student) {
      if (test.type !== 'block' || !student || !Array.isArray(student.certs)) return null;
      return student.certs.find(c => c.subject === sec.subject) || null;
    },

    evaluate(test, result, student) {
      const m = this.marks(test, result);
      let start = 0, points = 0, correct = 0, wrong = 0, blank = 0, pending = 0;
      const sections = test.sections.map(s => {
        let c = 0, w = 0, b = 0;
        for (let i = start; i < start + s.count; i++) {
          if (m[i] === 1) c++; else if (m[i] === 0) w++; else if (m[i] === -1) { b++; if (this.kind(s) === 'open') pending++; }
        }
        wrong += w; blank += b;
        start += s.count;
        const max = round1(s.count * s.weight);
        let p = round1(c * s.weight);
        let cert = null;
        const ce = this.certFor(test, s, student);
        if (ce) {
          const cp = this.certPoints(s, ce);
          if (cp.pts > p) { p = cp.pts; cert = cp.note; }
        }
        points += p; correct += c;
        return { title: s.title, subject: s.subject, kind: this.kind(s), count: s.count, weight: s.weight, correct: c, wrong: w, blank: b, points: p, max, cert };
      });
      const max = this.maxPoints(test);
      points = round1(points);
      return { correct, wrong, blank, pending, total: m.length - pending, points, max, percent: max ? Math.round(points / max * 100) : 0, sections, marks: m };
    },

    grade(T) {
      if (T >= 70) return 'A+';
      if (T >= 65) return 'A';
      if (T >= 60) return 'B+';
      if (T >= 55) return 'B';
      if (T >= 50) return 'C+';
      if (T >= 46) return 'C';
      return 'NC';
    },
    /* OTMga kirishda sertifikat foizi: A va undan yuqori (65+) — 100%, 46…65 — ball/65, 46 dan past — 0. */
    otmPercent(T) { return T >= 65 ? 100 : T >= 46 ? round2(T / 65 * 100) : 0; },

    /* ---------------- RASCH ----------------
       Savollar 0/1 (yozma javob ham alohida savol). Qiyinlik (b) — shu testni yechgan hammaning javoblari bo'yicha (JML).
       Hamma topgan / hech kim topmagan savollar kalibrovkadan chiqariladi (ular o'quvchilarni ajratmaydi).
       Savol qiyinligi (b) — CML (shartli eng katta ehtimollik, Rasch modelining aniq usuli); θ — MLE, 0 va to'liq natijada WLE.
       Usullar:
         'bmba'     — Milliy sertifikat (BMBA) rasmiy formulasi: Z = (θ − μ)/σ, T = 50 + 10·Z. Yuqori chegara YO'Q
                      ("maksimal ball shartli"): kuchli o'quvchi 75 dan ham yuqori olishi mumkin.
         'rasch'    — T = 50 + 10·(θ − μ) (σ ga bo'linmaydi; ba'zi repetitsion test hisobotlaridagi usul). Chegara yo'q.
         'weighted' — savol qiyinligi bo'yicha ball: qiyin savolga ko'p ball; barcha savollar yig'indisi = tanlangan ball. */
    raschCfg(test) {
      const r = test.rasch || {};
      return { mode: ['weighted', 'bmba', 'rasch'].includes(r.mode) ? r.mode : 'bmba', max: r.max > 0 ? +r.max : 75 };
    },

    /* Elementar simmetrik funksiyalar γ_0..γ_L (CML uchun). */
    esf(eps) {
      const g = new Array(eps.length + 1).fill(0); g[0] = 1;
      for (let i = 0; i < eps.length; i++) for (let r = i + 1; r >= 1; r--) g[r] += eps[i] * g[r - 1];
      return g;
    },
    /* Savollar qiyinligi — CML. Hamma topgan / hech kim topmagan savollar va 0 / to'liq natijali o'quvchilar hisobga olinmaydi. */
    raschCalibrate(X) {
      const P = X.length, I = P ? X[0].length : 0;
      const s = Array.from({ length: I }, (_, i) => X.reduce((a, r) => a + r[i], 0));
      const act = s.map(v => v > 0 && v < P);
      const idx = act.map((a, i) => (a ? i : -1)).filter(i => i >= 0);
      const L = idx.length;
      const raw = X.map(r => idx.reduce((a, i) => a + r[i], 0));
      const nr = new Array(L + 1).fill(0);
      raw.forEach(r => { if (r > 0 && r < L) nr[r]++; });
      const N = nr.reduce((a, x) => a + x, 0);
      const si = idx.map(i => X.reduce((a, r, p) => a + (raw[p] > 0 && raw[p] < L ? r[i] : 0), 0));
      if (L < 2 || N < 2 || si.some(v => v <= 0 || v >= N)) return this.raschCalibrateJML(X);
      let b = si.map(v => Math.log((N - v) / v));
      let m = b.reduce((a, x) => a + x, 0) / L; b = b.map(x => x - m);
      let ok = false;
      for (let it = 0; it < 300; it++) {
        const eps = b.map(x => Math.exp(-x)), g = this.esf(eps);
        let md = 0;
        const nb = b.slice();
        for (let k = 0; k < L; k++) {
          const gk = this.esf(eps.filter((_, j) => j !== k));
          let E = 0, V = 0;
          for (let r = 1; r < L; r++) { if (!nr[r]) continue; const p = eps[k] * gk[r - 1] / g[r]; E += nr[r] * p; V += nr[r] * p * (1 - p); }
          const d = Math.max(-1, Math.min(1, (E - si[k]) / (V || 1e-9)));
          nb[k] = b[k] + d; md = Math.max(md, Math.abs(d));
        }
        m = nb.reduce((a, x) => a + x, 0) / L; b = nb.map(x => x - m);
        if (!b.every(Number.isFinite)) break;
        if (md < 1e-8) { ok = true; break; }
      }
      if (!ok && !b.every(x => Number.isFinite(x) && Math.abs(x) < 15)) return this.raschCalibrateJML(X);
      const full = new Array(I).fill(0);
      idx.forEach((i, k) => { full[i] = b[k]; });
      const lo = Math.min(...b), hi = Math.max(...b);
      for (let i = 0; i < I; i++) if (!act[i]) full[i] = s[i] >= P ? lo - 1 : hi + 1;
      return { b: full, act, s, few: P < 3, method: 'CML' };
    },

    /* Zaxira: JML (juda kichik yoki mukammal Guttman ma'lumotida). */
    raschCalibrateJML(X) {
      const P = X.length, I = P ? X[0].length : 0;
      const sig = x => 1 / (1 + Math.exp(-x));
      const s = Array.from({ length: I }, (_, i) => X.reduce((a, r) => a + r[i], 0));
      const act = s.map(v => v > 0 && v < P);
      const nAct = act.filter(Boolean).length;
      const b = new Array(I).fill(0);
      if (P >= 2 && nAct >= 2) {
        const raw = X.map(r => r.reduce((a, v, i) => a + (act[i] ? v : 0), 0));
        const pAct = raw.map(r => r > 0 && r < nAct);
        const th = raw.map(r => (r > 0 && r < nAct ? Math.log(r / (nAct - r)) : 0));
        for (let i = 0; i < I; i++) if (act[i]) b[i] = Math.log((P - s[i]) / s[i]);
        for (let it = 0; it < 500; it++) {
          let md = 0;
          for (let p = 0; p < P; p++) {
            if (!pAct[p]) continue;
            let e = 0, v = 0;
            for (let i = 0; i < I; i++) if (act[i]) { const q = sig(th[p] - b[i]); e += q; v += q * (1 - q); }
            const d = Math.max(-1, Math.min(1, (raw[p] - e) / (v || 1e-9)));
            th[p] = Math.max(-6, Math.min(6, th[p] + d)); md = Math.max(md, Math.abs(d));
          }
          let mean = 0;
          for (let i = 0; i < I; i++) {
            if (!act[i]) continue;
            let e = 0, v = 0, si = 0;
            for (let p = 0; p < P; p++) if (pAct[p]) { const q = sig(th[p] - b[i]); e += q; v += q * (1 - q); si += X[p][i]; }
            const d = Math.max(-1, Math.min(1, (e - si - b[i] / 9) / ((v || 1e-9) + 1 / 9)));   // kuchsiz N(0, 3²) prior: mukammal Guttman holatida ham chekli
            b[i] += d; md = Math.max(md, Math.abs(d)); mean += b[i];
          }
          mean /= nAct;
          for (let i = 0; i < I; i++) if (act[i]) b[i] -= mean;
          if (md < 1e-6) break;
        }
        const c = (nAct - 1) / nAct;
        for (let i = 0; i < I; i++) if (act[i]) b[i] *= c;
      }
      const ba = b.filter((_, i) => act[i]);
      const lo = ba.length ? Math.min(...ba) : 0, hi = ba.length ? Math.max(...ba) : 0;
      for (let i = 0; i < I; i++) if (!act[i] && P) b[i] = s[i] >= P ? lo - 1 : hi + 1;   // hamma topgan: eng oson; hech kim: eng qiyin
      return { b, act, s, few: P < 3 || nAct < 2, method: 'JML' };
    },

    /* Qobiliyat θ — WLE (Warm): 0 va maksimal natijalar uchun ham chekli qiymat. */
    raschWLE(x, b, act) {
      const sig = z => 1 / (1 + Math.exp(-z));
      let r = 0, L = 0;
      for (let i = 0; i < b.length; i++) if (act[i]) { L++; r += x[i]; }
      if (!L) return 0;
      let th = Math.log((r + 0.5) / (L - r + 0.5));
      for (let it = 0; it < 100; it++) {
        let e = 0, inf = 0, J = 0;
        for (let i = 0; i < b.length; i++) if (act[i]) { const p = sig(th - b[i]); e += p; inf += p * (1 - p); J += p * (1 - p) * (1 - 2 * p); }
        const f = r - e + J / (2 * (inf || 1e-9));
        const d = Math.max(-1, Math.min(1, f / (inf || 1e-9)));
        th += d;
        if (Math.abs(d) < 1e-7) break;
      }
      return th;
    },

    /* Qobiliyat θ — MLE (0 va maksimal natijada WLE ishlatiladi). */
    raschMLE(x, b, act) {
      const sig = z => 1 / (1 + Math.exp(-z));
      let r = 0, L = 0;
      for (let i = 0; i < b.length; i++) if (act[i]) { L++; r += x[i]; }
      if (!L) return 0;
      if (r <= 0 || r >= L) return this.raschWLE(x, b, act);
      let th = Math.log(r / (L - r));
      for (let it = 0; it < 100; it++) {
        let e = 0, inf = 0;
        for (let i = 0; i < b.length; i++) if (act[i]) { const p = sig(th - b[i]); e += p; inf += p * (1 - p); }
        const d = Math.max(-1, Math.min(1, (r - e) / (inf || 1e-9)));
        th += d;
        if (Math.abs(d) < 1e-7) break;
      }
      return th;
    },

    /* Savol ballari (qiyinlik bo'yicha): w = b − b_min + 1, yig'indisi = max. */
    raschWeights(b, max) {
      if (!b.length) return [];
      const mn = Math.min(...b);
      const w = b.map(x => x - mn + 1);
      const sum = w.reduce((a, x) => a + x, 0) || 1;
      const out = w.map(x => round2(max * x / sum));
      const diff = round2(max - out.reduce((a, x) => a + x, 0));   // yaxlitlash qoldig'i: yig'indi aynan max bo'lsin
      if (diff) { const i = out.indexOf(Math.max(...out)); out[i] = round2(out[i] + diff); }
      return out;
    },

    raschScoreMatrix(X, cfg) {
      const P = X.length;
      const C = this.raschCalibrate(X);
      const w = this.raschWeights(C.b, cfg.max);
      const out = X.map(x => {
        const pts = x.map((v, i) => (v ? w[i] : 0));
        const weighted = round2(Math.min(cfg.max, pts.reduce((a, y) => a + y, 0)));
        return { pts, weighted, theta: this.raschMLE(x, C.b, C.act), raw: x.reduce((a, y) => a + y, 0) };
      });
      const th = out.map(o => o.theta);
      const mu = P ? th.reduce((a, y) => a + y, 0) / P : 0;
      const sd = P > 1 ? Math.sqrt(th.reduce((a, y) => a + (y - mu) ** 2, 0) / (P - 1)) : 0;
      out.forEach(o => {
        o.Z = sd > 1e-9 ? (o.theta - mu) / sd : 0;
        o.T = round2(Math.max(0, 50 + 10 * o.Z));                 // BMBA: Z = (θ − μ)/σ, T = 50 + 10·Z — yuqori chegara yo'q
        o.R = round2(Math.max(0, 50 + 10 * (o.theta - mu)));       // σ siz variant
        o.score = cfg.mode === 'bmba' ? o.T : cfg.mode === 'rasch' ? o.R : o.weighted;
      });
      return { rows: out, b: C.b, w, s: C.s, few: C.few, mu, sd, method: C.method };
    },

    rasch(test, results) {
      const cfg = this.raschCfg(test);
      const n = this.qCount(test);
      const X = results.map(r => this.marks(test, r).map(v => (v === 1 ? 1 : 0)));
      const M = this.raschScoreMatrix(X, cfg);
      const P = X.length;
      const items = [];
      for (let i = 0; i < n; i++) items.push({ q: i + 1, s: M.s[i] || 0, p: P ? (M.s[i] || 0) / P : 0, b: round2(M.b[i] || 0), w: M.w[i] || 0 });
      const byResult = {};
      results.forEach((r, k) => {
        const o = M.rows[k];
        const T = round2(o.score);
        const g75 = cfg.mode === 'weighted' ? T * 75 / cfg.max : T;
        byResult[r.id] = { theta: round2(o.theta), Z: round2(o.Z), T, grade: this.grade(g75), otm: this.otmPercent(g75), raw: o.raw, pts: o.pts, weighted: o.weighted, bmba: o.T, rasch: o.R };
      });
      return { byResult, items, few: M.few, cfg, method: M.method, mu: round2(M.mu), sd: round2(M.sd) };
    },

    /* Reyting (teng ballarga bir xil o'rin). studentOf(r) -> student. */
    table(test, results, studentOf, groupOf) {
      const R = test.type === 'rasch' ? this.rasch(test, results) : null;
      const rows = results.map(r => {
        const st = studentOf ? studentOf(r) : null;
        const ev = this.evaluate(test, r, st);
        const g = st && st.groupId && groupOf ? groupOf(st.groupId) : null;
        const row = { r, ev, st, name: st ? st.name : (r.guestName || "Noma'lum"), group: g ? g.name : '', score: ev.points };
        if (R) { const x = R.byResult[r.id]; row.T = x.T; row.grade = x.grade; row.otm = x.otm; row.score = x.T; }
        return row;
      });
      rows.sort((a, b) => b.score - a.score || b.ev.correct - a.ev.correct || a.name.localeCompare(b.name));
      rows.forEach((x, i) => { x.rank = i && x.score === rows[i - 1].score ? rows[i - 1].rank : i + 1; });
      return { rows, rasch: R };
    },

    /* Bot / qo'lda kiritilgan matndan javoblar satri. Yozma savollar o'tkazib yuboriladi. */
    parseAnswers(test, text) {
      const info = this.qInfo(test);
      const closed = info.map((x, i) => i).filter(i => info[i].kind !== 'open');
      const s = String(text || '').toUpperCase().replace(/[ʻʼ‘’`']/g, '');
      const out = info.map(x => (x.kind === 'open' ? '-' : '-'));
      const conv = (q, ch) => {
        const k = info[q].kind;
        if (ch === '-' || ch === '0' || ch === '.' || ch === '_' || ch === '?') return '-';
        if (k === 'tf') {
          if ('T+1AH'.includes(ch)) return 'A';
          if ('FBN'.includes(ch)) return 'B';
          return null;
        }
        const i = LETTERS.indexOf(ch);
        return i >= 0 && i < this.opts(info[q].sec) ? ch : null;
      };
      const convMany = (q, str) => {
        const ls = str.replace(/[^A-FT+\-]/g, '').split('');
        if (ls.length <= 1) return conv(q, ls[0] || '-');
        if (info[q].kind !== 'choice') return null;
        const vs = ls.map(L => conv(q, L));
        if (vs.some(v => v == null || v === '-')) return null;
        return this.encSet(vs);
      };
      if (/^\s*\d{1,3}\s*[-.):]?\s*[A-FT]/.test(s)) {
        const re = /(\d{1,3})\s*[-.):]?\s*([A-FT+\-](?:[\s,]*[A-F])*)/g;
        let m, k = 0;
        while ((m = re.exec(s))) {
          const q = +m[1] - 1;
          if (q < 0 || q >= info.length || info[q].kind === 'open') continue;
          const v = convMany(q, m[2]);
          if (v == null) return { error: `${q + 1}-savol uchun "${m[2].trim()}" javobi mumkin emas` };
          out[q] = v; k++;
        }
        if (!k) return { error: 'Javoblar topilmadi' };
      } else {
        const toks = [];
        const src = s.replace(/TRUE/g, 'T').replace(/FALSE/g, 'F').replace(/\s+/g, '');
        for (let i = 0; i < src.length; i++) {
          if (src[i] === '(' || src[i] === '[') { const j = src.indexOf(src[i] === '(' ? ')' : ']', i); if (j < 0) return { error: 'Qavs yopilmagan' }; toks.push(src.slice(i + 1, j)); i = j; }
          else toks.push(src[i]);
        }
        const chars = toks;
        if (chars.length !== closed.length) return { error: `${closed.length} ta javob kerak, siz ${chars.length} ta yubordingiz` };
        for (let j = 0; j < closed.length; j++) {
          const q = closed[j];
          const v = chars[j].length > 1 ? convMany(q, chars[j]) : conv(q, chars[j]);
          if (v == null) return { error: `${q + 1}-savol uchun "${chars[j]}" javobi mumkin emas` };
          out[q] = v;
        }
      }
      return { answers: out.join('') };
    },

    /* Sinxronlash uchun: id + _u bo'yicha birlashtirish. */
    mergeData(local, remote) {
      const out = Object.assign({}, remote, local);
      const del = Object.assign({}, remote.deleted || {}, local.deleted || {});
      for (const k of ['users', 'groups', 'students', 'tests', 'results', 'appeals', 'broadcasts']) {
        const map = new Map();
        for (const it of (remote[k] || [])) map.set(it.id, it);
        for (const it of (local[k] || [])) { const o = map.get(it.id); if (!o || (it._u || 0) >= (o._u || 0)) map.set(it.id, it); }
        out[k] = [...map.values()].filter(it => !(del[it.id] && del[it.id] >= (it._u || 0)));
      }
      out.deleted = del;
      const lc = local._cu || 0, rc = remote._cu || 0;
      if (rc > lc) { out.center = remote.center; out.settings = remote.settings; out._cu = rc; }
      else { out.center = local.center; out.settings = local.settings; out._cu = lc; }
      return out;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Core;
  else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
