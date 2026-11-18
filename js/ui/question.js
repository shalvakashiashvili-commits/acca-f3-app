/* =========================================================
   კითხვის ჩვენება: პასუხის რეჟიმი და განხილვის რეჟიმი.
   იყენებს ქვიზი, ტესტი, შედეგების ეკრანი (და ეტაპ 3-ში გამოცდა).

   HTML-ში ელემენტებს აქვთ data-part:
     -1 = ჩვეულებრივი კითხვა, 0..n = mtq-ის ნაწილი
   ვარიანტის ღილაკი: data-opt="<ნომერი>", ველი: .ans-in
   ========================================================= */

import { T } from '../strings.ka.js';
import { esc, richText, fmtNum } from './components.js';
import { parseNumeric, maxMarks } from '../core/scoring.js';

const LETTERS = 'ABCDEFGHIJ';

/** წყაროს ნიშანი: „აპლიკაცია“ ან „კრებული #12“ */
export function sourceBadge(q) {
  return q.source === 'kit'
    ? `<span class="badge kit">${T.source.kit}${q.kit_ref ? ' #' + esc(q.kit_ref) : ''}</span>`
    : `<span class="badge">${T.source.app}</span>`;
}

/**
 * კითხვის HTML.
 * opts: { review: bool, result: { earned, max, correct, parts? }, marks?: გამოცდაში ნაჩვენები ქულა }
 */
export function questionHtml(q, answer, opts = {}) {
  const { review = false, result = null, marks = null } = opts;
  const head = `
    <div class="q-meta">
      ${sourceBadge(q)}
      <span>${T.chapters.chapter} ${q.chapterId}</span>
      <span>${marks ?? maxMarks(q)} ${T.quiz.marks}</span>
      ${review && result ? resultBadge(result) : ''}
    </div>
    <div class="q-text" lang="en">${richText(q.question_en)}</div>`;

  if (q.type === 'mtq') {
    const parts = q.parts.map((p, i) => {
      const a = Array.isArray(answer) ? answer[i] : undefined;
      const pr = result?.parts ? { correct: result.parts[i], earned: result.parts[i] ? p.marks : 0, max: p.marks } : null;
      return `
        <div class="q-part">
          <div class="q-part-h">${T.quiz.part} ${i + 1} · ${p.marks} ${T.quiz.marks} ${review && pr ? resultBadge(pr) : ''}</div>
          <div class="q-text" lang="en">${richText(p.question_en)}</div>
          ${bodyHtml(p, a, i, review)}
          ${review ? explainHtml(p) : ''}
        </div>`;
    }).join('');
    return head + parts + (review && q.explanation_ka ? explainHtml(q) : '');
  }
  return head + bodyHtml(q, answer, -1, review) + (review ? explainHtml(q) : '');
}

/** პასუხის ველი/ვარიანტები ტიპის მიხედვით */
function bodyHtml(q, a, part, review) {
  if (q.type === 'mcq' || q.type === 'multi') {
    const chosen = new Set(Array.isArray(a) ? a : []);
    const right = new Set(q.correct);
    const hint = q.type === 'multi' && !review ? `<p class="muted"><small>${T.quiz.chooseN(q.correct.length)}</small></p>` : '';
    return hint + `<div class="opts" role="${q.type === 'mcq' ? 'radiogroup' : 'group'}">` + q.options.map((o, i) => {
      let cls = chosen.has(i) ? 'sel' : '';
      if (review) {
        if (right.has(i)) cls += chosen.has(i) ? ' right' : ' missed';
        else if (chosen.has(i)) cls += ' wrong';
      }
      const why = review && !right.has(i) && q.why_wrong_ka?.[i] ? `<span class="why">${esc(q.why_wrong_ka[i])}</span>` : '';
      return `
        <button type="button" class="opt ${q.type} ${cls}" data-part="${part}" data-opt="${i}" ${review ? 'disabled' : ''}
          role="${q.type === 'mcq' ? 'radio' : 'checkbox'}" aria-checked="${chosen.has(i)}">
          <b class="letter">${LETTERS[i]}</b>
          <span class="otext" lang="en">${esc(o)}${why}</span>
        </button>`;
    }).join('') + '</div>';
  }

  // numeric / fill
  const val = a ?? '';
  if (!review) {
    return `
      <label class="field ans-field">
        <span>${q.type === 'numeric' ? T.quiz.enterNumber : T.quiz.enterText}</span>
        <input type="text" class="ans-in" data-part="${part}" value="${esc(val)}" autocomplete="off" autocapitalize="off" spellcheck="false"
          ${q.type === 'numeric' ? 'inputmode="decimal"' : ''}>
      </label>`;
  }
  const shown = q.type === 'numeric' && parseNumeric(val) != null ? fmtNum(parseNumeric(val)) : esc(val);
  const correct = q.correct.map((c) => (q.type === 'numeric' ? fmtNum(c) : esc(c))).join(' / ');
  return `
    <div class="ans-review">
      <div>${T.quiz.yourAnswer}: <strong>${val === '' ? `<span class="muted">${T.quiz.noAnswer}</span>` : shown}</strong></div>
      <div>${T.quiz.correctAnswer}: <strong class="ok-text">${correct}</strong></div>
    </div>`;
}

function explainHtml(q) {
  if (!q.explanation_ka) return '';
  return `<div class="explain"><div class="explain-h">${T.quiz.explanation}</div>${richText(q.explanation_ka)}</div>`;
}

export function resultBadge(r) {
  if (r.correct) return `<span class="badge done">✓ ${T.quiz.correct}</span>`;
  if (r.earned > 0) return `<span class="badge progress">◐ ${fmtNum(r.earned)}/${fmtNum(r.max)}</span>`;
  return `<span class="badge wrong">✗ ${T.quiz.wrong}</span>`;
}

/**
 * პასუხის განახლება ვარიანტზე დაჭერისას.
 * აბრუნებს ახალ პასუხს (ძველს არ ცვლის).
 */
export function toggleOption(q, answer, part, opt) {
  const target = part >= 0 ? q.parts[part] : q;
  const cur = part >= 0 ? (Array.isArray(answer) ? answer[part] : undefined) : answer;
  let next;
  if (target.type === 'mcq') next = [opt];
  else {
    const s = new Set(Array.isArray(cur) ? cur : []);
    s.has(opt) ? s.delete(opt) : s.add(opt);
    next = [...s].sort();
  }
  return setPart(q, answer, part, next);
}

/** ტექსტური ველის მნიშვნელობის ჩაწერა */
export function setText(q, answer, part, text) {
  return setPart(q, answer, part, text);
}

function setPart(q, answer, part, value) {
  if (part < 0) return value;
  const arr = Array.isArray(answer) ? [...answer] : new Array(q.parts.length).fill(undefined);
  arr[part] = value;
  return arr;
}
