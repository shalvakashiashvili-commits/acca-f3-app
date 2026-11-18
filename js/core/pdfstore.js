/* =========================================================
   PDF ფაილები: pdf.js-ის ჩატვირთვა (ლოკალურად), ფაილების
   შენახვა IndexedDB-ში და თავისთვის სწორი PDF/გვერდების პოვნა.
   ========================================================= */

import { S, tx, reqP, get, put, getAll } from '../db.js';

const VENDOR = new URL('../../vendor/pdfjs/', import.meta.url).href;
let pdfjsPromise = null;

/** pdf.js იტვირთება მხოლოდ მაშინ, როცა პირველად დაგვჭირდება (~450 KB) */
export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../../vendor/pdfjs/pdf.min.mjs').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = VENDOR + 'pdf.worker.min.mjs';
      return lib;
    });
  }
  return pdfjsPromise;
}

/** Blob → pdf.js დოკუმენტი. ყველა დამხმარე ფაილი (შრიფტები, wasm) ლოკალურია. */
export async function openPdfDocument(blob) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await blob.arrayBuffer());
  return pdfjs.getDocument({
    data,
    standardFontDataUrl: VENDOR + 'standard_fonts/',
    wasmUrl: VENDOR + 'wasm/',
    isEvalSupported: false,
  }).promise;
}

function newId() {
  return (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
}

/**
 * PDF-ის შენახვა.
 * kind: 'book' (მთლიანი წიგნი) | 'kit' (კრებული) | 'chapter' (ცალკე თავი, chapterId სავალდებულო)
 */
export async function addPdf(file, kind, chapterId = null) {
  const doc = await openPdfDocument(file);
  const pageCount = doc.numPages;
  await doc.destroy();
  const rec = {
    id: newId(),
    name: file.name,
    kind,
    chapterId: kind === 'chapter' ? chapterId : null,
    blob: file,           // File არის Blob — IndexedDB მას პირდაპირ ინახავს
    size: file.size,
    pageCount,
    addedAt: Date.now(),
  };
  await put(S.pdfs, rec);
  return rec;
}

/** PDF-ის წაშლა + მისი სანიშნეები/შენიშვნები + ხელით მიბმის ჩანაწერები */
export async function deletePdf(pdfId) {
  await tx([S.pdfs, S.notes, S.chapterLinks], 'readwrite', async (t) => {
    t.objectStore(S.pdfs).delete(pdfId);
    const notes = t.objectStore(S.notes);
    const keys = await reqP(notes.index('pdfId').getAllKeys(pdfId));
    keys.forEach((k) => notes.delete(k));
    const links = t.objectStore(S.chapterLinks);
    const all = await reqP(links.getAll());
    for (const l of all) {
      let changed = false;
      for (const slot of ['book', 'kit']) {
        if (l[slot]?.pdfId === pdfId) { delete l[slot]; changed = true; }
      }
      if (changed) links.put(l);
    }
  });
}

/** PDF-ების სია (Blob-ები მეხსიერებაში არ იტვირთება, სანამ არ წავიკითხავთ) */
export async function listPdfs() {
  const all = await getAll(S.pdfs);
  return all.sort((a, b) => a.addedAt - b.addedAt);
}

export const getChapterLink = (chapterId) => get(S.chapterLinks, chapterId);
export const saveChapterLink = (link) => put(S.chapterLinks, link);

/**
 * რომელი PDF და რომელი გვერდები ეკუთვნის თავს.
 * slot = 'book' | 'kit'. პრიორიტეტი:
 *  1) ხელით მიბმა (chapterLinks) — pdfId: 'none' ნიშნავს „არ აჩვენო“
 *  2) book: ამ თავისთვის ატვირთული „ცალკე თავი“ PDF (მთლიანი ფაილი)
 *  3) იმავე ტიპის მთლიანი PDF (წიგნი/კრებული) + JSON-ის pdf_pages დიაპაზონი
 * აბრუნებს { pdf, from, to, whole } | { missing: true } | null
 */
export function resolveChapterPdf(chapter, slot, pdfs, link) {
  const manual = link?.[slot];
  let pdf = null;
  let range = null;

  if (manual) {
    if (manual.pdfId === 'none') return null;
    pdf = pdfs.find((p) => p.id === manual.pdfId);
    if (!pdf) return { missing: true };
    if (manual.from) range = [manual.from, manual.to || manual.from];
    else if (pdf.kind !== 'chapter') range = chapter.pdf_pages?.[slot] || null;
  } else {
    if (slot === 'book') pdf = latest(pdfs.filter((p) => p.kind === 'chapter' && p.chapterId === chapter.id));
    if (!pdf) {
      pdf = latest(pdfs.filter((p) => p.kind === slot));
      if (pdf) range = chapter.pdf_pages?.[slot] || null;
    }
    if (!pdf) return null;
  }

  // გვერდების შეზღუდვა ფაილის რეალური ზომით
  if (!range) return { pdf, from: 1, to: pdf.pageCount, whole: true };
  const from = Math.min(Math.max(1, range[0]), pdf.pageCount);
  const to = Math.min(Math.max(from, range[1]), pdf.pageCount);
  return { pdf, from, to, whole: from === 1 && to === pdf.pageCount };
}

function latest(list) {
  return list.sort((a, b) => b.addedAt - a.addedAt)[0] || null;
}
