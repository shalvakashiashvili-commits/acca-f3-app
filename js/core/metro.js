/* =========================================================
   მეტრო-რეჟიმი: ერთი ღილაკი → 10-წუთიანი სესია.
   შემადგენლობა:
     - შეცდომების ბანკი (წონით, wrongCount) — მოკლე კითხვები (mtq გარდა,
       10 წუთში mtq არ ეტევა)
     - თუ შეცდომა ცოტაა (< 6) — ემატება ახალი ან სუსტი კითხვები
     - ფლეშქარდები: ჯერ „არ ვიცი“ და ახალი (იხ. cards.js → orderCards)
   რიგი: კითხვა, ბარათი, ბარათი, კითხვა, … (ერთის ამოწურვისას — მეორე).
   ჩანაწერი sessions ცხრილშია (type: 'metro'), ამიტომ შეწყვეტის შემდეგ
   იქიდან გრძელდება, სადაც გაჩერდი. დრო ითვლება მხოლოდ ეკრანზე ყოფნისას.
   ========================================================= */

import { S, getAll } from '../db.js';
import { activeMistakes } from './mistakes.js';
import { weightedSample, shuffle } from './picker.js';
import { loadCards, orderCards } from './cards.js';
import { createSession } from './session.js';

export const METRO_MINUTES = 10;
const MAX_Q = 15;
const MAX_CARDS = 30;
const MIN_MISTAKES = 6;

export async function buildMetro(rnd = Math.random) {
  const [questions, bank, stats, cards] = await Promise.all([
    getAll(S.questions), activeMistakes(), getAll(S.questionStats), loadCards(),
  ]);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const short = (q) => q && q.type !== 'mtq';

  const mist = bank.filter((m) => short(byId.get(m.questionId)));
  let qIds = weightedSample(mist, Math.min(MAX_Q, mist.length), rnd).map((m) => m.questionId);
  const mistakeN = qIds.length;

  if (qIds.length < MIN_MISTAKES) {
    // დამატება: ჯერ უპასუხო, მერე ნაკლებად სწორი
    const st = new Map(stats.map((s) => [s.questionId, s]));
    const used = new Set(qIds);
    const rest = shuffle(questions.filter((q) => short(q) && !used.has(q.id)), rnd)
      .sort((a, b) => (st.get(a.id)?.lastResult ?? -1) - (st.get(b.id)?.lastResult ?? -1));
    qIds = qIds.concat(rest.slice(0, MIN_MISTAKES * 2 - qIds.length).map((q) => q.id));
  }
  const cardIds = orderCards(cards, {}, undefined, rnd).slice(0, MAX_CARDS).map((c) => c.cardId);

  // შერევა: კ, ბ, ბ, კ, ბ, ბ …
  const items = [];
  let qi = 0;
  let ci = 0;
  while (qi < qIds.length || ci < cardIds.length) {
    if (qi < qIds.length) items.push({ k: 'q', id: qIds[qi++] });
    for (let n = 0; n < 2 && ci < cardIds.length; n++) items.push({ k: 'c', id: cardIds[ci++] });
  }
  return { items, questionIds: qIds, mistakeN, cardN: cardIds.length };
}

export async function createMetroSession(rnd) {
  const m = await buildMetro(rnd);
  if (!m.items.length) return null;
  return createSession('metro', {}, m.questionIds, {
    items: m.items, mistakeN: m.mistakeN, cardResults: {},
    durationMs: METRO_MINUTES * 60000,
  });
}
