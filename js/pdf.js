/* PDF output: answer sheets, answer keys, results. */
const PDF = {
  doc(orientation = 'p') {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ orientation, unit: 'mm', format: 'a4' });
  },
  fname(s) { return latin(s).replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 60); },

  /* items: [{student, group, variant}] */
  async sheets(test, items) {
    const doc = this.doc();
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

  key(test) {
    const doc = this.doc();
    const center = DB.data.center ? DB.data.center.name : '';
    doc.setFontSize(16); doc.text(latin(`Javob kaliti: ${test.name}`), 14, 16);
    doc.setFontSize(10); doc.text(latin(`${center} · ${fmtDate(test.date)} · ${Scoring.qCount(test)} savol`), 14, 22);
    const n = Scoring.qCount(test);
    const head = [['#', ...test.variants.map(v => 'Variant ' + v.code)]];
    const body = [];
    for (let i = 0; i < n; i++) {
      const { sec } = Scoring.sectionAt(test, i);
      body.push([String(i + 1), ...test.variants.map(v => (v.key[i] && v.key[i] !== '-') ? v.key[i] : '')]);
      body[i].sec = sec.title;
    }
    // split into 3 side-by-side tables for compactness when one variant
    doc.autoTable({
      head, body, startY: 27, theme: 'grid', styles: { fontSize: 9, cellPadding: 1.2, halign: 'center' },
      headStyles: { fillColor: [15, 118, 110] },
      didParseCell: d => { if (d.section === 'body' && d.column.index === 0) d.cell.styles.fontStyle = 'bold'; }
    });
    if (test.sections.length > 1) {
      let y = doc.lastAutoTable.finalY + 6, start = 1;
      doc.setFontSize(9);
      for (const s of test.sections) { if (y > 285) { doc.addPage(); y = 15; } doc.text(latin(`${start}-${start + s.count - 1}: ${s.title} (x${s.weight})`), 14, y); y += 5; start += s.count; }
    }
    return doc.output('blob');
  },

  results(test) {
    const { rows, rasch } = Scoring.table(test);
    const doc = this.doc(test.type === 'block' ? 'l' : 'p');
    const center = DB.data.center ? DB.data.center.name : '';
    doc.setFontSize(16); doc.text(latin(`Natijalar: ${test.name}`), 14, 16);
    doc.setFontSize(10); doc.text(latin(`${center} · ${fmtDate(test.date)} · ${rows.length} ta o'quvchi`), 14, 22);
    let head, body;
    if (test.type === 'block') {
      head = [['#', "O'quvchi", 'Guruh', 'Var.', ...test.sections.map(s => latin(s.title)), 'Ball', '%']];
      body = rows.map(x => [x.rank, latin(x.name), latin(x.group), x.r.variant, ...x.ev.sections.map(s => s.cert ? `${s.points} (${s.cert})` : `${s.correct}/${s.count} · ${s.points}`), x.ev.points + ' / ' + x.ev.max, x.ev.percent + '%']);
    } else if (test.type === 'rasch') {
      head = [['#', "O'quvchi", 'Guruh', "To'g'ri", 'Ball (Rasch)', 'Daraja']];
      body = rows.map(x => [x.rank, latin(x.name), latin(x.group), `${x.ev.correct}/${x.ev.total}`, x.T, x.grade]);
    } else {
      head = [['#', "O'quvchi", 'Guruh', 'Var.', "To'g'ri", "Noto'g'ri", 'Bo\'sh', '%']];
      body = rows.map(x => [x.rank, latin(x.name), latin(x.group), x.r.variant, x.ev.correct, x.ev.wrong, x.ev.blank, x.ev.percent + '%']);
    }
    doc.autoTable({ head, body, startY: 27, theme: 'striped', styles: { fontSize: 9 }, headStyles: { fillColor: [15, 118, 110] } });
    if (rasch) {
      doc.addPage();
      doc.setFontSize(14); doc.text("Savollar tahlili (Rasch)", 14, 16);
      doc.autoTable({
        head: [['Savol', "To'g'ri javoblar", '%', 'Qiyinlik (b)']],
        body: rasch.items.map(it => [it.q, it.s, Math.round(it.p * 100) + '%', it.b]),
        startY: 22, theme: 'grid', styles: { fontSize: 9, halign: 'center' }, headStyles: { fillColor: [15, 118, 110] }
      });
    }
    return doc.output('blob');
  },

  studentReport(test, result) {
    const ev = Scoring.evaluate(test, result);
    const st = result.studentId ? DB.student(result.studentId) : null;
    const doc = this.doc();
    doc.setFontSize(16); doc.text(latin(st ? st.name : "O'quvchi"), 14, 16);
    doc.setFontSize(10); doc.text(latin(`${test.name} · ${fmtDate(test.date)} · Variant ${result.variant}`), 14, 22);
    let y = 30;
    doc.setFontSize(13);
    if (test.type === 'rasch') {
      const R = Scoring.rasch(test, DB.resultsOfTest(test.id)).byResult[result.id];
      doc.text(latin(`Ball: ${R.T}  ·  Daraja: ${R.grade}  ·  To'g'ri: ${ev.correct}/${ev.total}`), 14, y);
    } else doc.text(latin(`Ball: ${ev.points} / ${ev.max}  (${ev.percent}%)  ·  To'g'ri: ${ev.correct}/${ev.total}`), 14, y);
    y += 6;
    if (test.sections.length > 1) {
      doc.autoTable({ startY: y, head: [['Fan', "To'g'ri", 'Ball', 'Maks']], body: ev.sections.map(s => [latin(s.title) + (s.cert ? ` (sertifikat ${s.cert})` : ''), `${s.correct}/${s.count}`, s.points, s.max]), theme: 'grid', styles: { fontSize: 9 }, headStyles: { fillColor: [15, 118, 110] } });
      y = doc.lastAutoTable.finalY + 4;
    }
    const key = Scoring.variantOf(test, result.variant).key;
    const body = [];
    for (let i = 0; i < ev.total; i++) body.push([i + 1, result.answers[i] || '-', key[i] || '-', ev.marks[i] === 1 ? '+' : ev.marks[i] === 0 ? 'x' : '·']);
    doc.autoTable({ startY: y, head: [['#', 'Javob', 'Kalit', '']], body, theme: 'grid', styles: { fontSize: 8, halign: 'center', cellPadding: 0.8 }, headStyles: { fillColor: [15, 118, 110] },
      didParseCell: d => { if (d.section === 'body' && d.column.index === 3) d.cell.styles.textColor = d.cell.raw === '+' ? [22, 163, 74] : [220, 38, 38]; } });
    return doc.output('blob');
  }
};
