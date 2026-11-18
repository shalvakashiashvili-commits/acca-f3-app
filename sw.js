/* =========================================================
   Service worker — სრული offline მუშაობა.
   პირველი ჩატვირთვისას ყველა ფაილი ინახება cache-ში, შემდეგ
   აპლიკაცია ქსელს საერთოდ აღარ მიმართავს (cache-first).

   ⚠ ახალი ფაილის დამატებისას: ჩაწერე ის ASSETS სიაში
   და გაზარდე VERSION — სხვაგვარად ტელეფონი ძველ ვერსიას დაიტოვებს.
   ========================================================= */

const VERSION = 'v1.0.1';
const CACHE = `acca-f3-${VERSION}`;

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/app.css',
  'js/app.js',
  'js/config.js',
  'js/db.js',
  'js/router.js',
  'js/strings.ka.js',
  'js/ui/components.js',
  'js/ui/theme.js',
  'js/import/validate.js',
  'js/import/importer.js',
  'js/core/pdfstore.js',
  'js/core/stats.js',
  'js/core/progress.js',
  'js/core/demo.js',
  'js/core/clock.js',
  'js/core/scoring.js',
  'js/core/mistakes.js',
  'js/core/picker.js',
  'js/core/session.js',
  'js/ui/question.js',
  'js/views/practice.js',
  'js/views/run.js',
  'js/views/result.js',
  'js/views/mistakes.js',
  'js/core/exam.js',
  'js/views/exam.js',
  'js/views/examrun.js',
  'js/views/examresult.js',
  'js/core/cards.js',
  'js/core/metro.js',
  'js/core/dashboard.js',
  'js/core/backup.js',
  'js/ui/card.js',
  'js/views/cards.js',
  'js/views/metro.js',
  'js/views/chapters.js',
  'js/views/chapter.js',
  'js/views/library.js',
  'js/views/pdfviewer.js',
  'js/views/settings.js',
  'data/demo-chapter.json',
  'fonts/noto-sans-georgian-georgian.woff2',
  'fonts/noto-sans-georgian-latin.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'vendor/pdfjs/pdf.min.mjs',
  'vendor/pdfjs/pdf.worker.min.mjs',
  'vendor/pdfjs/wasm/openjpeg.wasm',
  'vendor/pdfjs/wasm/qcms_bg.wasm',
  'vendor/pdfjs/standard_fonts/FoxitDingbats.pfb',
  'vendor/pdfjs/standard_fonts/FoxitFixed.pfb',
  'vendor/pdfjs/standard_fonts/FoxitFixedBold.pfb',
  'vendor/pdfjs/standard_fonts/FoxitFixedBoldItalic.pfb',
  'vendor/pdfjs/standard_fonts/FoxitFixedItalic.pfb',
  'vendor/pdfjs/standard_fonts/FoxitSerif.pfb',
  'vendor/pdfjs/standard_fonts/FoxitSerifBold.pfb',
  'vendor/pdfjs/standard_fonts/FoxitSerifBoldItalic.pfb',
  'vendor/pdfjs/standard_fonts/FoxitSerifItalic.pfb',
  'vendor/pdfjs/standard_fonts/FoxitSymbol.pfb',
  'vendor/pdfjs/standard_fonts/LiberationSans-Bold.ttf',
  'vendor/pdfjs/standard_fonts/LiberationSans-BoldItalic.ttf',
  'vendor/pdfjs/standard_fonts/LiberationSans-Italic.ttf',
  'vendor/pdfjs/standard_fonts/LiberationSans-Regular.ttf',
];

const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);
const ASSET_URLS = new Set(ASSETS.map((u) => new URL(u, self.location).pathname));

// დაყენება: ყველა ფაილის ჩამოტვირთვა. თუ ერთიც ვერ ჩამოიტვირთა — დაყენება ჩავარდება
// და ძველი ვერსია დარჩება (ნახევრად ჩამოტვირთული ვერსია არასდროს გააქტიურდება).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
  );
});

// გააქტიურება: ძველი ვერსიების cache-ის წაშლა
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('acca-f3-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// აპლიკაციამ დაადასტურა განახლება → ახალი ვერსია აქტიურდება
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// მოთხოვნები: ჯერ cache, მერე ქსელი (მხოლოდ საკუთარი ფაილები)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // დეველოპმენტი (localhost): ჯერ ქსელი, რომ კოდის ცვლილებები მაშინვე ჩანდეს;
    // სერვერის გამორთვისას — cache (ასე offline რეჟიმიც მოწმდება).
    if (DEV) {
      try {
        const fresh = await fetch(req);
        if (fresh.ok && ASSET_URLS.has(url.pathname)) cache.put(req.mode === 'navigate' ? 'index.html' : url.pathname, fresh.clone());
        return fresh;
      } catch { /* ქსელი არ არის → ქვემოთ cache */ }
    }
    // ნავიგაცია (გვერდის გახსნა) → ყოველთვის index.html
    if (req.mode === 'navigate') {
      return (await cache.match('index.html')) || fetch(req);
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch {
      return new Response('offline', { status: 503, statusText: 'offline' });
    }
  })());
});
