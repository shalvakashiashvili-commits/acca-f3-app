/* =========================================================
   გამოცდის ეკრანი: #/exam/run/<sessionId>
   - უკუთვლის ტაიმერი; ბოლო 10 წუთზე გაფრთხილება; 0-ზე ავტომატური დასრულება
   - კითხვების ბადე სექციებად (A / B), „მონიშვნა გადასახედად“ (🚩)
   - დასრულებამდე: უპასუხო და მონიშნული კითხვების სია
   - სწორი პასუხები და ახსნები არ ჩანს (მხოლოდ შედეგის ეკრანზე)
   - ყოველი ცვლილება მაშინვე ინახება → დახურვის შემდეგ გრძელდება

   ტაიმერი (იხ. core/exam.js):
     ჩვეულებრივი რეჟიმი — ეკრანის დატოვებისას (აპლიკაციის დახურვა,
       სხვა აპზე გადასვლა, უკან დაბრუნება) დრო ჩერდება და იწერება პაუზა.
     მკაცრი რეჟიმი — დრო ითვლება დაწყებიდან; გახსნისას, თუ დრო
       უკვე ამოიწურა, გამოცდა მაშინვე სრულდება.
   ========================================================= */

import { setHeader, navigate } from '../router.js';
import { T } from '../strings.ka.js';
import { toast, sheet, fmtDuration } from '../ui/components.js';
import { questionHtml, toggleOption, setText } from '../ui/question.js';
import { answerState } from '../core/scoring.js';
import { getSession, saveSession, loadSessionQuestions, finishSession } from '../core/session.js';
import { examElapsed, examRemaining, WARN_MS } from '../core/exam.js';
import { now } from '../core/clock.js';

