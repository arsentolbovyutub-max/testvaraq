/* Brauzer uchun qobiq: Core (js/core.js) + mahalliy ma'lumotlar bazasi. */
const OPTIONS = ['A', 'B', 'C', 'D'];

const Scoring = Object.assign(Object.create(Core), {
  evaluate(test, result) {
    const student = result.studentId ? DB.student(result.studentId) : null;
    return Core.evaluate(test, result, student);
  },
  table(test) {
    return Core.table(test, DB.resultsOfTest(test.id), r => (r.studentId ? DB.student(r.studentId) : null), id => DB.group(id));
  }
});
