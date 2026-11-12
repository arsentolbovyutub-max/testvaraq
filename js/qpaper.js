/* Savol varag'i: rasm (OCR, Tesseract), PDF (pdf.js), Word .docx (mammoth) yoki matn fayli -> savollar soni, har savol variantlari (A–F / True-False / yozma) va kalit.
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

  loadScript(src, globalName) {
    this._s = this._s || {};
    if (this._s[src]) return this._s[src];
    this._s[src] = new Promise((res, rej) => {
      if (window[globalName]) return res(window[globalName]);
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => res(window[globalName]);
      el.onerror = () => { this._s[src] = null; rej(new Error('Kutubxona yuklanmadi (internet kerak)')); };
      document.head.appendChild(el);
    });
    return this._s[src];
  },
  PDFJS: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  PDFJS_WORKER: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  MAMMOTH: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',

  kind(f) {
    const n = (f.name || '').toLowerCase(), t = f.type || '';
    if (t === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
    if (n.endsWith('.docx') || t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    if (n.endsWith('.doc') || t === 'application/msword') return 'doc';
    if (n.endsWith('.txt') || t === 'text/plain') return 'txt';
    return 'image';
  },

  /* Rasm(lar)ni OCR qilish. */
  async ocrCanvases(canvases, onProgress) {
    const T = await this.loadLib();
    const worker = await T.createWorker('eng+rus', 1, { logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress); } });
    let text = '';
    try {
      for (let i = 0; i < canvases.length; i++) {
        if (onProgress) onProgress(0, i + 1, canvases.length);
        const r = await worker.recognize(this.prep(canvases[i]));
        text += '\n' + r.data.text;
      }
    } finally { await worker.terminate(); }
    return text;
  },

  /* PDF: matn qatlami bo'lsa to'g'ridan-to'g'ri o'qiladi; skanerlangan sahifa — rasmga aylantirilib OCR qilinadi. */
  async pdfText(file, onProgress) {
    const lib = await this.loadScript(this.PDFJS, 'pdfjsLib');
    lib.GlobalWorkerOptions.workerSrc = this.PDFJS_WORKER;
    const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    let text = '';
    const scans = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      if (onProgress) onProgress(0, p, pdf.numPages);
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      // Matn bo'laklarini qatorlarga yig'ish (y bo'yicha), qator ichida x bo'yicha.
      const rows = new Map();
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const y = Math.round(it.transform[5] / 3) * 3;
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push({ x: it.transform[4], s: it.str, bold: /bold|black|heavy/i.test((tc.styles[it.fontName] || {}).fontFamily || it.fontName || '') });
      }
      const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, its]) => its.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim());
      const pt = lines.join('\n');
      if (pt.replace(/\s/g, '').length < 30) {
        const vp = page.getViewport({ scale: 2 });
        const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        scans.push(c);
      } else text += '\n' + pt;
    }
    if (scans.length) text += '\n' + await this.ocrCanvases(scans, onProgress);
    return text;
  },

  /* Word (.docx): matn; qalin (bold) yoki tagiga chizilgan variant — to'g'ri javob deb belgilanadi (*). */
  async docxText(file) {
    const m = await this.loadScript(this.MAMMOTH, 'mammoth');
    const r = await m.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, { styleMap: ['u => u'] });
    const div = document.createElement('div');
    div.innerHTML = r.value;
    div.querySelectorAll('strong, b, u').forEach(el => {
      const t = el.textContent.trim();
      if (/^[A-Fa-f]\s*[).]/.test(t)) el.textContent = '*' + t;
    });
    div.querySelectorAll('p, li, tr, h1, h2, h3, h4, br').forEach(el => el.insertAdjacentText('afterend', '\n'));
    div.querySelectorAll('td').forEach(el => el.insertAdjacentText('afterend', '  '));
    return div.textContent;
  },

  /* Har qanday fayllar (rasm, PDF, Word, matn) -> bitta matn. */
  async recognize(files, onProgress) {
    let text = '';
    const imgs = [];
    for (const f of files) {
      const k = this.kind(f);
      if (k === 'pdf') text += '\n' + await this.pdfText(f, onProgress);
      else if (k === 'docx') text += '\n' + await this.docxText(f);
      else if (k === 'txt') text += '\n' + await f.text();
      else if (k === 'doc') throw new Error('Eski .doc formati o‘qilmaydi — Word’da "Saqlash: .docx" qilib qayta yuklang.');
      else imgs.push(await loadImageFile(f));
    }
    if (imgs.length) text += '\n' + await this.ocrCanvases(imgs, onProgress);
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
        const re = /(\d{1,3})\s*[-.):=]?\s*([A-F](?:\s*,\s*[A-F]|[A-F])*)\b/gi;
        let m, k = 0;
        const CoreK = typeof Core !== 'undefined' ? Core : require('./core.js');
        while ((m = re.exec(ln))) { const ls = m[2].toUpperCase().replace(/[^A-F]/g, '').split(''); keyList[+m[1]] = ls.length > 1 ? CoreK.encSet(ls) : ls[0]; k++; }
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
      const marked = [];
      const reO = /(^|[\s(;,])([*+✓]?)\s*([A-Fa-f])\s*[).]\s*([*+✓]?)/g;
      let m;
      while ((m = reO.exec(t))) {
        const L = m[3].toUpperCase();
        letters.add(L);
        if ((m[2] || m[4]) && !marked.includes(L)) marked.push(L);
      }
      let kind = 'choice', options = 4;
      if (letters.size >= 2) options = Math.max(2, Math.max(...[...letters].map(L => 'ABCDEF'.indexOf(L))) + 1);
      else if (/\b(true|false)\b|to.?g.?ri\s*\/\s*noto.?g.?ri|верно|неверно/i.test(t) || isTF(keyList[n])) kind = 'tf';
      else if (q) kind = keyList[n] ? 'choice' : 'open';
      const CoreR = typeof Core !== 'undefined' ? Core : require('./core.js');
      let key = keyList[n] || (marked.length > 1 ? CoreR.encSet(marked) : marked[0]) || null;
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