export async function renderExamRun(el, { id }) {
  const s = await getSession(Number(id));
  if (!s || s.type !== 'exam') { navigate('/exam', { replace: true }); return; }
  if (s.state === 'done') { navigate(`/exam/result/${s.id}`, { replace: true }); return; }

  const questions = await loadSessionQuestions(s);
  setHeader(s.plan.variant === 'mini' ? T.exam.mini : T.exam.full, { back: true });
  if (!questions.length) { el.innerHTML = `<div class="empty">${T.quiz.noQuestionsLeft}</div>`; return; }
  document.body.classList.add('no-nav');

  const inB = new Set(s.sections.B);
  const secOf = (q) => (inB.has(q.id) ? 'B' : 'A');
  const marksOf = (q) => (secOf(q) === 'B' ? s.plan.bMarks : s.plan.aMarks);
  const idxA = questions.filter((q) => secOf(q) === 'A');
  const idxB = questions.filter((q) => secOf(q) === 'B');
  s.index = Math.min(s.index || 0, questions.length - 1);
  s.flags ||= {};

  // ---- დრო ----
  let segStart = null;   // ღია ეკრანის მიმდინარე მონაკვეთის დასაწყისი (ჩვეულებრივ რეჟიმში)
  let finishing = false;

  /** ეკრანზე დაბრუნება: პაუზის ჩაწერა და დროის თვლის გაგრძელება */
  function resumeClock() {
    const t = now();
    if (s.pausedAt) {
      s.pauseCount = (s.pauseCount || 0) + 1;
      s.pausedMs = (s.pausedMs || 0) + (t - s.pausedAt);
      s.pausedAt = null;
    }
    segStart = t;
  }
  /** ეკრანის დატოვება: დახარჯული დროის შენახვა და პაუზის დაწყება */
  function pauseClock() {
    flushTime();
    segStart = null;
    s.pausedAt = now();
  }
  function flushTime() {
    if (s.strict || segStart == null) return;
    const t = now();
    s.elapsedMs += t - segStart;
    segStart = t;
  }
  const persist = () => { flushTime(); return saveSession(s); };

  const wasStarted = s.elapsedMs > 0 || s.pausedAt || Object.keys(s.answers).length;
  resumeClock();
  // გახსნისთანავე: თუ დრო უკვე ამოიწურა (მკაცრ რეჟიმში დახურვისას) — დასრულება
  if (examRemaining(s, segStart) <= 0) { await autoFinish(); return; }
  await saveSession(s);
  if (wasStarted) toast(s.strict ? T.exam.resumedStrict : T.exam.resumed);

  // ---- ხატვა ----
  function gridHtml(list, title) {
    if (!list.length) return '';
    return `
      <div class="grid-h">${title}</div>
      <div class="navgrid">${list.map((x) => {
        const i = questions.indexOf(x);
        const st = answerState(x, s.answers[x.id]);
        return `<button data-go="${i}" class="${i === s.index ? 'cur' : ''} ${st === 'full' ? 'ans' : st === 'partial' ? 'part' : ''} ${s.flags[x.id] ? 'flag' : ''}">${i + 1}</button>`;
      }).join('')}</div>`;
  }

  function render() {
    const q = questions[s.index];
    const sec = secOf(q);
    const list = sec === 'A' ? idxA : idxB;
    const answered = questions.filter((x) => answerState(x, s.answers[x.id]) !== 'none').length;
    const isLast = s.index === questions.length - 1;
    const flagged = !!s.flags[q.id];

    el.innerHTML = `
      <div class="run-top exam-top">
        <div class="progress-line">
          <strong>${sec === 'A' ? T.exam.sectionA : T.exam.sectionB} · ${list.indexOf(q) + 1}/${list.length}</strong>
          <span>${T.quiz.answeredN(answered, questions.length)}</span>
          <span id="clock" class="exam-clock"></span>
        </div>
        <div class="bar"><i style="width:${Math.round((answered / questions.length) * 100)}%"></i></div>
      </div>

      <details class="grid-box" ${s.gridOpen !== false ? 'open' : ''}>
        <summary>${T.quiz.grid}</summary>
        ${gridHtml(idxA, T.exam.sectionA)}
        ${gridHtml(idxB, T.exam.sectionB)}
      </details>

      <div class="card q-card">
        <div class="q-num">#${s.index + 1} ${flagged ? '<span class="flag-mark">🚩</span>' : ''}</div>
        ${questionHtml(q, s.answers[q.id], { marks: marksOf(q) })}
      </div>

      <div class="run-actions">
        <button class="btn ghost block ${flagged ? 'on-flag' : ''}" data-a="flag">🚩 ${flagged ? T.exam.unflag : T.exam.flag}</button>
        <div class="btn-row nav-row">
          <button class="btn" data-a="prev" ${s.index === 0 ? 'disabled' : ''}>← ${T.quiz.prev}</button>
          <button class="btn primary" data-a="${isLast ? 'finish' : 'next'}">${isLast ? T.quiz.finish : T.quiz.next + ' →'}</button>
        </div>
        ${!isLast ? `<button class="btn ghost block" data-a="finish">${T.exam.finish}</button>` : ''}
      </div>`;
    updateClock();
  }

  /** ტაიმერის ჩვენება + გაფრთხილება + ავტომატური დასრულება */
  function updateClock() {
    const rem = examRemaining(s, segStart);
    const c = el.querySelector('#clock');
    if (c) {
      c.textContent = '⏱ ' + fmtDuration(Math.max(0, rem));
      c.classList.toggle('low', rem <= WARN_MS);
    }
    if (rem <= WARN_MS && !s.warned && rem > 0) {
      s.warned = true;
      toast('⏰ ' + T.exam.warn10, { type: 'error', ms: 6000 });
      if (navigator.vibrate) navigator.vibrate(200);
      persist();
    }
    if (rem <= 0) autoFinish();
  }

  async function autoFinish() {
    if (finishing) return;
    s.autoFinished = true;
    toast('⏰ ' + T.exam.timeUp, { type: 'error', ms: 5000 });
    await finish();
  }

  async function finish() {
    if (finishing) return;
    finishing = true;
    flushTime();
    s.elapsedMs = Math.min(examElapsed(s), s.durationMs);
    document.querySelectorAll('dialog.sheet').forEach((d) => d.close());
    await finishSession(s, questions);
    document.body.classList.remove('no-nav');
    navigate(`/exam/result/${s.id}`, { replace: true });
  }

  /** დასრულების დიალოგი: უპასუხო და მონიშნული კითხვები */
  function askFinish() {
    const left = questions.filter((x) => answerState(x, s.answers[x.id]) !== 'full');
    const flagged = questions.filter((x) => s.flags[x.id]);
    const nums = (arr) => `<div class="navgrid small">${arr.map((x) => `<button data-go="${questions.indexOf(x)}">${questions.indexOf(x) + 1}</button>`).join('')}</div>`;
    const { dialog, close } = sheet(`
      <h3>${T.exam.finishTitle}</h3>
      ${left.length ? `<p><strong>${T.exam.unansweredList(left.length)}</strong></p>${nums(left)}<p class="muted"><small>${T.exam.finishNote}</small></p>`
                    : `<p>✅ ${T.exam.allAnswered}</p>`}
      ${flagged.length ? `<p><strong>🚩 ${T.exam.flaggedList(flagged.length)}</strong></p>${nums(flagged)}` : ''}
      <div class="btn-row">
        <button class="btn" data-a="back">${T.exam.backToExam}</button>
        <button class="btn primary" data-a="finish">${T.quiz.finish}</button>
      </div>`);
    dialog.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]');
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (go) { close(); s.index = Number(go.dataset.go); persist(); render(); window.scrollTo(0, 0); }
      if (a === 'back') close();
      if (a === 'finish') { close(); finish(); }
    });
  }

  // ---- ღილაკები და პასუხები ----
  function onClick(e) {
    if (finishing) return;
    const opt = e.target.closest('[data-opt]');
    const go = e.target.closest('[data-go]');
    const act = e.target.closest('[data-a]')?.dataset.a;
    const q = questions[s.index];
    if (opt && !opt.disabled) {
      s.answers[q.id] = toggleOption(q, s.answers[q.id], Number(opt.dataset.part), Number(opt.dataset.opt));
      persist(); render();
      return;
    }
    if (go) { s.index = Number(go.dataset.go); persist(); render(); window.scrollTo(0, 0); return; }
    if (act === 'flag') {
      if (s.flags[q.id]) delete s.flags[q.id]; else s.flags[q.id] = true;
      persist(); render();
    }
    if (act === 'next' || act === 'prev') {
      s.index += act === 'next' ? 1 : -1;
      persist(); render(); window.scrollTo(0, 0);
    }
    if (act === 'finish') askFinish();
  }

  // ბადის გახსნა/დაკეცვა ახსოვს
  function onToggle(e) {
    if (e.target.matches?.('details.grid-box')) { s.gridOpen = e.target.open; persist(); }
  }

  // ტექსტური ველები: ვინახავთ ხელახალი ხატვის გარეშე (ფოკუსი არ დაიკარგოს)
  let saveTimer = 0;
  function onInput(e) {
    const inp = e.target.closest('.ans-in');
    if (!inp) return;
    const q = questions[s.index];
    s.answers[q.id] = setText(q, s.answers[q.id], Number(inp.dataset.part), inp.value);
    const st = answerState(q, s.answers[q.id]);
    const cell = el.querySelector(`.navgrid [data-go="${s.index}"]`);
    if (cell) { cell.classList.toggle('ans', st === 'full'); cell.classList.toggle('part', st === 'partial'); }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }
  function onKey(e) {
    if (e.key !== 'Enter' || !e.target.closest('.ans-in')) return;
    e.preventDefault();
    el.querySelector('[data-a="next"]')?.click();
  }

  const onVis = () => {
    if (finishing) return;
    if (document.hidden) { pauseClock(); saveSession(s); } else { resumeClock(); saveSession(s); updateClock(); }
  };
  const tick = setInterval(() => { if (!finishing && !document.hidden) updateClock(); }, 1000);

  el.addEventListener('click', onClick);
  el.addEventListener('toggle', onToggle, true);
  el.addEventListener('input', onInput);
  el.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVis);
  render();

  return () => {
    clearInterval(tick);
    clearTimeout(saveTimer);
    document.removeEventListener('visibilitychange', onVis);
    document.body.classList.remove('no-nav');
    if (!finishing && s.state !== 'done') { pauseClock(); saveSession(s); }
  };
}
