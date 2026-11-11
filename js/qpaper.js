/* Savol varag'i: rasmni o'qish (OCR, Tesseract) -> savollar soni, har savol variantlari (A–F / True-False / yozma) va kalit.
   Kalit: varaqdagi "Javoblar: 1-A 2-C …" ro'yxatidan yoki to'g'ri variant yonidagi * / + belgisidan olinadi. */
const QPaper = {
  _lib: null,
  loadLib() {
    if (this._lib) return this._lib;
    this._lib = new Promise((res, rej) => {
      if (typeof Tesseract !== 'undefined') return res(Tesseract);
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = () => res(Tesseract);
      s.onerror = () => { this._lib = null; rej(new Error("OCR kutubxonasi yuklanmadi (internet kerak)")); };
      document.head.appendChild(s);
    });
    return this._lib;
  },

  /* Rasmni OCR uchun tayyorlash: kichraytirish/kattalashtirish, kulrang, kontrast. */
  prep(canvas) {
    const maxW = 2000, minW = 1400;
    const k = canvas.width > maxW ? maxW / canvas.width : canvas.width < minW ? minW / canvas.width : 1;
    const c = document.createElement('canvas');
    c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
    const g = c.getContext('2d');
    g.drawImage(canvas, 0, 0, c.width, c.height);
    const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const y = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
      const v = Math.max(0, Math.min(255, (y - 128) * 1.4 + 150));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    g.putImageData(id, 0, 0);
    return c;
  },

  async recognize(files, onProgress) {
    const T = await this.loadLib();
    const worker = await T.createWorker('eng+rus', 1, { logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress); } });
    let text = '';
    try {
      for (let i = 0; i < files.length; i++) {
        if (onProgress) onProgress(0, i + 1, files.length);
        const cv = this.prep(await loadImageFile(files[i]));
        const r = await worker.recognize(cv);
        text += '\n' + r.data.text;
      }
    } finally { await worker.terminate(); }
    return text;
  },

  /* Matndan savollar tuzilmasi. */
  parse(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/[|]/g, 'I').trim()).filter(Boolean);
    const keyList = {};
    let inKey = false;
    const qs = new Map();
    let cur = null;
    const reQ = /^(?:№\s*)?(\d{1,3})\s*[.)\]]\s*(.*)$/;
    for (const ln of lines) {
      if (/^(javoblar|javob kaliti|kalit|to.?g.?ri javoblar|answers?|answer key|ответы|ключ)\b/i.test(ln)) { inKey = true; }
      if (inKey) {
        const re = /(\d{1,3})\s*[-.):=]?\s*([A-F])\b/gi;
        let m, k = 0;
        while ((m = re.exec(ln))) { keyList[+m[1]] = m[2].toUpperCase(); k++; }
        const tf = /(\d{1,3})\s*[-.):=]?\s*(true|false|to.?g.?ri|noto.?g.?ri|верно|неверно)\b/gi;
        while ((m = tf.exec(ln))) { keyList[+m[1]] = /^(true|to.?g.?ri|верно)/i.test(m[2]) && !/^not/i.test(m[2]) ? 'T' : 'F'; k++; }
        if (k) continue;
      }
      const m = reQ.exec(ln);
      if (m && +m[1] > 0 && +m[1] <= 300 && (!cur || +m[1] > cur.n || !qs.has(+m[1]))) {
        // Variant qatori "1) ..." emasligini tekshirish: ketma-ket raqamlar.
        const n = +m[1];
        if (!cur || n === cur.n + 1 || !qs.size || (n > cur.n && n - cur.n <= 3)) {
          cur = { n, text: m[2] };
          qs.set(n, cur);
          continue;
        }
      }
      if (cur) cur.text += ' ' + ln;
    }
    const out = [];
    const maxN = Math.max(0, ...qs.keys(), ...Object.keys(keyList).map(Number));
    for (let n = 1; n <= maxN; n++) {
      const q = qs.get(n);
      const t = q ? q.text : '';
      const letters = new Set();
      let marked = null;
      const reO = /(^|[\s(;,])([*+✓]?)\s*([A-Fa-f])\s*[).]\s*([*+✓]?)/g;
      let m;
      while ((m = reO.exec(t))) {
        const L = m[3].toUpperCase();
        letters.add(L);
        if (m[2] || m[4]) marked = L;
      }
      let kind = 'choice', options = 4;
      if (letters.size >= 2) options = Math.max(2, Math.max(...[...letters].map(L => 'ABCDEF'.indexOf(L))) + 1);
      else if (/\b(true|false)\b|to.?g.?ri\s*\/\s*noto.?g.?ri|верно|неверно/i.test(t) || isTF(keyList[n])) kind = 'tf';
      else if (q) kind = keyList[n] ? 'choice' : 'open';
      let key = keyList[n] || marked || null;
      if (kind === 'tf' && key) key = key === 'T' || key === 'A' ? 'A' : 'B';
      if (kind === 'choice' && key && 'ABCDEF'.indexOf(key) >= options) options = 'ABCDEF'.indexOf(key) + 1;
      out.push({ n, kind, options: kind === 'choice' ? options : 2, key, found: !!q });
    }
    function isTF(k) { return k === 'T' || k === 'F'; }
    // Bo'limlar: bir xil turdagi ketma-ket savollar.
    const sections = [];
    for (const q of out) {
      const last = sections[sections.length - 1];
      if (last && last.kind === q.kind && last.options === q.options) last.count++;
      else sections.push({ kind: q.kind, options: q.options, count: 1 });
    }
    sections.forEach((s, i) => { s.title = `Bo'lim ${i + 1}`; s.weight = 1; });
    const key = out.map(q => (q.kind === 'open' ? '+' : q.key || '-')).join('');
    return { questions: out, sections, key, keyFound: out.filter(q => q.key).length, missing: out.filter(q => !q.found).map(q => q.n) };
  }
};
if (typeof module !== 'undefined') module.exports = QPaper;
