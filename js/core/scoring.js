/* =========================================================
   ქულების დათვლა.
   პასუხის ფორმა:
     mcq / multi     → [ვარიანტის ნომრები], მაგ. [1] ან [0, 2]
     numeric / fill  → ტექსტი, როგორც შეიყვანე, მაგ. "12 500"
     mtq             → [ნაწილი1-ის პასუხი, ნაწილი2-ის პასუხი, …]
   წესები (ACCA CBE-ის მსგავსად):
     - ყოველი კითხვა/ნაწილი: ან სრული ქულა, ან 0
     - multi: ქულა მხოლოდ ყველა სწორი ვარიანტის (და მხოლოდ მათი) მონიშვნით
     - mtq: ქულა = სწორი ნაწილების ქულების ჯამი (ნაწილობრივი ქულა)
     - numeric: მძიმეები, ინტერვალები და ვალუტის ნიშნები იგნორირდება;
       დასაშვები ცდომილება = tolerance (ნაგულისხმევად ±0.5)
     - fill: დიდი/პატარა ასოები და ზედმეტი ინტერვალები იგნორირდება
   ========================================================= */

export const DEFAULT_TOLERANCE = 0.5;

/** "12 500", "12,500", "$12,500", "(500)" → რიცხვი; ვერ წაიკითხა → null */
export function parseNumeric(input) {
  if (typeof input === 'number') return isFinite(input) ? input : null;
  let s = String(input ?? '').trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); } // ბუღალტრული უარყოფითი: (500)
  s = s.replace(/[\s   ,$£€₾]/g, '');
  if (/^[-−–]/.test(s)) { neg = !neg; s = s.slice(1); }
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = parseFloat(s);
  return neg ? -n : n;
}

/** ტექსტური პასუხის ნორმალიზაცია fill-ისთვის */
export function normalizeText(s) {
  return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '');
}

/** ერთი კითხვა (ან mtq-ის ნაწილი) → { earned, max, correct } */
export function gradeSingle(q, answer) {
  const max = q.marks || 0;
  let correct = false;
  switch (q.type) {
    case 'mcq':
    case 'multi': {
      const a = Array.isArray(answer) ? [...new Set(answer)].sort() : [];
      const c = [...q.correct].sort();
      correct = a.length === c.length && a.every((v, i) => v === c[i]);
      break;
    }
    case 'numeric': {
      const v = parseNumeric(answer);
      const tol = q.tolerance ?? DEFAULT_TOLERANCE;
      correct = v != null && q.correct.some((c) => Math.abs(v - c) <= tol);
      break;
    }
    case 'fill': {
      const v = normalizeText(answer);
      correct = v !== '' && q.correct.some((c) => normalizeText(c) === v);
      break;
    }
  }
  return { earned: correct ? max : 0, max, correct };
}

/**
 * კითხვის შეფასება → { earned, max, ratio (0..1), correct, parts? }
 * correct = true მხოლოდ სრული ქულისას (ეს წყვეტს შეცდომების ბანკს).
 */
export function gradeQuestion(q, answer) {
  if (q.type === 'mtq') {
    const parts = q.parts.map((p, i) => gradeSingle(p, Array.isArray(answer) ? answer[i] : undefined));
    const earned = parts.reduce((s, p) => s + p.earned, 0);
    const max = parts.reduce((s, p) => s + p.max, 0);
    return { earned, max, ratio: max ? earned / max : 0, correct: earned === max && max > 0, parts };
  }
  const r = gradeSingle(q, answer);
  return { ...r, ratio: r.max ? r.earned / r.max : 0 };
}

/** ერთ ნაწილზე/კითხვაზე პასუხი გაცემულია? */
function singleAnswered(type, a) {
  if (type === 'mcq' || type === 'multi') return Array.isArray(a) && a.length > 0;
  return String(a ?? '').trim() !== '';
}

/** 'none' | 'partial' (mtq-ის ნაწილი) | 'full' */
export function answerState(q, answer) {
  if (q.type !== 'mtq') return singleAnswered(q.type, answer) ? 'full' : 'none';
  const n = q.parts.filter((p, i) => singleAnswered(p.type, Array.isArray(answer) ? answer[i] : undefined)).length;
  return n === 0 ? 'none' : n === q.parts.length ? 'full' : 'partial';
}

/** ქულის მაქსიმუმი (mtq — ნაწილების ჯამი) */
export function maxMarks(q) {
  return q.type === 'mtq' ? q.parts.reduce((s, p) => s + (p.marks || 0), 0) : q.marks || 0;
}
