/* =========================================================
   სადემო თავი (data/demo-chapter.json) — მხოლოდ ფუნქციონალის
   შესამოწმებლად. ფაილი service worker-ის cache-შია, ამიტომ offline-იც იტვირთება.
   ========================================================= */

import { importChapterObject } from '../import/importer.js';

export async function loadDemoChapter() {
  const res = await fetch('data/demo-chapter.json');
  const data = await res.json();
  return importChapterObject(data, 'demo-chapter.json');
}
