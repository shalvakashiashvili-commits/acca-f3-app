/* =========================================================
   ფლეშქარდები: თავის flashcards + summary.must_memorize.

   ბარათის id სტაბილურია ხელახალი იმპორტისას: თავი + ტიპი + ტექსტის ჰეში
   (ბარათების თანმიმდევრობის შეცვლა პროგრესს არ შლის; ტექსტის შეცვლა —
   ახალი ბარათია).

   cardStats ჩანაწერი:
     { cardId, chapterId, box, due, knownCount, unknownCount, lastResult: 1|0, lastSeen }
   გამეორების წესი (Leitner-ის ყუთები):
     „არ ვიცი“ → ყუთი 0, ბარათი მალევე ბრუნდება (დღესვე)
     „ვიცი“    → ყუთი +1, შემდეგი ჩვენება INTERVAL_DAYS[ყუთი] დღეში
   ჩვენების რიგი: ჯერ ვადაგასული „არ ვიცი“, მერე ახალი, მერე ვადაგასული
   „ვიცი“, ბოლოს — დანარჩენი (ყველაზე ადრე ნანახი პირველი).
   ========================================================= */

import { S, getAll, tx, reqP } from '../db.js';
import { now, dayKey } from './clock.js';

export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];

/** მოკლე სტაბილური ჰეში (FNV-1a) */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** ერთი თავის ბარათები */
export function cardsForChapter(ch) {
  const out = [];
  for (const m of ch.summary?.must_memorize || []) {
    out.push({
      cardId: `${ch.id}:m:${hash(m.term_en + '|' + (m.term_ka || ''))}`,
      chapterId: ch.id, kind: 'memo',
      front: m.term_en, frontSub: m.term_ka || '',
      back: m.definition_ka || '', formula: m.formula || '',
    });
  }
  for (const f of ch.flashcards || []) {
    out.push({
      cardId: `${ch.id}:f:${hash(f.front)}`,
      chapterId: ch.id, kind: 'card',
      front: f.front, frontSub: '', back: f.back || '', formula: '',
    });
  }
  return out;
}

/** ყველა ბარათი + სტატისტიკა: [{ ...card, stat }] */
export async function loadCards({ chapterIds = null } = {}) {
  const [chapters, stats] = await Promise.all([getAll(S.chapters), getAll(S.cardStats)]);
  const sm = new Map(stats.map((s) => [s.cardId, s]));
  return chapters
    .filter((c) => !chapterIds || !chapterIds.length || chapterIds.includes(c.id))
    .sort((a, b) => a.id - b.id)
    .flatMap(cardsForChapter)
    .map((c) => ({ ...c, stat: sm.get(c.cardId) || null }));
}

/** ბარათის მდგომარეობა: 'new' | 'unknown' | 'known' */
export const cardState = (c) => (!c.stat ? 'new' : c.stat.lastResult ? 'known' : 'unknown');

/**
 * ჩვენების რიგი (იხ. ზემოთ). onlyUnknown = მხოლოდ „არ ვიცი“ და ახალი.
 * rnd — თანაბარი პრიორიტეტის ბარათების ასარევად.
 */
export function orderCards(cards, { onlyUnknown = false } = {}, t = now(), rnd = Math.random) {
  const rank = (c) => {
    const st = cardState(c);
    const due = !c.stat || c.stat.due <= t;
    if (st === 'unknown' && due) return 0;
    if (st === 'new') return 1;
    if (st === 'unknown') return 2;
    if (due) return 3;
    return 4;
  };
  return cards
    .filter((c) => !onlyUnknown || cardState(c) !== 'known')
    .map((c) => ({ c, r: rank(c), k: rnd(), seen: c.stat?.lastSeen || 0 }))
    .sort((a, b) => a.r - b.r || (a.r >= 3 ? a.seen - b.seen : a.k - b.k))
    .map((x) => x.c);
}

/** „ვიცი“ / „არ ვიცი“ ჩაწერა (cardStats + დღიური აქტივობა) */
export async function rateCard(card, known, ts = now()) {
  let rec;
  await tx([S.cardStats, S.daily], 'readwrite', async (t) => {
    const cs = t.objectStore(S.cardStats);
    rec = (await reqP(cs.get(card.cardId))) || { cardId: card.cardId, chapterId: card.chapterId, box: 0, knownCount: 0, unknownCount: 0 };
    if (known) {
      rec.box = Math.min(INTERVAL_DAYS.length - 1, (rec.lastResult ? rec.box : 0) + 1);
      rec.knownCount++;
    } else {
      rec.box = 0;
      rec.unknownCount++;
    }
    rec.lastResult = known ? 1 : 0;
    rec.lastSeen = ts;
    rec.due = ts + INTERVAL_DAYS[rec.box] * 86400000;
    cs.put(rec);

    const daily = t.objectStore(S.daily);
    const key = dayKey(ts);
    const d = (await reqP(daily.get(key))) || { date: key, answered: 0, correct: 0 };
    d.cards = (d.cards || 0) + 1;
    daily.put(d);
  });
  return rec;
}
