/* =========================================================
   სარეზერვო ასლი: სრული ექსპორტი / იმპორტი ერთ JSON ფაილში.

   შედის: თავების JSON კონტენტი და კითხვები, პროგრესი, კითხვების
   სტატისტიკა, შეცდომების ბანკი, ქვიზები/ტესტები/გამოცდები (ისტორია),
   ფლეშქარდების სტატისტიკა, PDF სანიშნეები და შენიშვნები, თავების
   PDF-მიბმა, დღიური აქტივობა, პარამეტრები.
   PDF ფაილები — მხოლოდ თუ მონიშნულია (დიდია; base64-ით, ~1.33×).

   ფორმატი:
   { "app": "acca-f3", "format": 1, "version": "...", "exportedAt": ms,
     "includesPdfs": true|false,
     "stores": { "<ცხრილი>": [ ჩანაწერები ], ... } }
   stores.pdfs (თუ includesPdfs): Blob-ის ნაცვლად "type" და "data" (base64).

   იმპორტი = სრული აღდგენა: ფაილში არსებული ცხრილები იწმინდება და
   ივსება ფაილიდან. თუ ფაილში PDF-ები არ არის, ტელეფონზე არსებული
   PDF-ები ხელუხლებელი რჩება.
   ========================================================= */

import { S, tx, reqP, getAll, getSetting, setSetting, count } from '../db.js';
import { now } from './clock.js';
import { APP_VERSION } from '../config.js';

export const FORMAT = 1;
export const REMIND_DAYS = 7;
const DATA_STORES = Object.values(S).filter((n) => n !== S.pdfs);

/** Blob → base64 (data: პრეფიქსის გარეშე) */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/pdf' });
}

/**
 * ექსპორტი → { blob, filename, counts }
 * ფაილი იწყობა ნაწილებად (Blob parts), რომ დიდი PDF-ები ერთ
 * უზარმაზარ სტრიქონად არ გაერთიანდეს მეხსიერებაში.
 */
export async function exportBackup({ includePdfs = false } = {}) {
  const counts = {};
  const parts = [];
  const head = { app: 'acca-f3', format: FORMAT, version: APP_VERSION, exportedAt: now(), includesPdfs: includePdfs };
  parts.push(JSON.stringify(head).slice(0, -1) + ',"stores":{');

  let first = true;
  for (const name of DATA_STORES) {
    let rows = await getAll(name);
    if (name === S.settings) rows = rows.filter((r) => r.key !== 'lastBackup'); // ამ ტელეფონის ინფორმაცია
    counts[name] = rows.length;
    parts.push((first ? '' : ',') + JSON.stringify(name) + ':' + JSON.stringify(rows));
    first = false;
  }
  if (includePdfs) {
    const pdfs = await getAll(S.pdfs);
    counts[S.pdfs] = pdfs.length;
    parts.push(',"pdfs":[');
    for (let i = 0; i < pdfs.length; i++) {
      const { blob, ...meta } = pdfs[i];
      meta.type = blob?.type || 'application/pdf';
      parts.push((i ? ',' : '') + JSON.stringify(meta).slice(0, -1) + ',"data":"');
      parts.push(await blobToBase64(blob));
      parts.push('"}');
    }
    parts.push(']');
  }
  parts.push('}}');

  const d = new Date(head.exportedAt);
  const p = (n) => String(n).padStart(2, '0');
  const filename = `acca-f3-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}${includePdfs ? '-pdf' : ''}.json`;
  return { blob: new Blob(parts, { type: 'application/json' }), filename, counts };
}

/** ექსპორტის დასრულება: თარიღის ჩაწერა შეხსენებისთვის */
export const markBackupDone = () => setSetting('lastBackup', now());

/** ფაილის წაკითხვა და შემოწმება → { data, counts } ან შეცდომა */
export async function readBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('ფაილი არ არის სწორი JSON');
  }
  if (data?.app !== 'acca-f3' || !data.stores || typeof data.stores !== 'object') {
    throw new Error('ეს არ არის ACCA F3-ის სარეზერვო ასლი');
  }
  if (data.format > FORMAT) throw new Error('სარეზერვო ასლი აპლიკაციის უფრო ახალი ვერსიითაა შექმნილი — ჯერ განაახლე აპლიკაცია');
  const counts = {};
  for (const [name, rows] of Object.entries(data.stores)) {
    if (!DATA_STORES.includes(name)) continue; // უცნობი ცხრილი — გამოვტოვებთ
    if (!Array.isArray(rows)) throw new Error(`ცხრილი „${name}“ დაზიანებულია`);
    counts[name] = rows.length;
  }
  if (data.includesPdfs) counts[S.pdfs] = (data.stores.pdfs || []).length;
  return { data, counts };
}

/** აღდგენა (ერთ ტრანზაქციაში — ან ყველაფერი, ან არაფერი) */
export async function restoreBackup(data) {
  const names = Object.keys(data.stores).filter((n) => DATA_STORES.includes(n));
  // PDF-ების გაშიფვრა ტრანზაქციამდე (ტრანზაქციის შიგნით სხვა await არ შეიძლება)
  const pdfs = data.includesPdfs
    ? (data.stores.pdfs || []).map(({ data: b64, type, ...meta }) => ({ ...meta, blob: base64ToBlob(b64, type) }))
    : null;
  const stores = pdfs ? [...names, S.pdfs] : names;
  await tx(stores, 'readwrite', async (t) => {
    for (const name of names) {
      const os = t.objectStore(name);
      await reqP(os.clear());
      for (const row of data.stores[name]) os.put(row);
    }
    if (pdfs) {
      const os = t.objectStore(S.pdfs);
      await reqP(os.clear());
      for (const row of pdfs) os.put(row);
    }
  });
  await markBackupDone(); // აღდგენილი მონაცემები უკვე არის ფაილში
}

/** შეხსენება: ბოლო ექსპორტიდან (ან პირველი გამოყენებიდან) ≥ 7 დღე და არის მონაცემები */
export async function backupReminderDue() {
  const [last, first, sessions, stats] = await Promise.all([
    getSetting('lastBackup'), getSetting('firstUse'), count(S.sessions), count(S.questionStats),
  ]);
  if (!sessions && !stats) return false; // დასაცავი პროგრესი ჯერ არ არის
  const since = last || first || now();
  return now() - since >= REMIND_DAYS * 86400000 ? { last } : false;
}

/* ---------- მუდმივი მეხსიერება ---------- */

export async function isPersisted() {
  return (await navigator.storage?.persisted?.()) ?? false;
}

/** მოთხოვნა, რომ ბრაუზერმა მონაცემები თვითონ არ წაშალოს */
export async function requestPersist() {
  if (!navigator.storage?.persist) return false;
  if (await isPersisted()) return true;
  try { return await navigator.storage.persist(); } catch { return false; }
}
