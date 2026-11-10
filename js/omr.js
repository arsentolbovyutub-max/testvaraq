/* TestVaraq varaqlari uchun optik belgi o'qish (OMR).
   detect(canvas): QR va 4 burchak markerini topadi, gomografiya quradi.
   read(state, test): har doirachani o'lchaydi; javoblar satri + shubhali (xira/ikki belgi) savollar. */
const OMR = {
  detect(source, opts = {}) {
    const maxDim = opts.maxDim || 1600;
    const sw = source.width, sh = source.height;
    const s = Math.min(1, maxDim / Math.max(sw, sh));
    const w = Math.round(sw * s), h = Math.round(sh * s);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, w, h);
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data, gray = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
    return this.detectGray(gray, w, h, Object.assign({ rgba: d, canvas: c }, opts));
  },

  /* Kulrang massiv bilan ishlaydi (testlash uchun ham). */
  detectGray(gray, w, h, opts = {}) {
    const jsqr = typeof jsQR !== 'undefined' ? jsQR : opts.jsQR;
    let qr = null;
    if (jsqr && !opts.skipQR && opts.rgba) {
      const q = jsqr(opts.rgba, w, h, { inversionAttempts: 'dontInvert' });
      if (q && Sheet.parse(q.data)) {
        const L = q.location;
        qr = { data: q.data, center: [(L.topLeftCorner.x + L.bottomRightCorner.x + L.topRightCorner.x + L.bottomLeftCorner.x) / 4, (L.topLeftCorner.y + L.bottomRightCorner.y + L.topRightCorner.y + L.bottomLeftCorner.y) / 4] };
      }
    }
    const markers = this.findMarkers(gray, w, h);
    const state = { ok: false, qr, canvas: opts.canvas, gray, w, h, markers };
    if (!markers) { state.error = "Burchakdagi 4 ta qora kvadrat topilmadi. Varaq to'liq kadrga tushsin."; return state; }

    const tpl = Sheet.markerCenters();
    const Hs = [0, 1, 2, 3].map(rot => this.homography(tpl, [0, 1, 2, 3].map(k => markers[(k + rot) % 4])));
    if (!qr && jsqr && !opts.skipQR) {
      // Rasmda QR o'qilmadi: har bir yo'nalish uchun QR maydonini tekislab, qayta o'qiymiz.
      for (let rot = 0; rot < 4 && !qr; rot++) {
        const H = Hs[rot];
        if (!H) continue;
        const pad = 24, x0 = Sheet.QR.x - pad, y0 = Sheet.QR.y - pad, S = Sheet.QR.s + pad * 2;
        const img = new Uint8ClampedArray(S * S * 4);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          const [u, v] = this.apply(H, x0 + x, y0 + y);
          const xi = Math.round(u), yi = Math.round(v);
          const g = (xi >= 0 && yi >= 0 && xi < w && yi < h) ? gray[yi * w + xi] : 255;
          const o = (y * S + x) * 4; img[o] = img[o + 1] = img[o + 2] = g; img[o + 3] = 255;
        }
        const q = jsqr(img, S, S, { inversionAttempts: 'dontInvert' });
        if (q && Sheet.parse(q.data)) { qr = { data: q.data, center: this.apply(H, ...Sheet.qrCenter()) }; state.qr = qr; }
      }
    }
    let best = null;
    if (qr) {
      let bestD = Infinity;
      Hs.forEach(H => {
        if (!H) return;
        const [qx, qy] = this.apply(H, ...Sheet.qrCenter());
        const dd = Math.hypot(qx - qr.center[0], qy - qr.center[1]);
        if (dd < bestD) { bestD = dd; best = H; }
      });
    } else {
      // QR yo'q: varaq yo'nalishini QR maydonidagi qora nuqtalar zichligi bo'yicha aniqlaymiz.
      let bestDen = -1;
      Hs.forEach(H => {
        if (!H) return;
        const den = this.darkDensity(gray, w, h, H, Sheet.QR);
        if (den > bestDen) { bestDen = den; best = H; }
      });
    }
    if (!best) { state.error = 'Varaq geometriyasi aniqlanmadi'; return state; }
    state.H = best; state.ok = true;
    return state;
  },

  darkDensity(gray, w, h, H, box) {
    let dark = 0, n = 0;
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) {
      const [u, v] = this.apply(H, box.x + box.s * (i + 0.5) / 20, box.y + box.s * (j + 0.5) / 20);
      const xi = Math.round(u), yi = Math.round(v);
      n++;
      if (xi >= 0 && yi >= 0 && xi < w && yi < h && gray[yi * w + xi] < 110) dark++;
    }
    return dark / n;
  },

  findMarkers(gray, w, h) {
    const W1 = w + 1;
    const ii = new Float64Array(W1 * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) { row += gray[y * w + x]; ii[(y + 1) * W1 + x + 1] = ii[y * W1 + x + 1] + row; }
    }
    const R = Math.max(8, Math.round(Math.max(w, h) / 14));
    const bin = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - R), y1 = Math.min(h, y + R + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 1);
        const sum = ii[y1 * W1 + x1] - ii[y0 * W1 + x1] - ii[y1 * W1 + x0] + ii[y0 * W1 + x0];
        const mean = sum / ((y1 - y0) * (x1 - x0));
        const v = gray[y * w + x];
        bin[y * w + x] = (v < mean - 28 && v < 150) ? 1 : 0;
      }
    }
    const lab = new Int32Array(w * h);
    const stack = new Int32Array(w * h);
    const big = Math.max(w, h);
    const minSide = big * 0.012, maxSide = big * 0.16;
    const cands = [];
    let next = 0;
    for (let i = 0; i < w * h; i++) {
      if (!bin[i] || lab[i]) continue;
      next++;
      let sp = 0; stack[sp++] = i; lab[i] = next;
      let n = 0, minx = w, maxx = 0, miny = h, maxy = 0, sx = 0, sy = 0;
      while (sp) {
        const p = stack[--sp];
        const x = p % w, y = (p - x) / w;
        n++; sx += x; sy += y;
        if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
        if (x > 0 && bin[p - 1] && !lab[p - 1]) { lab[p - 1] = next; stack[sp++] = p - 1; }
        if (x < w - 1 && bin[p + 1] && !lab[p + 1]) { lab[p + 1] = next; stack[sp++] = p + 1; }
        if (y > 0 && bin[p - w] && !lab[p - w]) { lab[p - w] = next; stack[sp++] = p - w; }
        if (y < h - 1 && bin[p + w] && !lab[p + w]) { lab[p + w] = next; stack[sp++] = p + w; }
      }
      const bw = maxx - minx + 1, bh = maxy - miny + 1;
      if (bw < minSide || bh < minSide || bw > maxSide || bh > maxSide) continue;
      const asp = bw / bh;
      if (asp < 0.5 || asp > 2) continue;
      const fill = n / (bw * bh);
      if (fill < 0.45) continue;
      const cx0 = Math.round(minx + bw * 0.3), cx1 = Math.round(maxx - bw * 0.3);
      const cy0 = Math.round(miny + bh * 0.3), cy1 = Math.round(maxy - bh * 0.3);
      let tot = 0, dark = 0;
      for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) { tot++; if (lab[y * w + x] === next) dark++; }
      if (!tot || dark / tot < 0.93) continue;
      cands.push({ n, x: sx / n, y: sy / n, bw, bh });
    }
    if (cands.length < 4) return null;
    cands.sort((a, b) => b.n - a.n);
    const top = cands.slice(0, 14);
    let best = null, bestArea = 0;
    for (const ref of top) {
      const S = top.filter(c => c.n >= ref.n * 0.45 && c.n <= ref.n * 2.2);
      if (S.length < 4) continue;
      const tl = S.reduce((a, c) => (c.x + c.y < a.x + a.y ? c : a));
      const br = S.reduce((a, c) => (c.x + c.y > a.x + a.y ? c : a));
      const tr = S.reduce((a, c) => (c.x - c.y > a.x - a.y ? c : a));
      const bl = S.reduce((a, c) => (c.x - c.y < a.x - a.y ? c : a));
      if (new Set([tl, tr, br, bl]).size < 4) continue;
      const pts = [tl, tr, br, bl];
      let area = 0;
      for (let k = 0; k < 4; k++) { const a = pts[k], b = pts[(k + 1) % 4]; area += a.x * b.y - b.x * a.y; }
      area = Math.abs(area) / 2;
      if (area > bestArea) { bestArea = area; best = pts; }
    }
    if (!best || bestArea < w * h * 0.12) return null;
    return best.map(p => [p.x, p.y]);
  },

  homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const n = 8;
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-10) return null;
      [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        if (!f) continue;
        for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    return b.map((v, i) => v / A[i][i]).concat([1]);
  },
  apply(H, x, y) {
    const d = H[6] * x + H[7] * y + 1;
    return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d];
  },

  /* flags[q]: 'multi' | 'faint' | null */
  read(state, test) {
    const { gray, w, h, H } = state;
    const L = Sheet.layout(test);
    const g = (x, y) => {
      const [u, v] = this.apply(H, x, y);
      const xi = Math.round(u), yi = Math.round(v);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) return 255;
      return gray[yi * w + xi];
    };
    const offsFor = rad => {
      const rr = rad * 0.62, st = Math.max(1, rad * 0.2), o = [];
      for (let dy = -rr; dy <= rr + 1e-6; dy += st) for (let dx = -rr; dx <= rr + 1e-6; dx += st) if (dx * dx + dy * dy <= rr * rr) o.push([dx, dy]);
      return o;
    };
    const offsCache = {};
    const n = L.info.length;
    const marks = [], answers = [], flags = [];
    const T = 0.33, WEAK = 0.22;
    for (let q = 0; q < n; q++) {
      const k = L.nopts(q);
      const rad = L.radius(q);
      const offs = offsCache[rad] || (offsCache[rad] = offsFor(rad));
      let white = 0, wn = 0;
      for (let j = 0; j < k - 1; j++) {
        const [gx, gy] = L.gap(q, j);
        for (const [dx, dy] of [[0, 0], [0, -4], [0, 4]]) { white += g(gx + dx, gy + dy); wn++; }
      }
      const [x0, y0] = L.bubble(q, 0);
      for (const dy of [-rad - 5, rad + 5]) { white += g(x0, y0 + dy); wn++; }
      white = Math.max(60, white / wn);
      const vals = [];
      for (let o = 0; o < k; o++) {
        const [cx, cy] = L.bubble(q, o);
        let sum = 0;
        for (const [dx, dy] of offs) sum += g(cx + dx, cy + dy);
        vals.push(Math.max(0, Math.min(1, (white - sum / offs.length) / white)));
      }
      marks.push(vals);
      const codes = Core.codes(L.info[q].sec);
      const sorted = vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
      const second = sorted[1] ? sorted[1][0] : 0;
      let a = '-', f = null;
      if (sorted[0][0] < T) { if (sorted[0][0] >= WEAK && sorted[0][0] - second > 0.12) f = 'faint'; }
      else if (second >= T && second >= sorted[0][0] * 0.7) { a = '*'; f = 'multi'; }
      else { a = codes[sorted[0][1]]; if (sorted[0][0] < 0.45) f = 'faint'; }
      answers.push(a); flags.push(f);
    }
    return { answers: answers.join(''), marks, flags };
  },

  /* Aniqlangan javoblarni rasm ustiga chizish. */
  overlay(state, test, answers, key, flags) {
    const c = document.createElement('canvas');
    c.width = state.canvas.width; c.height = state.canvas.height;
    const g = c.getContext('2d');
    g.drawImage(state.canvas, 0, 0);
    if (!state.H) return c;
    const L = Sheet.layout(test);
    const unit = Math.hypot(...this.apply(state.H, 10, 0).map((v, i) => v - this.apply(state.H, 0, 0)[i])) / 10;
    g.lineWidth = Math.max(2, unit * 3);
    for (const p of state.markers) { g.strokeStyle = '#2563eb'; g.strokeRect(p[0] - 8, p[1] - 8, 16, 16); }
    for (let q = 0; q < L.info.length; q++) {
      const a = answers[q], k = key ? key[q] : null;
      const codes = Core.codes(L.info[q].sec);
      codes.forEach((code, o) => {
        const [x, y] = this.apply(state.H, ...L.bubble(q, o));
        let col = null;
        if (a === '*') col = '#f59e0b';
        if (a === code) col = (!k || k === '-') ? '#2563eb' : (a === k ? '#16a34a' : '#dc2626');
        else if (k === code && a !== k) col = '#16a34a88';
        if (flags && flags[q] === 'faint' && (a === code || a === '-')) col = '#f59e0b';
        if (!col) return;
        g.strokeStyle = col; g.beginPath(); g.arc(x, y, unit * L.radius(q) * 1.3, 0, Math.PI * 2); g.stroke();
      });
    }
    return c;
  }
};
