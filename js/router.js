/* =========================================================
   მარტივი hash-router: #/chapter/3?x=1
   GitHub Pages-ზე hash-ით ნავიგაცია სერვერის კონფიგურაციას არ საჭიროებს.
   ========================================================= */

const routes = [];
let cleanup = null;     // წინა ეკრანის „დასუფთავების“ ფუნქცია (ტაიმერები, observer-ები)
let navDepth = 0;       // რამდენი ნაბიჯით ვართ აპლიკაციის შიგნით (უკან ღილაკისთვის)

/**
 * მარშრუტის რეგისტრაცია.
 * pattern: '/chapter/:id'  handler: async (el, params, query) => cleanupFn?
 * opts: { nav: 'home', hideNav: false }
 */
export function route(pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ re, keys, handler, opts });
}

export function navigate(path, { replace = false } = {}) {
  const url = '#' + path;
  if (replace) location.replace(url);
  else location.hash = path;
}

/** უკან: თუ აპლიკაციის შიგნით გადავედით — history.back, თორემ მთავარზე */
export function back(fallback = '/') {
  if (navDepth > 0) history.back();
  else navigate(fallback, { replace: true });
}

export function start(outlet, onRoute) {
  let first = true;
  window.addEventListener('hashchange', () => { navDepth++; render(); });
  render();

  async function render() {
    const raw = location.hash.slice(1) || '/';
    const [path, qs] = raw.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    let match = null;
    for (const r of routes) {
      const m = path.match(r.re);
      if (m) {
        match = { r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
        break;
      }
    }
    if (!match) { navigate('/', { replace: true }); return; }

    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }

    // ყოველი ეკრანი იხატება ახალ კონტეინერში — თუ ძველი ეკრანი
    // ჯერ კიდევ იტვირთება, ის მოწყვეტილ ელემენტში დაიხატება და არ შეგვიშლის.
    const el = document.createElement('div');
    outlet.replaceChildren(el);
    if (!first) window.scrollTo(0, 0);
    first = false;
    onRoute?.(match.r.opts, path);

    try {
      const c = await match.r.handler(el, match.params, query);
      if (el.isConnected && typeof c === 'function') cleanup = c;
      else if (typeof c === 'function') c();
    } catch (err) {
      console.error(err);
      el.innerHTML = `<div class="card"><strong>შეცდომა:</strong> ${String(err.message || err)}</div>`;
    }
  }
}

/** ზედა ზოლის სათაური და „უკან“ ღილაკი */
export function setHeader(title, { back: showBack = false } = {}) {
  document.getElementById('page-title').textContent = title;
  document.getElementById('btn-back').hidden = !showBack;
  document.title = title === 'ACCA F3' ? title : `${title} · ACCA F3`;
}
