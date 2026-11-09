/* Optical mark recognition for TestVaraq sheets.
   detect(canvas): finds the QR code and the 4 corner markers, builds a homography.
   read(state, n): samples every bubble and returns the answer string. */
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

    let qr = null;
    if (window.jsQR && !opts.skipQR) {
      const q = jsQR(d, w, h, { inversionAttempts: 'dontInvert' });
      if (q) {
        const L = q.location;
        qr = { data: q.data, center: [(L.topLeftCorner.x + L.bottomRightCorner.x + L.topRightCorner.x + L.bottomLeftCorner.x) / 4, (L.topLeftCorner.y + L.bottomRightCorner.y + L.topRightCorner.y + L.bottomLeftCorner.y) / 4] };
      }
    }

    const markers = this.findMarkers(gray, w, h);
    const state = { ok: false, qr, canvas: c, gray, w, h, markers };
    if (!markers) { state.error = "Burchakdagi 4 ta qora kvadrat topilmadi. Varaq to'liq kadrga tushsin."; return state; }

    const tpl = Sheet.markerCenters();
    if (!qr && window.jsQR && !opts.skipQR) {
      // QR not found in the raw photo: rectify the QR area for each orientation and decode it there
      for (let rot = 0; rot < 4 && !qr; rot++) {
        const H = this.homography(tpl, [0, 1, 2, 3].map(k => markers[(k + rot) % 4]));
        if (!H) continue;
        const pad = 24, x0 = Sheet.QR.x - pad, y0 = Sheet.QR.y - pad, S = Sheet.QR.s + pad * 2;
        const img = new Uint8ClampedArray(S * S * 4);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          const [u, v] = this.apply(H, x0 + x, y0 + y);
          const xi = Math.round(u), yi = Math.round(v);
          const g = (xi >= 0 && yi >= 0 && xi < w && yi < h) ? gray[yi * w + xi] : 255;
          const o = (y * S + x) * 4; img[o] = img[o + 1] = img[o + 2] = g; img[o + 3] = 255;
        }
        const q = jsQR(img, S, S, { inversionAttempts: 'dontInvert' });
        if (q && Sheet.parse(q.data)) { qr = { data: q.data, center: this.apply(H, ...Sheet.qrCenter()) }; state.qr = qr; }
      }
    }
    let best = null, bestD = Infinity;
    for (let rot = 0; rot < 4; rot++) {
      const pts = [0, 1, 2, 3].map(k => markers[(k + rot) % 4]);
      const H = this.homography(tpl, pts);
      if (!H) continue;
      if (!qr) { if (rot === 0) { best = H; } continue; }
      const [qx, qy] = this.apply(H, ...Sheet.qrCenter());
      const dd = Math.hypot(qx - qr.center[0], qy - qr.center[1]);
      if (dd < bestD) { bestD = dd; best = H; }
    }
    if (!best) { state.error = 'Varaq geometriyasi aniqlanmadi'; return state; }
    state.H = best; state.ok = true;
    return state;
  },

  findMarkers(gray, w, h) {
    // adaptive threshold with integral image
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
    // connected components (4-neighbour)
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
      // centre region must be solid (rejects QR finder rings and letters)
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
    // choose a set of similar-sized blobs that span the image the most
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

  read(state, n) {
    const { gray, w, h, H } = state;
    const L = Sheet.layout(n);
    const g = (x, y) => {
      const [u, v] = this.apply(H, x, y);
      const xi = Math.round(u), yi = Math.round(v);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) return 255;
      return gray[yi * w + xi];
    };
    const rr = L.r * 0.62, st = L.r * 0.2;
    const offs = [];
    for (let dy = -rr; dy <= rr + 1e-6; dy += st) for (let dx = -rr; dx <= rr + 1e-6; dx += st) if (dx * dx + dy * dy <= rr * rr) offs.push([dx, dy]);
    const marks = [], answers = [];
    for (let q = 0; q < n; q++) {
      // paper reference from the gaps between bubbles
      let white = 0, wn = 0;
      for (let k = 0; k < 3; k++) {
        const [gx, gy] = L.gap(q, k);
        for (const [dx, dy] of [[0, 0], [0, -4], [0, 4]]) { white += g(gx + dx, gy + dy); wn++; }
      }
      white = Math.max(60, white / wn);
      const vals = [];
      for (let k = 0; k < 4; k++) {
        const [cx, cy] = L.bubble(q, k);
        let sum = 0;
        for (const [dx, dy] of offs) sum += g(cx + dx, cy + dy);
        const mean = sum / offs.length;
        vals.push(Math.max(0, Math.min(1, (white - mean) / white)));
      }
      marks.push(vals);
      const sorted = vals.map((v, k) => [v, k]).sort((a, b) => b[0] - a[0]);
      const T = 0.33;
      if (sorted[0][0] < T) answers.push('-');
      else if (sorted[1][0] >= T && sorted[1][0] >= sorted[0][0] * 0.7) answers.push('*');
      else answers.push(OPTIONS[sorted[0][1]]);
    }
    return { answers: answers.join(''), marks };
  },

  /* Draws the detection over the photo. key: string, answers: string */
  overlay(state, n, answers, key) {
    const c = document.createElement('canvas');
    c.width = state.canvas.width; c.height = state.canvas.height;
    const g = c.getContext('2d');
    g.drawImage(state.canvas, 0, 0);
    if (!state.H) return c;
    const L = Sheet.layout(n);
    const scale = Math.hypot(...this.apply(state.H, L.r, 0).map((v, i) => v - this.apply(state.H, 0, 0)[i]));
    g.lineWidth = Math.max(2, scale * 0.25);
    for (const p of state.markers) { g.strokeStyle = '#2563eb'; g.strokeRect(p[0] - 8, p[1] - 8, 16, 16); }
    for (let q = 0; q < n; q++) {
      const a = answers[q], k = key ? key[q] : null;
      for (let o = 0; o < 4; o++) {
        const L1 = OPTIONS[o];
        const [x, y] = this.apply(state.H, ...L.bubble(q, o));
        let col = null;
        if (a === '*' && true) col = '#f59e0b';
        if (a === L1) col = (!k || k === '-') ? '#2563eb' : (a === k ? '#16a34a' : '#dc2626');
        else if (k === L1 && a !== k) col = '#16a34a88';
        if (!col) continue;
        g.strokeStyle = col; g.beginPath(); g.arc(x, y, scale * 1.25, 0, Math.PI * 2); g.stroke();
      }
    }
    return c;
  }
};
