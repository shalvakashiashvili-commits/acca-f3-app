/* =========================================================
   საათი. აპლიკაცია დროს მხოლოდ აქედან იღებს, რომ
   შეცდომების ბანკის „სხვადასხვა დღის“ წესი შემოწმდეს
   თარიღის სიმულაციით (დღეების გადაწევა).

   ტესტირებისთვის (ბრაუზერის კონსოლში):
     (await import('./js/core/clock.js')).shiftDays(1)
   ცვლილება მხოლოდ მეხსიერებაშია — გვერდის გადატვირთვა აუქმებს.
   ========================================================= */

let offsetMs = 0;

export function now() {
  return Date.now() + offsetMs;
}

/** დროის გადაწევა n დღით (მხოლოდ ტესტირებისთვის) */
export function shiftDays(n) {
  offsetMs += n * 86400000;
  return new Date(now()).toString();
}

export function resetClock() {
  offsetMs = 0;
}

/** ლოკალური დღის გასაღები: "2026-11-18" (შუაღამე ტელეფონის საათით) */
export function dayKey(ts = now()) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
