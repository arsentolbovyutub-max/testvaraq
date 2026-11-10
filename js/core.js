/* Test tuzilmasi va ball hisoblash yadrosi. Brauzerda (global Core) va serverda (require) bir xil ishlaydi.
   Javoblar satri: har savolga 1 belgi. Tanlov: A–F; True/False: A = True, B = False; yozma savol: '+' to'g'ri, 'x' noto'g'ri.
   '-' = bo'sh / baholanmagan, '*' = bir nechta belgi. */
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
    show(s, ch) {
      if (!ch || ch === '-') return '—';
      if (ch === '*') return '2+';
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
      return '—';
    },

    /* Rasch (1PL), JML. Shkala: T = 50 + 10·θ (savollar qiyinligi o'rtachasi 0), 0..75.
       Guruh o'rtachasiga bog'lanmaydi: kuchli guruh yuqori, kuchsiz guruh past ball oladi. */
    raschFit(X) {
      const P = X.length, I = P ? X[0].length : 0;
      const sig = x => 1 / (1 + Math.exp(-x));
      const cl = (s, n) => Math.min(n - 0.3, Math.max(0.3, s));
      const pr = X.map(r => r.reduce((a, b) => a + b, 0));
      const ir = Array.from({ length: I }, (_, i) => X.reduce((a, r) => a + r[i], 0));
      const few = P < 3;
      const th = pr.map(s => (I ? Math.log(cl(s, I) / (I - cl(s, I))) : 0));
      const b = ir.map(s => (few ? 0 : Math.log((P - cl(s, P)) / cl(s, P))));
      for (let it = 0; it < 300; it++) {
        let md = 0;
        if (!few) {
          for (let i = 0; i < I; i++) {
            let e = 0, v = 0;
            for (let p = 0; p < P; p++) { const q = sig(th[p] - b[i]); e += q; v += q * (1 - q); }
            const d = Math.max(-1, Math.min(1, (e - cl(ir[i], P)) / (v || 1e-6)));
            b[i] += d; md = Math.max(md, Math.abs(d));
          }
          const mean = b.reduce((a, x) => a + x, 0) / (I || 1);
          for (let i = 0; i < I; i++) b[i] -= mean;
        }
        for (let p = 0; p < P; p++) {
          let e = 0, v = 0;
          for (let i = 0; i < I; i++) { const q = sig(th[p] - b[i]); e += q; v += q * (1 - q); }
          const d = Math.max(-1, Math.min(1, (cl(pr[p], I) - e) / (v || 1e-6)));
          th[p] += d; md = Math.max(md, Math.abs(d));
        }
        if (md < 1e-5) break;
      }
      const c = !few && I > 1 ? (I - 1) / I : 1;
      return { theta: th, b: b.map(x => x * c), raw: pr, items: ir, few };
    },

    rasch(test, results) {
      const n = this.qCount(test);
      const X = results.map(r => this.marks(test, r).map(v => (v === 1 ? 1 : 0)));
      const F = this.raschFit(X);
      const P = X.length;
      const items = [];
      for (let i = 0; i < n; i++) items.push({ q: i + 1, s: F.items[i] || 0, p: P ? (F.items[i] || 0) / P : 0, b: round2(F.b[i] || 0) });
      const byResult = {};
      results.forEach((r, k) => {
        const T = round1(Math.max(0, Math.min(75, 50 + 10 * F.theta[k])));
        byResult[r.id] = { theta: round2(F.theta[k]), T, grade: this.grade(T), raw: F.raw[k] };
      });
      return { byResult, items, few: F.few };
    },

    /* Reyting (teng ballarga bir xil o'rin). studentOf(r) -> student. */
    table(test, results, studentOf, groupOf) {
      const R = test.type === 'rasch' ? this.rasch(test, results) : null;
      const rows = results.map(r => {
        const st = studentOf ? studentOf(r) : null;
        const ev = this.evaluate(test, r, st);
        const g = st && st.groupId && groupOf ? groupOf(st.groupId) : null;
        const row = { r, ev, st, name: st ? st.name : (r.guestName || "Noma'lum"), group: g ? g.name : '', score: ev.points };
        if (R) { const x = R.byResult[r.id]; row.T = x.T; row.grade = x.grade; row.score = x.T; }
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
      if (/^\s*\d{1,3}\s*[-.):]?\s*[A-FT]/.test(s)) {
        const re = /(\d{1,3})\s*[-.):]?\s*([A-FT+\-])/g;
        let m, k = 0;
        while ((m = re.exec(s))) {
          const q = +m[1] - 1;
          if (q < 0 || q >= info.length || info[q].kind === 'open') continue;
          const v = conv(q, m[2]);
          if (v == null) return { error: `${q + 1}-savol uchun "${m[2]}" javobi mumkin emas` };
          out[q] = v; k++;
        }
        if (!k) return { error: 'Javoblar topilmadi' };
      } else {
        const chars = s.replace(/TRUE/g, 'T').replace(/FALSE/g, 'F').replace(/\s+/g, '').split('');
        if (chars.length !== closed.length) return { error: `${closed.length} ta javob kerak, siz ${chars.length} ta yubordingiz` };
        for (let j = 0; j < closed.length; j++) {
          const q = closed[j];
          const v = conv(q, chars[j]);
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
