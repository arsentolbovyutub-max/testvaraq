/* Answer sheet: geometry shared by the printer (draw) and the scanner (OMR). A4 at 150 dpi. */
const Sheet = {
  W: 1240, H: 1754, MS: 64,
  markers: [[40, 40], [1136, 40], [1136, 1650], [40, 1650]],          // TL, TR, BR, BL (top-left of square)
  markerCenters() { return this.markers.map(([x, y]) => [x + this.MS / 2, y + this.MS / 2]); },
  QR: { x: 890, y: 130, s: 250 },
  qrCenter() { return [this.QR.x + this.QR.s / 2, this.QR.y + this.QR.s / 2]; },
  ROWS: 30,

  layout(n) {
    const rows = this.ROWS, top = 500, rowH = 37, left = 120, right = 1130;
    const cols = Math.max(1, Math.ceil(n / rows));
    const colW = (right - left) / cols;
    const sp = Math.min(58, (colW - 70) / 4);
    const r = Math.min(13, sp * 0.3);
    return {
      n, rows, top, rowH, left, cols, colW, sp, r,
      colX(c) { return left + c * colW; },
      bubble(q, k) {
        const c = Math.floor(q / rows), row = q % rows;
        return [left + c * colW + 58 + k * sp + r, top + row * rowH + rowH / 2];
      },
      gap(q, k) { // paper point between bubble k and k+1 (k = 0..2)
        const [x, y] = this.bubble(q, k);
        return [x + sp / 2, y];
      }
    };
  },

  payload(test, student, variant) { return ['TV', test.id, student ? student.id : '', variant || ''].join('|'); },
  parse(data) {
    const p = String(data || '').split('|');
    if (p[0] !== 'TV' || !p[1]) return null;
    return { testId: p[1], studentId: p[2] || '', variant: p[3] || '' };
  },

  /* Draw one sheet on a new canvas. */
  render({ center, test, student, group, variant }) {
    const c = document.createElement('canvas');
    c.width = this.W; c.height = this.H;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, this.W, this.H);
    g.fillStyle = '#000';
    for (const [x, y] of this.markers) g.fillRect(x, y, this.MS, this.MS);

    const n = Scoring.qCount(test);
    g.textBaseline = 'alphabetic';
    g.font = 'bold 40px Arial, sans-serif';
    g.fillText('JAVOB VARAQASI', 130, 92);
    g.font = '22px Arial, sans-serif';
    g.fillStyle = '#333';
    g.fillText(center || '', 130, 128);

    const typeName = { block: 'Blok test (DTM)', simple: 'Oddiy test', rasch: 'Rasch test' }[test.type];
    const lines = [
      ['Test', test.name],
      ['Turi', `${typeName} · ${n} savol`],
      ['Sana', fmtDate(test.date)],
      ["O'quvchi", student ? student.name : ''],
      ['Guruh', group ? group.name : '']
    ];
    let y = 190;
    for (const [k, v] of lines) {
      g.fillStyle = '#666'; g.font = '20px Arial, sans-serif'; g.fillText(k + ':', 130, y);
      g.fillStyle = '#000'; g.font = 'bold 24px Arial, sans-serif';
      if (v) g.fillText(String(v).slice(0, 44), 250, y);
      else { g.fillRect(250, y + 4, 560, 2); }
      y += 46;
    }
    // variant box
    g.strokeStyle = '#000'; g.lineWidth = 3;
    g.strokeRect(130, 412, 210, 54);
    g.font = '20px Arial, sans-serif'; g.fillStyle = '#666'; g.fillText('Variant', 142, 446);
    g.font = 'bold 34px Arial, sans-serif'; g.fillStyle = '#000'; g.fillText(variant || '—', 250, 452);
    g.font = '17px Arial, sans-serif'; g.fillStyle = '#444';
    g.fillText("Doirachani to'liq bo'yang. Qora yoki ko'k ruchka. Varaqni buklamang.", 370, 446);

    // QR
    const qr = qrcode(0, 'M');
    qr.addData(this.payload(test, student, variant));
    qr.make();
    const m = qr.getModuleCount();
    const cell = Math.floor(this.QR.s / (m + 2));
    const off = this.QR.x + Math.floor((this.QR.s - cell * m) / 2), offY = this.QR.y + Math.floor((this.QR.s - cell * m) / 2);
    g.fillStyle = '#000';
    for (let r = 0; r < m; r++) for (let cc = 0; cc < m; cc++) if (qr.isDark(r, cc)) g.fillRect(off + cc * cell, offY + r * cell, cell, cell);

    // grid
    const L = this.layout(n);
    g.textAlign = 'center';
    // column headers / section separators
    let start = 0;
    g.font = 'bold 15px Arial, sans-serif';
    for (const s of test.sections) {
      const col = Math.floor(start / L.rows), row = start % L.rows;
      const x0 = L.colX(col);
      const yy = L.top + row * L.rowH;
      if (row !== 0) { g.strokeStyle = '#999'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0 + 8, yy); g.lineTo(x0 + L.colW - 12, yy); g.stroke(); }
      if (test.sections.length > 1) {
        g.fillStyle = '#0f766e'; g.textAlign = 'left';
        const label = `${start + 1}–${start + s.count}: ${s.title}`;
        if (row === 0) g.fillText(label.slice(0, 34), x0 + 8, L.top - 10);
        else {
          g.save(); g.font = 'bold 12px Arial, sans-serif'; g.textAlign = 'right';
          g.fillText(s.title.slice(0, 10), x0 + L.colW - 4, yy + L.rowH / 2 + 4);
          g.restore();
        }
        g.textAlign = 'center';
      }
      start += s.count;
    }
    for (let q = 0; q < n; q++) {
      const [x1, y1] = L.bubble(q, 0);
      g.fillStyle = '#000'; g.font = 'bold 18px Arial, sans-serif'; g.textAlign = 'right';
      g.fillText(String(q + 1), x1 - L.r - 10, y1 + 6);
      g.textAlign = 'center';
      for (let k = 0; k < 4; k++) {
        const [x, yb] = L.bubble(q, k);
        g.beginPath(); g.arc(x, yb, L.r, 0, Math.PI * 2);
        g.strokeStyle = '#222'; g.lineWidth = 2; g.stroke();
        g.fillStyle = '#b8b8b8'; g.font = `${Math.round(L.r * 1.05)}px Arial, sans-serif`;
        g.fillText(OPTIONS[k], x, yb + L.r * 0.38);
      }
    }
    g.textAlign = 'left';
    g.fillStyle = '#777'; g.font = '16px Arial, sans-serif';
    g.fillText('TestVaraq · ' + this.payload(test, student, variant), 130, 1690);
    return c;
  }
};
