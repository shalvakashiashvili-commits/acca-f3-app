/* =========================================================
   ქვიზისა და ტესტის ეკრანი: #/run/<sessionId>
   - ქვიზი: „შემოწმება“ → მაშინვე სწორი პასუხი, ახსნა და ბანკის სტატუსი.
   - ტესტი: კითხვებს შორის თავისუფალი გადაადგილება (ბადე), შედეგი ბოლოს.
   ყოველი ცვლილება მაშინვე ინახება — აპლიკაციის დახურვის შემდეგ
   სესია იქიდან გრძელდება, სადაც გაჩერდი.
   ========================================================= */

import { setHeader, navigate } from '../router.js';
import { T } from '../strings.ka.js';
import { toast, confirmDialog, fmtDuration } from '../ui/components.js';
import { questionHtml, toggleOption, setText } from '../ui/question.js';
import { answerState } from '../core/scoring.js';
import { getSession, saveSession, loadSessionQuestions, checkQuizQuestion, finishSession } from '../core/session.js';
import { EXIT_STREAK, EXIT_DAYS } from '../core/mistakes.js';
import { now } from '../core/clock.js';

export async function renderRun(el, { id }) {
  const s = await getSession(Number(id));
  if (!s) { navigate('/practice', { replace: true }); return; }
  if (s.state === 'done') { navigate(`/result/${s.id}`, { replace: true }); return; }

  const questions = await loadSessionQuestions(s);
  if (!questions.length) {
    setHeader(T.quiz.title, { back: true });
    el.innerHTML = `<div class="empty">${T.quiz.noQuestionsLeft}</div>`;
    return;
  }
  s.index = Math.min(s.index || 0, questions.length - 1);
  const isQuiz = s.type === 'quiz';
  setHeader(isQuiz ? T.quiz.quizTitle : T.quiz.testTitle, { back: true });
  document.body.classList.add('no-nav');

  // ---- დრო: ითვლება მხოლოდ მაშინ, როცა ეკრანი ღიაა ----
  let segStart = now();
  const flushTime = () => { const n = now(); s.elapsedMs += n - segStart; segStart = n; };
  const persist = () => { flushTime(); return saveSession(s); };
  let lastEvent = null; // ქვიზში: ბოლო შემოწმების შედეგი ბანკისთვის

  function render() {
    const q = questions[s.index];
    const checked = isQuiz ? s.results[q.id] : null;
    const answered = questions.filter((x) => answerState(x, s.answers[x.id]) !== 'none').length;
    const isLast = s.index === questions.length - 1;
    const state = answerState(q, s.answers[q.id]);

    el.innerHTML = `
      <div class="run-top">
        <div class="progress-line">
          <strong>${s.index + 1} / ${questions.length}</strong>
          ${isQuiz ? `<span>${T.quiz.scoreSoFar(Object.values(s.results).filter((r) => r.correct).length, Object.keys(s.results).length)}</span>`
                   : `<span>${T.quiz.answeredN(answered, questions.length)}</span><span id="clock">⏱ ${fmtDuration(s.elapsedMs)}</span>`}
        </div>
        <div class="bar"><i style="width:${Math.round(((s.index + (checked ? 1 : 0)) / questions.length) * 100)}%"></i></div>
      </div>

      ${!isQuiz ? `<div class="navgrid" aria-label="${T.quiz.grid}">${questions.map((x, i) => {
        const st = answerState(x, s.answers[x.id]);
        return `<button data-go="${i}" class="${i === s.index ? 'cur' : ''} ${st === 'full' ? 'ans' : st === 'partial' ? 'part' : ''}">${i + 1}</button>`;
      }).join('')}</div>` : ''}

      <div class="card q-card">${questionHtml(q, s.answers[q.id], { review: !!checked, result: checked })}</div>
      ${checked && lastEvent?.qid === q.id ? bankNote(lastEvent) : ''}

      <div class="run-actions">
        ${isQuiz
          ? (checked
              ? `<button class="btn primary block" data-a="${isLast ? 'finish' : 'next'}">${isLast ? T.quiz.seeResult : T.quiz.next} →</button>`
              : `<button class="btn primary block" data-a="check" ${state === 'none' ? 'disabled' : ''}>${T.quiz.check}</button>`)
          : `<div class="btn-row nav-row">
               <button class="btn" data-a="prev" ${s.index === 0 ? 'disabled' : ''}>← ${T.quiz.prev}</button>
               ${isLast ? `<button class="btn primary" data-a="finish">${T.quiz.finish}</button>`
                        : `<button class="btn primary" data-a="next">${T.quiz.next} →</button>`}
             </div>
             ${!isLast ? `<button class="btn ghost block" data-a="finish">${T.quiz.finishTest}</button>` : ''}`}
      </div>`;
  }

  /** ქვიზში: რა მოხდა შეცდომების ბანკში */
  function bankNote({ event, rec }) {
    if (event === 'entered' || event === 'wrong-again') return `<p class="bank-note wrong">📌 ${T.quiz.bankEntered(rec.wrongCount)}</p>`;
    if (event === 'progress') return `<p class="bank-note">🔁 ${T.quiz.bankProgress(rec.streak, EXIT_STREAK, rec.streakDays.length, EXIT_DAYS)}</p>`;
    if (event === 'exited') return `<p class="bank-note ok">🎉 ${T.quiz.bankExited}</p>`;
    return '';
  }

  // ---- ღილაკები და პასუხები ----
  async function onClick(e) {
    const opt = e.target.closest('[data-opt]');
    const go = e.target.closest('[data-go]');
    const act = e.target.closest('[data-a]')?.dataset.a;
    const q = questions[s.index];

    if (opt && !opt.disabled) {
      s.answers[q.id] = toggleOption(q, s.answers[q.id], Number(opt.dataset.part), Number(opt.dataset.opt));
      persist();
      render();
      return;
    }
    if (go) { s.index = Number(go.dataset.go); persist(); render(); window.scrollTo(0, 0); return; }
    if (!act) return;

    if (act === 'check') {
      flushTime();
      const r = await checkQuizQuestion(s, q);
      lastEvent = { qid: q.id, event: r.event, rec: r.rec };
      render();
    }
    if (act === 'next' || act === 'prev') {
      s.index += act === 'next' ? 1 : -1;
      persist();
      render();
      window.scrollTo(0, 0);
    }
    if (act === 'finish') {
      if (!isQuiz) {
        const left = questions.filter((x) => answerState(x, s.answers[x.id]) !== 'full').length;
        const msg = left ? T.quiz.confirmFinishLeft(left) : T.quiz.confirmFinish;
        if (!(await confirmDialog(msg, { okLabel: T.quiz.finish }))) return;
      }
      flushTime();
      await finishSession(s, questions);
      navigate(`/result/${s.id}`, { replace: true });
    }
  }

  // ტექსტური ველები: ვინახავთ, მაგრამ ეკრანს არ ვხატავთ თავიდან (ფოკუსი არ დაიკარგოს)
  let saveTimer = 0;
  function onInput(e) {
    const inp = e.target.closest('.ans-in');
    if (!inp) return;
    const q = questions[s.index];
    s.answers[q.id] = setText(q, s.answers[q.id], Number(inp.dataset.part), inp.value);
    const state = answerState(q, s.answers[q.id]);
    const checkBtn = el.querySelector('[data-a="check"]');
    if (checkBtn) checkBtn.disabled = state === 'none';
    const cell = el.querySelector(`.navgrid [data-go="${s.index}"]`);
    if (cell) { cell.classList.toggle('ans', state === 'full'); cell.classList.toggle('part', state === 'partial'); }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }
  // Enter ციფრულ ველში = „შემოწმება“ / „შემდეგი“
  function onKey(e) {
    if (e.key !== 'Enter' || !e.target.closest('.ans-in')) return;
    e.preventDefault();
    el.querySelector('[data-a="check"]:not([disabled]), [data-a="next"]')?.click();
  }

  const onVis = () => { if (document.hidden) persist(); else segStart = now(); };
  const tick = setInterval(() => {
    const c = el.querySelector('#clock');
    if (c) c.textContent = '⏱ ' + fmtDuration(s.elapsedMs + (now() - segStart));
  }, 1000);

  el.addEventListener('click', onClick);
  el.addEventListener('input', onInput);
  el.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVis);
  render();
  if (s.index > 0 || Object.keys(s.answers).length) toast(T.quiz.resumed);

  return () => {
    clearInterval(tick);
    clearTimeout(saveTimer);
    document.removeEventListener('visibilitychange', onVis);
    document.body.classList.remove('no-nav');
    if (s.state !== 'done') persist();
  };
}
