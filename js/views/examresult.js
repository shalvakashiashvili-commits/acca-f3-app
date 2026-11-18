/* =========================================================
   გამოცდის შედეგი: #/exam/result/<sessionId>
   ქულა 100-დან, ჩაბარდა / ვერ ჩაბარდა, დრო და პაუზები,
   Section A / B ცალ-ცალკე, 3 ყველაზე სუსტი თავი, თავების მიხედვით,
   ყველა კითხვის განხილვა ახსნით (ფილტრი: ყველა / არასწორი / მონიშნული).
   არასწორი და უპასუხო კითხვები ბანკში უკვე ჩაწერილია finishSession-ში.
   ========================================================= */

import { setHeader, navigate } from '../router.js';
import { T, fmtMin } from '../strings.ka.js';
import { S, getAll } from '../db.js';
import { esc, fmtNum, fmtDuration, fmtDate } from '../ui/components.js';
import { questionHtml } from '../ui/question.js';
import { getSession, loadSessionQuestions } from '../core/session.js';
import { startPractice } from './practice.js';

export async function renderExamResult(el, { id }) {
  const s = await getSession(Number(id));
  setHeader(T.exam.resultTitle, { back: true });
  if (!s || s.type !== 'exam' || s.state !== 'done') { el.innerHTML = `<div class="empty">${T.result.notFound}</div>`; return; }

  const [questions, chapters] = await Promise.all([loadSessionQuestions(s), getAll(S.chapters)]);
  const chName = new Map(chapters.map((c) => [c.id, c.title_ka || c.title_en || '']));
  const sum = s.summary;
  const pq = sum.perQuestion;
  const wrong = questions.filter((q) => !s.results[q.id]?.correct);
  const flaggedN = questions.filter((q) => s.flags?.[q.id]).length;
  let filter = 'all';

  // დრო და პაუზები
  const timeLine = T.exam.timeUsed(fmtDuration(s.elapsedMs), fmtMin(Math.round(s.durationMs / 60000)));
  const pauseLine = s.strict ? T.exam.strictMode(s.pauseCount || 0)
    : (s.pauseCount ? T.exam.paused(s.pauseCount, fmtDuration(s.pausedMs)) : T.exam.noPause);

  const secCard = (k, title) => {
    const x = sum.sections[k];
    if (!x.n) return '';
    return `
      <div class="card sec-card">
        <div class="sec-h"><strong>${title}</strong><strong>${fmtNum(x.earned)} / ${x.max}</strong></div>
        <div class="bar"><i style="width:${x.pct}%"></i></div>
        <small class="muted">${x.pct}% · ${T.exam.secLine(x.correctN, x.n)}${x.unanswered ? ' · ' + T.exam.unansweredN(x.unanswered) : ''}</small>
      </div>`;
  };
  const chRow = (cid) => {
    const c = sum.perChapter[cid];
    return `<div class="list-row"><div class="grow"><strong>${T.chapters.chapter} ${cid}</strong> <small class="muted">${esc(chName.get(Number(cid)))}</small>
      <div class="bar"><i style="width:${c.pct}%"></i></div></div><strong>${c.pct}%</strong><small class="muted">${fmtNum(c.earned)}/${c.max}</small></div>`;
  };

  el.innerHTML = `
    <div class="card result-hero">
      <div class="muted"><small>${T.exam.outOf100}</small></div>
      <div class="big ${sum.passed ? 'ok-text' : 'bad-text'}">${sum.pct}</div>
      <div class="pass-badge ${sum.passed ? 'ok' : 'bad'}">${sum.passed ? '✓ ' + T.exam.passed : '✗ ' + T.exam.failed}</div>
      <div class="sub">${T.exam.marksOf(fmtNum(sum.earned), sum.max)} · ${T.exam.passLine(s.plan.passPct)}</div>
      <div class="stats">
        <span>${s.plan.variant === 'mini' ? T.exam.mini : T.exam.full}</span>
        <span>${fmtDate(s.finishedAt)}</span>
        <span>⏱ ${timeLine}</span>
        <span>${pauseLine}</span>
      </div>
      ${s.autoFinished ? `<p class="bank-note wrong">${T.exam.autoFinished}</p>` : ''}
      ${sum.scaled ? `<p class="bank-note">${T.exam.scaledNote(sum.max, s.plan.plannedMax)}</p>` : ''}
    </div>

    <div class="section-title">${T.exam.sections}</div>
    ${secCard('A', T.exam.sectionA)}
    ${secCard('B', T.exam.sectionB)}

    <div class="section-title">${T.exam.weakest}</div>
    <div class="card">${sum.weakest.length ? sum.weakest.map(chRow).join('') : `<p>${T.exam.noWeak}</p>`}</div>

    ${Object.keys(sum.perChapter).length > 1 ? `
      <div class="section-title">${T.exam.byChapter}</div>
      <div class="card">${Object.keys(sum.perChapter).sort((a, b) => a - b).map(chRow).join('')}</div>` : ''}

    ${wrong.length ? `<p class="muted"><small>📌 ${T.exam.bankNote(wrong.length)}</small></p>` : ''}
    <div class="btn-row">
      <button class="btn primary" data-a="new">${T.exam.newExam}</button>
      ${sum.weakest.length ? `<button class="btn" data-a="weak">${T.exam.practiceWeak}</button>` : ''}
    </div>

    <div class="section-title">${T.exam.review}</div>
    <div class="segmented" id="review-filter">
      <button class="on" data-f="all">${T.exam.filterAll} (${questions.length})</button>
      <button data-f="wrong">${T.exam.filterWrong} (${wrong.length})</button>
      ${flaggedN ? `<button data-f="flag">🚩 ${flaggedN}</button>` : ''}
    </div>
    <div id="review" style="margin-top:12px"></div>`;

  function renderReview() {
    const inB = new Set(s.sections.B);
    el.querySelector('#review').innerHTML = questions
      .map((q, i) => ({ q, i, r: s.results[q.id] }))
      .filter(({ q, r }) => filter === 'all' || (filter === 'wrong' ? !r?.correct : s.flags?.[q.id]))
      .map(({ q, i, r }) => {
        const m = pq[q.id] || { earned: 0, max: q.marks };
        // ბეჯზე — გამოცდის ქულა (სექციის მასშტაბით)
        const res = { ...(r || { correct: false, parts: null }), earned: m.earned, max: m.max };
        return `
          <div class="card q-card">
            <div class="q-num">#${i + 1} · ${inB.has(q.id) ? T.exam.sectionB : T.exam.sectionA} ${s.flags?.[q.id] ? '🚩' : ''}</div>
            ${questionHtml(q, s.answers[q.id], { review: true, result: res, marks: m.max })}
          </div>`;
      }).join('') || `<p class="muted">${T.result.noWrong}</p>`;
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.f) {
      filter = b.dataset.f;
      el.querySelectorAll('#review-filter button').forEach((x) => x.classList.toggle('on', x === b));
      renderReview();
    }
    if (b.dataset.a === 'new') navigate('/exam');
    // სუსტი თავები → ქვიზი (შეცდომები ავტომატურად შედის, სულ მცირე 30%)
    if (b.dataset.a === 'weak') startPractice({ mode: 'quiz', chapterIds: sum.weakest, source: s.filters.source, count: 10 });
  });
  renderReview();
}
