/* =========================================================
   თავის კითხვის პროგრესი (chapterProgress ცხრილი):
   რომელი სექციებია ნანახი, PDF გახსნილა თუ არა.
   ========================================================= */

import { S, tx, reqP } from '../db.js';

/** ცვლილება ერთ ტრანზაქციაში: წაკითხვა → შეცვლა → ჩაწერა */
async function update(chapterId, fn) {
  return tx(S.chapterProgress, 'readwrite', async (t) => {
    const os = t.objectStore(S.chapterProgress);
    const now = Date.now();
    const rec = (await reqP(os.get(chapterId))) || { chapterId, sectionsSeen: [], pdfOpened: false, startedAt: now };
    fn(rec);
    rec.updatedAt = now;
    os.put(rec);
    return rec;
  });
}

export function markSectionSeen(chapterId, section) {
  return update(chapterId, (r) => { if (!r.sectionsSeen.includes(section)) r.sectionsSeen.push(section); });
}

export function markPdfOpened(chapterId) {
  return update(chapterId, (r) => { r.pdfOpened = true; });
}
