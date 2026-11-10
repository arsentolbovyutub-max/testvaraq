/* PDF: javob varaqalari, kalitlar, natijalar. Kirill va o'zbek harflari uchun DejaVu Sans shrifti ulanadi. */
const PDF = {
  _font: null,
  async loadFont() {
    if (this._font) return this._font;
    const get = async url => {
      const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(s);
    };
    try { this._font = { r: await get('fonts/DejaVuSans.ttf'), b: await get('fonts/DejaVuSans-Bold.ttf') }; }
    catch (e) { this._font = false; }
    return this._font;
  },
  async doc(orientation = 'p') {
    const { jsPDF } = window.jspdf;
    const d = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
    const f = await this.loadFont();
    if (f) {
      d.addFileToVFS('DejaVuSans.ttf', f.r); d.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
      d.addFileToVFS('DejaVuSans-Bold.ttf', f.b); d.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
      d.setFont('DejaVu', 'normal');
      d._tvFont = 'DejaVu';
    }
    return d;
  },
  T(d, s) { return d._tvFont ? String(s ?? '') : latin(s); },
  tbl(d, o) {
    const font = d._tvFont || 'helvetica';
    o.styles = Object.assign({ font }, o.styles || {});
    o.headStyles = Object.assign({ font, fontStyle: 'bold', fillColor: [15, 118, 110] }, o.headStyles || {});
    d.autoTable(o);
  },
  fname(s) { return latin(s).replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 60); },

  /* items: [{student, group, variant}] */
  async sheets(test, items) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const center = DB.data.center ? DB.data.center.name : '';
    for (let i = 0; i < items.length; i++) {
      if (i) doc.addPage();
      const it = items[i];
      const c = Sheet.render({ center, test, student: it.student, group: it.group, variant: it.variant });
      doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      if (i % 5 === 4) await new Promise(r => setTimeout(r, 0));
    }
    return doc.output('blob');
  },

  async key(test) {
    const doc = await this.doc();
    const T = s => this.T(doc, s);
    const center = DB.data.center ? DB.data.center.name : '';
    doc.setFontSize(16); doc.text(T(`Javob kaliti: ${test.name}`), 14, 16);
    doc.setFontSize(10); doc.text(T(`${center} · ${fmtDate(test.date)} · ${Core.qCount(test)} savol`), 14, 22);
    const info = Core.qInfo(test);
    const keys = test.variants.map(v => Core.normKey(test, v.key));
    const head = [['#', T("Bo'lim"), ...test.variants.map(v => 'Variant ' + v.code)]];
    const body = info.map((x, i) => [String(i + 1), T(x.first ? x.sec.title : ''), ...keys.map(k => (x.kind === 'open' ? T('yozma') : k[i] && k[i] !== '-' ? Core.show(x.sec, k[i]) : ''))]);
    this.tbl(doc, { head, body, startY: 27, theme: 'grid', styles: { fontSize: 9, cellPadding: 1.2, halign: 'center' },
      didParseCell: d => { if (d.section === 'body' && d.column.index === 0) d.cell.styles.fontStyle = 'bold'; } });
    if (test.sections.length > 1) {
      let y = doc.lastAutoTable.finalY + 6, start = 1;
      doc.setFontSize(9);
      for (const s of test.sections) { if (y > 285) { doc.addPage(); y = 15; } doc.text(T(`${start}-${start + s.count - 1}: ${s.title} · ${Core.KIND_NAME[Core.kind(s)]}${Core.kind(s) === 'choice' ? ' (' + Core.opts(s) + ' variant)' : ''} · ${s.weight} ball`), 14, y); y += 5; start += s.count; }
    }
    return doc.output('blob');
  },

  async results(test) {
    const { rows, rasch } = Scoring.table(test);
    const doc = await this.doc(test.type === 'block' || test.sections.length > 2 ? 'l' : 'p');
    const T = s => this.T(doc, s);
    const center = DB.data.center ? DB.data.center.name : '';
    doc.setFontSize(16); doc.text(T(`Natijalar: ${test.name}`), 14, 16);
    doc.setFontSize(10); doc.text(T(`${center} · ${fmtDate(test.date)} · ${rows.length} ta o'quvchi`), 14, 22);
    let head, body;
    if (test.type === 'rasch') {
      head = [['#', T("O'quvchi"), 'Guruh', T("To'g'ri"), 'Ball (Rasch)', 'Daraja', ...(test.sections.length > 1 ? test.sections.map(s => T(s.title)) : [])]];
      body = rows.map(x => [x.rank, T(x.name), T(x.group), `${x.ev.correct}/${x.ev.total}`, x.T, x.grade, ...(test.sections.length > 1 ? x.ev.sections.map(s => `${s.correct}/${s.count}`) : [])]);
    } else if (test.sections.length > 1) {
      head = [['#', T("O'quvchi"), 'Guruh', 'Var.', ...test.sections.map(s => T(s.title)), 'Ball', '%']];
      body = rows.map(x => [x.rank, T(x.name), T(x.group), x.r.variant, ...x.ev.sections.map(s => s.cert ? `${s.points} (${T(s.cert)})` : `${s.correct}/${s.count} · ${s.points}`), x.ev.points + ' / ' + x.ev.max, x.ev.percent + '%']);
    } else {
      head = [['#', T("O'quvchi"), 'Guruh', 'Var.', T("To'g'ri"), T("Noto'g'ri"), T("Bo'sh"), 'Ball', '%']];
      body = rows.map(x => [x.rank, T(x.name), T(x.group), x.r.variant, x.ev.correct, x.ev.wrong, x.ev.blank, x.ev.points, x.ev.percent + '%']);
    }
    this.tbl(doc, { head, body, startY: 27, theme: 'striped', styles: { fontSize: 9 } });
    if (rows.length) {
      doc.addPage();
      doc.setFontSize(14); doc.text(T('Savollar tahlili'), 14, 16);
      const info = Core.qInfo(test);
      const items = info.map((x, i) => {
        const right = rows.filter(r => r.ev.marks[i] === 1).length;
        return [i + 1, T(x.sec.title), right, Math.round(right / rows.length * 100) + '%', rasch ? rasch.items[i].b : ''];
      });
      this.tbl(doc, { head: [['Savol', T("Bo'lim"), T("To'g'ri javoblar"), '%', rasch ? 'Qiyinlik (b)' : '']], body: items, startY: 22, theme: 'grid', styles: { fontSize: 9, halign: 'center' } });
    }
    return doc.output('blob');
  },

  async studentReport(test, result) {
    const ev = Scoring.evaluate(test, result);
    const st = result.studentId ? DB.student(result.studentId) : null;
    const doc = await this.doc();
    const T = s => this.T(doc, s);
    doc.setFontSize(16); doc.text(T(st ? st.name : (result.guestName || "O'quvchi")), 14, 16);
    doc.setFontSize(10); doc.text(T(`${test.name} · ${fmtDate(test.date)} · Variant ${result.variant}`), 14, 22);
    let y = 30;
    doc.setFontSize(13);
    if (test.type === 'rasch') {
      const R = Scoring.rasch(test, DB.resultsOfTest(test.id)).byResult[result.id];
      doc.text(T(`Ball: ${R.T}  ·  Daraja: ${R.grade}  ·  To'g'ri: ${ev.correct}/${ev.total}`), 14, y);
    } else doc.text(T(`Ball: ${ev.points} / ${ev.max}  (${ev.percent}%)  ·  To'g'ri: ${ev.correct}/${ev.total}`), 14, y);
    y += 6;
    if (test.sections.length > 1) {
      this.tbl(doc, { startY: y, head: [[T("Bo'lim"), T("To'g'ri"), 'Ball', 'Maks']], body: ev.sections.map(s => [T(s.title) + (s.cert ? ` (sertifikat ${T(s.cert)})` : ''), `${s.correct}/${s.count}`, s.points, s.max]), theme: 'grid', styles: { fontSize: 9 } });
      y = doc.lastAutoTable.finalY + 4;
    }
    const key = Core.normKey(test, Scoring.variantOf(test, result.variant).key);
    const info = Core.qInfo(test);
    const body = info.map((x, i) => [i + 1, Core.show(x.sec, result.answers[i]), x.kind === 'open' ? T('yozma') : Core.show(x.sec, key[i]), ev.marks[i] === 1 ? '+' : ev.marks[i] === 0 ? 'x' : '·']);
    this.tbl(doc, { startY: y, head: [['#', 'Javob', 'Kalit', '']], body, theme: 'grid', styles: { fontSize: 8, halign: 'center', cellPadding: 0.8 },
      didParseCell: d => { if (d.section === 'body' && d.column.index === 3) d.cell.styles.textColor = d.cell.raw === '+' ? [22, 163, 74] : [220, 38, 38]; } });
    return doc.output('blob');
  }
};
