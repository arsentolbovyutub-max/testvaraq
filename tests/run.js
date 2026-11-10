/* Tez tekshiruv: node tests/run.js */
const assert = require('assert');
const Core = require('../js/core.js');
const t = { type: 'simple', sections: [
  { title: 'M1', count: 4, kind: 'choice', options: 4, weight: 1 },
  { title: 'M2', count: 2, kind: 'choice', options: 6, weight: 2 },
  { title: 'M3', count: 3, kind: 'tf', weight: 1 },
  { title: 'Y', count: 1, kind: 'open', weight: 3 }], variants: [{ code: 'A', key: 'ABCDEFABA+' }] };
assert.strictEqual(Core.qCount(t), 10);
assert.strictEqual(Core.maxPoints(t), 4 + 4 + 3 + 3);
const ev = Core.evaluate(t, { variant: 'A', answers: 'ABCDEFAB-+' });
assert.strictEqual(ev.points, 4 + 4 + 2 + 3);
assert.strictEqual(Core.parseAnswers(t, 'abcd ef tfx').error !== undefined, true);
assert.strictEqual(Core.parseAnswers(t, 'abcdef tft').answers, 'ABCDEFABA-');
const blk = { type: 'block', sections: Core.blockSections('Matematika', 'Fizika'), variants: [{ code: 'A', key: 'A'.repeat(90) }] };
assert.strictEqual(Core.maxPoints(blk), 189);
const e2 = Core.evaluate(blk, { variant: 'A', answers: '' }, { certs: [{ subject: 'Fizika', grade: 'B+', percent: 89 }] });
assert.strictEqual(e2.sections[4].points, 56.1);
console.log('core OK');
try {
  const XLSX = require('xlsx'); const X = require('../js/xlscalc.js');
  const f = process.argv[2];
  if (f) { const a = X.analyze(XLSX, XLSX.readFile(f)); console.log(a.error || JSON.stringify(a.result.checks)); }
} catch (e) { console.log('(xlsx moduli o‘rnatilmagan — Excel testi o‘tkazib yuborildi)'); }
