# ACCA F3 — პირადი სასწავლო აპლიკაცია (PWA)

ACCA F3 / Financial Accounting-ის მოსამზადებელი აპლიკაცია ტელეფონისთვის.
მუშაობს **სრულად ინტერნეტის გარეშე**: ყველა ფაილი, PDF და პროგრესი ინახება ტელეფონში (IndexedDB).
სერვერი და გარე API არ გამოიყენება.

## სტრუქტურა

```
index.html              აპლიკაციის გარსი
manifest.webmanifest    PWA (სახელი, ხატულები)
sw.js                   service worker — offline cache (ASSETS სია + VERSION)
css/tokens.css          ფერები, შრიფტი, ღია/მუქი თემა
css/app.css             კომპონენტები
js/app.js               გაშვება, მარშრუტები
js/db.js                IndexedDB ცხრილები და დამხმარეები
js/strings.ka.js        ინტერფეისის ყველა ქართული ტექსტი
js/import/              JSON ვალიდაცია და იმპორტი
js/core/                PDF, სტატისტიკა, პროგრესი
js/views/               ეკრანები
data/demo-chapter.json  სადემო თავი (ერთადერთი ჩაშენებული კონტენტი)
vendor/pdfjs/           pdf.js 5.4.149 (legacy build), ლოკალურად
fonts/                  Noto Sans Georgian (OFL)
tools/serve.ps1         ლოკალური სერვერი ტესტირებისთვის
tools/make-icons.ps1    ხატულების გენერაცია
```

## ლოკალურად გაშვება

```bash
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

შემდეგ გახსენი http://localhost:8080/ .
localhost-ზე service worker ჯერ ქსელს მიმართავს, რომ კოდის ცვლილებები მაშინვე ჩანდეს.
სერვერის გამორთვის შემდეგ ფაილები cache-იდან იტვირთება. GitHub Pages-ზე პირიქითაა: ჯერ cache, შემდეგ ქსელი.

## კოდის შეცვლისას

1. ახალი ფაილის დამატებისას ჩაწერე ის `sw.js`-ის `ASSETS` სიაში.
2. გაზარდე `VERSION` `sw.js`-ში (და `APP_VERSION` `js/config.js`-ში). ტელეფონზე გამოჩნდება შეტყობინება „ხელმისაწვდომია ახალი ვერსია“.

## კონტენტის ფორმატი

ერთი JSON ფაილი = ერთი თავი (`chapter`, `summary`, `case_study`, `flashcards`, `questions`).
დამატებითი კითხვების ფაილს საკმარისია ჰქონდეს `{ "chapter": { "id": N }, "questions": [...] }`.
კითხვები ერწყმის `id`-ით. ხელახალი იმპორტი პროგრესს არ შლის.

არასავალდებულო ველები, რომლებიც სქემას დაემატა:
- `chapter.weight` — თავის წონა გამოცდის სიმულაციაში. თუ არ არის მითითებული, წონა თავის კითხვების რაოდენობის პროპორციულია.
- `tolerance` (numeric კითხვაზე) — დასაშვები ცდომილება (ნაგულისხმევად ±0.5).
- `difficulty` — 1-დან 5-მდე.

## ტელეფონზე დაყენება

ინსტრუქცია დაემატება ეტაპ 4-ში, GitHub Pages-ზე განთავსების შემდეგ.

## ლიცენზიები

- pdf.js — Apache 2.0 (`vendor/pdfjs/LICENSE`)
- Noto Sans Georgian — SIL Open Font License (`fonts/LICENSE-OFL.txt`)
