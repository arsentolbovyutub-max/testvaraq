/* Javob varaqasi: chizish (printer) va o'qish (skaner) uchun umumiy geometriya. A4, 150 dpi.
   Bo'limlar har xil bo'lishi mumkin: 2–6 variant, True/False, yozma javob (o'qituvchi ✓/✗ belgilaydi). */
const Sheet = {
  W: 1240, H: 1754, MS: 64,
  markers: [[40, 40], [1136, 40], [1136, 1650], [40, 1650]],          // TL, TR, BR, BL (kvadratning chap-yuqori burchagi)
  markerCenters() { return this.markers.map(([x, y]) => [x + this.MS / 2, y + this.MS / 2]); },
  QR: { x: 890, y: 130, s: 250 },
  qrCenter() { return [this.QR.x + this.QR.s / 2, this.QR.y + this.QR.s / 2]; },
  TOP: 500, BOTTOM: 1632, LEFT: 120, RIGHT: 1130, ROWH: 37, OPENH: 62,

  /* test -> joylashuv. Eski chaqiruv layout(n) ham ishlaydi (4 variantli bitta bo'lim). */
  layout(test) {
    if (typeof test === 'number') test = { sections: [{ count: test, kind: 'choice', options: 4, weight: 1 }] };
    const info = Core.qInfo(test);
    const choiceQ = [], openQ = [];
    info.forEach((x, q) => (x.kind === 'open' ? openQ : choiceQ).push(q));
    const openH = openQ.length ? 34 + openQ.length * this.OPENH : 0;
    const avail = this.BOTTOM - this.TOP - openH;
    let rows = Math.max(1, Math.min(30, Math.floor(avail / this.ROWH)));
    const nC = choiceQ.length;
    let cols = Math.max(1, Math.ceil(nC / rows));
    if (nC && cols > 1) rows = Math.ceil(nC / cols); // ustunlarni tenglashtirish
    const maxOpt = Math.max(2, ...info.filter(x => x.kind !== 'open').map(x => Core.opts(x.sec)));
    const colW = (this.RIGHT - this.LEFT) / cols;
    const sp = Math.min(58, (colW - 70) / maxOpt);
    const r = Math.min(13, sp * 0.3);
    const pos = new Array(info.length);
    choiceQ.forEach((q, j) => { pos[q] = { col: Math.floor(j / rows), row: j % rows }; });
    const openTop = this.TOP + rows * this.ROWH + 24;
    openQ.forEach((q, j) => { pos[q] = { open: true, y: openTop + 30 + j * this.OPENH + this.OPENH / 2 }; });
    const L = {
      test, info, rows, cols, colW, sp, r, choiceQ, openQ, openTop, top: this.TOP, rowH: this.ROWH, left: this.LEFT,
      fits: cols <= 4 && sp >= 26 && rows >= 6 && openQ.length <= 12,
      colX(c) { return Sheet.LEFT + c * colW; },
      nopts(q) { return Core.opts(info[q].sec); },
      bubble(q, k) {
        const p = pos[q];
        if (p.open) return [Sheet.RIGHT - 110 + k * 64, p.y];
        return [Sheet.LEFT + p.col * colW + 58 + k * sp + r, Sheet.TOP + p.row * Sheet.ROWH + Sheet.ROWH / 2];
      },
      radius(q) { return pos[q].open ? 15 : r; },
      /* Doirachalar orasidagi oq qog'oz nuqtasi (oq fon uchun). */
      gap(q, k) {
        const [x, y] = this.bubble(q, k);
        if (pos[q].open) return [x + 32, y];
        return [x + sp / 2, y];
      },
      rowY(q) { return pos[q].open ? pos[q].y : Sheet.TOP + pos[q].row * Sheet.ROWH + Sheet.ROWH / 2; },
      pos(q) { return pos[q]; }
    };
    return L;
  },

  payload(test, student, variant) { return ['TV', test.id, student ? student.id : '', variant || ''].join('|'); },
  parse(data) {
    const p = String(data || '').split('|');
    if (p[0] !== 'TV' || !p[1]) return null;
    return { testId: p[1], studentId: p[2] || '', variant: p[3] || '' };
  },

  /* Bitta varaqni yangi canvas'ga chizish. */
  render({ center, test, student, group, variant }) {
    const c = document.createElement('canvas');
    c.width = this.W; c.height = this.H;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, this.W, this.H);
    g.fillStyle = '#000';
    for (const [x, y] of this.markers) g.fillRect(x, y, this.MS, this.MS);

    const n = Core.qCount(test);
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

    const L = this.layout(test);
    // Sertifikat bilan yopilgan bo'limlar
    const closed = new Set();
    if (test.type === 'block' && student) {
      let st = 0;
      test.sections.forEach(s => { if (Core.certFor(test, s, student)) for (let q = st; q < st + s.count; q++) closed.add(q); st += s.count; });
    }
    // Bo'lim sarlavhalari va ajratgich chiziqlar
    let start = 0;
    const multi = test.sections.length > 1;
    for (const s of test.sections) {
      const kind = Core.kind(s);
      if (kind === 'open' || !s.count) { start += s.count; continue; }
      const p = L.pos(start);
      const x0 = L.colX(p.col);
      const yy = L.top + p.row * L.rowH;
      if (p.row !== 0) { g.strokeStyle = '#999'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0 + 8, yy); g.lineTo(x0 + L.colW - 12, yy); g.stroke(); }
      if (multi) {
        const extra = kind === 'tf' ? ' (T/F)' : Core.opts(s) !== 4 ? ` (${Core.opts(s)} v.)` : '';
        g.fillStyle = '#0f766e'; g.textAlign = 'left';
        if (p.row === 0) { g.font = 'bold 15px Arial, sans-serif'; g.fillText(`${start + 1}–${start + s.count}: ${s.title}${extra}`.slice(0, 40), x0 + 8, L.top - 10); }
        else { g.save(); g.font = 'bold 12px Arial, sans-serif'; g.textAlign = 'right'; g.fillText((s.title + extra).slice(0, 16), x0 + L.colW - 4, yy - 4); g.restore(); }
      }
      start += s.count;
    }
    g.textAlign = 'center';
    for (const q of L.choiceQ) {
      const [x1, y1] = L.bubble(q, 0);
      g.fillStyle = '#000'; g.font = 'bold 18px Arial, sans-serif'; g.textAlign = 'right';
      g.fillText(String(q + 1), x1 - L.r - 10, y1 + 6);
      g.textAlign = 'center';
      if (closed.has(q)) { g.fillStyle = '#bbb'; g.font = '14px Arial, sans-serif'; g.textAlign = 'left'; g.fillText('sertifikat', x1 - L.r, y1 + 5); g.textAlign = 'center'; continue; }
      const labels = Core.labels(L.info[q].sec);
      labels.forEach((lab, k) => {
        const [x, yb] = L.bubble(q, k);
        g.beginPath(); g.arc(x, yb, L.r, 0, Math.PI * 2);
        g.strokeStyle = '#222'; g.lineWidth = 2; g.stroke();
        g.fillStyle = '#b8b8b8'; g.font = `${Math.round(L.r * 1.05)}px Arial, sans-serif`;
        g.fillText(lab, x, yb + L.r * 0.38);
      });
    }
    // Yozma javoblar
    if (L.openQ.length) {
      g.textAlign = 'left'; g.fillStyle = '#0f766e'; g.font = 'bold 15px Arial, sans-serif';
      g.fillText("Yozma javoblar (o'quvchi yozadi, o'qituvchi o'ngdagi ✓ yoki ✗ doirachani bo'yaydi)", this.LEFT + 8, L.openTop + 14);
      for (const q of L.openQ) {
        const yy = L.rowY(q);
        g.fillStyle = '#000'; g.font = 'bold 20px Arial, sans-serif'; g.textAlign = 'right';
        g.fillText(String(q + 1), this.LEFT + 40, yy + 7);
        g.strokeStyle = '#555'; g.lineWidth = 1.5;
        const bx = this.LEFT + 52, bw = this.RIGHT - 160 - bx, bh = this.OPENH - 14;
        g.strokeRect(bx, yy - bh / 2, bw, bh);
        g.strokeStyle = '#ddd'; g.lineWidth = 1;
        for (let x = bx + 32; x < bx + bw; x += 32) { g.beginPath(); g.moveTo(x, yy - bh / 2); g.lineTo(x, yy + bh / 2); g.stroke(); }
        ['✓', '✗'].forEach((lab, k) => {
          const [x, yb] = L.bubble(q, k);
          g.beginPath(); g.arc(x, yb, 15, 0, Math.PI * 2); g.strokeStyle = '#222'; g.lineWidth = 2; g.stroke();
          g.fillStyle = '#b8b8b8'; g.font = '16px Arial, sans-serif'; g.textAlign = 'center'; g.fillText(lab, x, yb + 6);
        });
      }
    }
    g.textAlign = 'left';
    g.fillStyle = '#777'; g.font = '16px Arial, sans-serif';
    g.fillText('TestVaraq · ' + this.payload(test, student, variant), 130, 1690);
    return c;
  }
};
