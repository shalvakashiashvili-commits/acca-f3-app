/* =========================================================
   IndexedDB — ყველა მონაცემი ინახება აქ, ტელეფონზე.
   მთავარი წესი: კონტენტი (chapters, questions) და პროგრესი
   ცალ-ცალკე ცხრილებშია. ხელახალი იმპორტი მხოლოდ კონტენტს ცვლის.
   ========================================================= */

const DB_NAME = 'accaF3';
const DB_VERSION = 1; // სქემის შეცვლისას გაზარდე და დაამატე ბლოკი onupgradeneeded-ში

/* ცხრილების სახელები ერთ ადგილას, რომ კოდში შეცდომით არ დაიწეროს */
export const S = {
  chapters: 'chapters',             // თავის კონტენტი (იმპორტი ცვლის)
  questions: 'questions',           // კითხვები (იმპორტი ცვლის, id-ით)
  pdfs: 'pdfs',                     // ატვირთული PDF ფაილები (Blob)
  chapterLinks: 'chapterLinks',     // თავის ხელით მიბმული PDF და გვერდები
  chapterProgress: 'chapterProgress', // ნანახი სექციები, სტატუსი
  questionStats: 'questionStats',   // ყოველ კითხვაზე პასუხების სტატისტიკა
  mistakes: 'mistakes',             // შეცდომების ბანკი
  sessions: 'sessions',             // ქვიზები, ტესტები, გამოცდები (მიმდინარეც)
  cardStats: 'cardStats',           // ფლეშქარდების „ვიცი / არ ვიცი“
  notes: 'notes',                   // PDF სანიშნეები და შენიშვნები
  settings: 'settings',             // პარამეტრები (key → value)
  daily: 'daily',                   // დღიური აქტივობა (streak-ისთვის)
};

let dbPromise = null;

/** ბაზის გახსნა (ერთხელ) და საჭიროების შემთხვევაში ცხრილების შექმნა */
export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = req.result;
      const old = e.oldVersion;
      if (old < 1) {
        db.createObjectStore(S.chapters, { keyPath: 'id' });

        const q = db.createObjectStore(S.questions, { keyPath: 'id' });
        q.createIndex('chapterId', 'chapterId');
        q.createIndex('source', 'source');

        db.createObjectStore(S.pdfs, { keyPath: 'id' });
        db.createObjectStore(S.chapterLinks, { keyPath: 'chapterId' });
        db.createObjectStore(S.chapterProgress, { keyPath: 'chapterId' });
        db.createObjectStore(S.questionStats, { keyPath: 'questionId' });

        const m = db.createObjectStore(S.mistakes, { keyPath: 'questionId' });
        m.createIndex('chapterId', 'chapterId');
        m.createIndex('active', 'active'); // 1 = ბანკშია, 0 = გამოვიდა (boolean ინდექსად არ გამოდგება)

        const s = db.createObjectStore(S.sessions, { keyPath: 'id', autoIncrement: true });
        s.createIndex('type', 'type');
        s.createIndex('state', 'state');

        db.createObjectStore(S.cardStats, { keyPath: 'cardId' });

        const n = db.createObjectStore(S.notes, { keyPath: 'id', autoIncrement: true });
        n.createIndex('pdfId', 'pdfId');
        n.createIndex('chapterId', 'chapterId');

        db.createObjectStore(S.settings, { keyPath: 'key' });
        db.createObjectStore(S.daily, { keyPath: 'date' });
      }
      // მომავალი ვერსიები: if (old < 2) { ... }
    };

    req.onsuccess = () => {
      const db = req.result;
      // თუ სხვა ჩანართმა ახალი ვერსია გახსნა, ეს კავშირი დავხუროთ
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('ბაზა დაბლოკილია: დახურე აპლიკაციის სხვა ფანჯრები'));
  });
  return dbPromise;
}

/** IDBRequest → Promise */
export function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * ტრანზაქცია რამდენიმე ცხრილზე. fn(t) იღებს ტრანზაქციას.
 * მნიშვნელოვანი: fn-ის შიგნით await მხოლოდ IndexedDB მოთხოვნებზე
 * (reqP), სხვაგვარად ტრანზაქცია ავტომატურად დაიხურება.
 * Promise სრულდება მხოლოდ მაშინ, როცა ყველაფერი ჩაიწერა.
 */
export async function tx(storeNames, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('ტრანზაქცია შეწყდა'));
    Promise.resolve()
      .then(() => fn(t))
      .then((r) => { result = r; })
      .catch((err) => { try { t.abort(); } catch { /* უკვე დახურულია */ } reject(err); });
  });
}

/* ---------- მოკლე დამხმარე ფუნქციები ---------- */

export const get = (store, key) =>
  tx(store, 'readonly', (t) => reqP(t.objectStore(store).get(key)));

export const getAll = (store) =>
  tx(store, 'readonly', (t) => reqP(t.objectStore(store).getAll()));

export const getAllByIndex = (store, index, value) =>
  tx(store, 'readonly', (t) => reqP(t.objectStore(store).index(index).getAll(value)));

export const put = (store, value) =>
  tx(store, 'readwrite', (t) => reqP(t.objectStore(store).put(value)));

export const del = (store, key) =>
  tx(store, 'readwrite', (t) => reqP(t.objectStore(store).delete(key)));

export const count = (store) =>
  tx(store, 'readonly', (t) => reqP(t.objectStore(store).count()));

/** რამდენიმე ჩანაწერის ერთად ჩაწერა ერთ ტრანზაქციაში */
export const putMany = (store, values) =>
  tx(store, 'readwrite', (t) => {
    const os = t.objectStore(store);
    values.forEach((v) => os.put(v));
  });

/* ---------- პარამეტრები ---------- */

/** ნაგულისხმევი პარამეტრები. ახალი პარამეტრი დაამატე აქ. */
export const DEFAULT_SETTINGS = {
  theme: 'system',            // system | light | dark
  mistakeShare: 30,           // ქვიზში/ტესტში შეცდომების მინიმალური % (ეტაპი 2)
  dailyGoal: 20,              // დღიური მიზანი: კითხვების რაოდენობა (ეტაპი 4)
  // გამოცდის ფორმატი (ეტაპი 3). მინი-გამოცდა = ნახევარი (იხ. core/exam.js → examPlan)
  exam: { aCount: 35, aMarks: 2, bCount: 2, bMarks: 15, minutes: 120, passPct: 50 },
  examStrict: false,          // true = ტაიმერი არ ჩერდება აპლიკაციის დახურვისას
};

export async function getSetting(key) {
  const row = await get(S.settings, key);
  return row ? row.value : DEFAULT_SETTINGS[key];
}

export function setSetting(key, value) {
  return put(S.settings, { key, value });
}
