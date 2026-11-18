/* =========================================================
   თემა: 'system' (ტელეფონის პარამეტრის მიხედვით) | 'light' | 'dark'.
   ხელით არჩეული თემა იწერება <html data-theme="…">-ში.
   ========================================================= */

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  // ბრაუზერის ზედა ზოლის ფერი
  const dark = isDark();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#181c22' : '#2457c5');
}

/** ახლა რეალურად მუქი თემაა თუ არა */
export function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t) return t === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
