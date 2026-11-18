/* =========================================================
   თავების JSON-ის იმპორტი.
   - რამდენიმე ფაილი ერთად; ჯერ სრული თავები, შემდეგ დამატებითი კითხვები.
   - კითხვები ერწყმის id-ით: არსებული id განახლდება, ახალი დაემატება,
     ძველი (რომელიც ახალ ფაილში არ არის) არ იშლება — ის შეიძლება სხვა ფაილიდან იყოს.
   - პროგრესის ცხრილებს (questionStats, mistakes, chapterProgress …) იმპორტი არ ეხება.
   ========================================================= */

import { S, tx, reqP } from '../db.js';
import { validateChapterFile } from './validate.js';
import { T } from '../strings.ka.js';

/**
 * File[] → ანგარიშების მასივი:
 * [{ name, ok, lines: [{ cls: 'ok'|'warn'|'err', text }] }]
 */
export async function importJsonFiles(files) {
  const parsed = [];
  for (const f of files) {
    const item = { name: f.name, data: null, check: null, parseError: null };
    try {
      const text = (await f.text()).replace(/^﻿/, ''); // BOM-ის მოცილება
      item.data = JSON.parse(text);
      item.check = validateChapterFile(item.data);
    } catch (e) {
      item.parseError = jsonErrorKa(e);
    }
    parsed.push(item);
  }

  // სრული თავები პირველ რიგში, რომ დამატებითი კითხვები უკვე არსებულ თავს მიებას
  parsed.sort((a, b) => rank(a) - rank(b));

  const reports = [];
  for (const item of parsed) reports.push(await importOne(item));
  return reports;
}

/** ერთი უკვე წაკითხული ობიექტის იმპორტი (მაგ. სადემო თავი) */
export async function importChapterObject(data, name) {
  return importOne({ name, data, check: validateChapterFile(data), parseError: null });
}

function rank(item) { return item.check?.kind === 'full' ? 0 : 1; }

async function importOne(item) {
  const rep = { name: item.name, ok: false, lines: [] };
  if (item.parseError) {
    rep.lines.push({ cls: 'err', text: item.parseError });
    return rep;
  }
  const { kind, errors, warnings } = item.check;
  if (errors.length) {
    rep.lines.push({ cls: 'err', text: T.importReport.failed(item.name) });
    errors.forEach((e) => rep.lines.push({ cls: 'err', text: e }));
    return rep;
  }
  try {
    const res = await saveChapterData(item.data, kind);
    rep.ok = true;
    rep.chapterId = item.data.chapter.id;
    if (kind === 'full') rep.lines.push({ cls: 'ok', text: T.importReport.okFull(item.data.chapter.id, item.data.chapter.title_ka || item.data.chapter.title_en) });
    else rep.lines.push({ cls: 'ok', text: T.importReport.okQuestions(item.data.chapter.id) });
    if (res.stubCreated) rep.lines.push({ cls: 'warn', text: T.importReport.stubCreated(item.data.chapter.id) });
    rep.lines.push({ cls: 'ok', text: T.importReport.counts(res.added, res.updated) });
    if (kind === 'full') rep.lines.push({ cls: 'ok', text: T.importReport.flashcards((item.data.flashcards || []).length) });
    res.warnings.concat(warnings).forEach((w) => rep.lines.push({ cls: 'warn', text: w }));
  } catch (e) {
    rep.lines.push({ cls: 'err', text: `${T.importReport.failed(item.name)}: ${e.message}` });
  }
  return rep;
}

/**
 * მონაცემების ჩაწერა ერთ ტრანზაქციაში (ან ყველაფერი, ან არაფერი).
 * აბრუნებს { added, updated, stubCreated, warnings }
 */
async function saveChapterData(data, kind) {
  const ch = data.chapter;
  const now = Date.now();
  const out = { added: 0, updated: 0, stubCreated: false, warnings: [] };

  await tx([S.chapters, S.questions], 'readwrite', async (t) => {
    const chapters = t.objectStore(S.chapters);
    const questions = t.objectStore(S.questions);
    const existing = await reqP(chapters.get(ch.id));

    if (kind === 'full') {
      chapters.put({
        id: ch.id,
        title_en: ch.title_en || '',
        title_ka: ch.title_ka || '',
        pdf_pages: ch.pdf_pages || null,
        weight: ch.weight ?? null,
        summary: data.summary || null,
        case_study: data.case_study || null,
        flashcards: data.flashcards || [],
        stub: false,
        createdAt: existing?.createdAt ?? now,
        importedAt: now,
      });
    } else if (!existing) {
      // კითხვები მოვიდა თავზე ადრე — ვქმნით დროებით ჩანაწერს
      chapters.put({
        id: ch.id, title_en: '', title_ka: '', pdf_pages: null, weight: null,
        summary: null, case_study: null, flashcards: [], stub: true,
        createdAt: now, importedAt: now,
      });
      out.stubCreated = true;
    }

    for (const q of data.questions || []) {
      const old = await reqP(questions.get(q.id));
      if (old) {
        out.updated++;
        if (old.chapterId !== ch.id) out.warnings.push(`კითხვა ${q.id} ადრე თავ ${old.chapterId}-ს ეკუთვნოდა — გადავიდა თავ ${ch.id}-ში`);
      } else {
        out.added++;
      }
      questions.put(normalizeQuestion(q, ch.id));
    }
  });
  return out;
}

/** კითხვის ჩანაწერი ბაზისთვის: + chapterId, mtq-ის ქულა = ნაწილების ჯამი */
function normalizeQuestion(q, chapterId) {
  const rec = { ...q, chapterId, difficulty: q.difficulty ?? 1 };
  if (q.type === 'mtq') rec.marks = q.parts.reduce((s, p) => s + (p.marks || 0), 0);
  return rec;
}

/** თავის კონტენტის წაშლა (კითხვებიც). პროგრესი რჩება. */
export async function deleteChapterContent(chapterId) {
  await tx([S.chapters, S.questions], 'readwrite', async (t) => {
    t.objectStore(S.chapters).delete(chapterId);
    const qs = t.objectStore(S.questions);
    const keys = await reqP(qs.index('chapterId').getAllKeys(chapterId));
    keys.forEach((k) => qs.delete(k));
  });
}

/** JSON.parse-ის შეცდომა გასაგებ ქართულ ტექსტად */
function jsonErrorKa(e) {
  const m = String(e.message || e);
  const pos = m.match(/position (\d+)/i) || m.match(/column (\d+)/i);
  let hint = 'შეამოწმე ბრჭყალები, მძიმეები და ფრჩხილები. ხშირი მიზეზი: ზედმეტი მძიმე ბოლო ელემენტის შემდეგ ან „ჭკვიანი“ ბრჭყალები “ ”.';
  return `ფაილი არ არის სწორი JSON${pos ? ` (დაახლ. სიმბოლო ${pos[1]})` : ''}. ${hint}`;
}
