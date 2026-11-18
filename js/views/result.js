/* =========================================================
   შედეგი: #/result/<sessionId>
   ქულა, %, დახარჯული დრო, თავების მიხედვით, ყველა კითხვის განხილვა.
   ========================================================= */

import { setHeader } from '../router.js';
import { T } from '../strings.ka.js';
import { S, getAll } from '../db.js';
import { fmtNum, fmtDuration, fmtDate } from '../ui/components.js';
import { questionHtml } from '../ui/question.js';
import { getSession, loadSessionQuestions } from '../core/session.js';
import { startPractice } from './practice.js';

export async function renderResult(el, { id }) {
  const s = await getSession(Number(id));
  setHeader(T.result.title, { back: true });
  if (!s || s.state !== 'done') { el.innerHTML = `<div class="empty">${T.result.notFound}</div>`; return; }

  const [questions, chapters] = await Promise.all([loadSessionQuestions(s), getAll(S.chapters)]);
  const chName = new Map(chapters.map((c) => [c.id, c.title_ka || c.title_en]));
  const sum = s.summary;
  const wrongCount = questions.filter((q) => !s.results[q.id]?.correct).length;
  let onlyWrong = false;

  el.innerHTML = `
    <div class="card result-hero">
      <div class="big ${sum.pct >= 50 ? 'ok-text' : 'bad-text'}">${sum.pct}%</div>
      <div class="sub">${fmtNum(sum.earned)} / ${fmtNum(sum.max)} ${T.quiz.marks}</div>
      <div class="stats">
        <span>✓ ${sum.correctN} / ${sum.total}</span>
        <span>⏱ ${fmtDuration(s.elapsedMs)}</span>
        <span>${s.type === 'quiz' ? T.quiz.quizTitle : T.quiz.testTitle} · ${fmtDate(s.finishedAt)}</span>
      </div>
    </div>

    ${Object.keys(sum.perChapter).length > 1 ? `
      <div class="section-title">${T.result.byChapter}</div>
      <div class="card">
        ${Object.entries(sum.perChapter).sort((a, b) => a[0] - b[0]).map(([cid, c]) => {
          const pct = c.max ? Math.round((c.earned / c.max) * 100) : 0;
          return `<div class="list-row"><div class="grow"><strong>${T.chapters.chapter} ${cid}</strong> <small class="muted">${chName.get(Number(cid)) || ''}</small>
            <div class="bar"><i style="width:${pct}%"></i></div></div><strong>${pct}%</strong></div>`;
        }).join('')}
      </div>` : ''}

    <div class="btn-row">
      <button class="btn primary" data-a="again">${T.result.again}</button>
      ${wrongCount ? `<button class="btn" data-a="mistakes">${T.result.practiceMistakes}</button>` : ''}
    </div>

    <div class="section-title">${T.result.review}</div>
    <div class="segmented" id="review-filter">
      <button class="on" data-f="all">${T.result.all} (${questions.length})</button>
      <button data-f="wrong">${T.result.wrongOnly} (${wrongCount})</button>
    </div>
    <div id="review" style="margin-top:12px"></div>`;

  function renderReview() {
    el.querySelector('#review').innerHTML = questions
      .map((q, i) => ({ q, i, r: s.results[q.id] }))
      .filter(({ r }) => !onlyWrong || !r?.correct)
      .map(({ q, i, r }) => `
        <div class="card q-card">
          <div class="q-num">#${i + 1}</div>
          ${questionHtml(q, s.answers[q.id], { review: true, result: r || { earned: 0, max: q.marks, correct: false } })}
        </div>`).join('') || `<p class="muted">${T.result.noWrong}</p>`;
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.f) {
      onlyWrong = b.dataset.f === 'wrong';
      el.querySelectorAll('#review-filter button').forEach((x) => x.classList.toggle('on', x === b));
      renderReview();
    }
    if (b.dataset.a === 'again') startPractice({ ...s.filters, mode: s.type });
    if (b.dataset.a === 'mistakes') startPractice({ ...s.filters, mode: 'quiz', mistakesOnly: true });
  });
  renderReview();
}
