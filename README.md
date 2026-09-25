# انجام — Anjam ✅

> اپلیکیشن To-Do حرفه‌ای با همگام‌سازی زنده بین **ویندوز** و **اندروید** از طریق Supabase
> Professional to-do app — one codebase, two releases, live sync via Supabase

<p align="center">
  <img src="logo/no%20background.png" alt="Anjam" width="96" />
</p>

<p align="center">
  <a href="https://github.com/amirlwf/anjam/releases/latest"><img src="https://img.shields.io/github/v/release/amirlwf/anjam?label=release&color=6366f1" alt="release" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20Android-111827" alt="platform" />
  <img src="https://img.shields.io/badge/language-TypeScript-3178c6" alt="language" />
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="license" />
</p>

<div dir="rtl">

## دانلود

| پلتفرم | فایل |
|---|---|
| اندروید | [`Anjam-1.3.0.apk`](https://github.com/amirlwf/anjam/releases/download/v1.3.0/Anjam-1.3.0.apk) |
| ویندوز (نصب‌کننده) | [`Anjam-Setup-1.3.0.exe`](https://github.com/amirlwf/anjam/releases/download/v1.3.0/Anjam-Setup-1.3.0.exe) |
| ویندوز (پورتبل) | [`Anjam-Portable-1.3.0.exe`](https://github.com/amirlwf/anjam/releases/download/v1.3.0/Anjam-Portable-1.3.0.exe) |

> همه در [ریلیز v1.3.0](https://github.com/amirlwf/anjam/releases/tag/v1.3.0) — یا ساخت محلی: `npm install && npm run release:win`

## تاریخچهٔ نسخه‌‌ها

**v1.3.0 (۱۴۰۴/۰۷/۰۳):**
- 🐛 **رفع باگ زنگ موقع لاگین** — یادآوری‌های گذشته دیگر هنگام بازشدن اپ زنگ نمی‌خورند (فرانسه‌ی ۶۰ ثانیه‌ای + خاموش‌شدن بی‌صدا شمارش معکوس منقضی‌شده)
- 📚 **بخش «درس»** (اختیاری): برنامهٔ درسی هفتگی (شنبه تا جمعه، رنگ هر درس، ساعت و کلاس)، مشق‌ها با موعد و هشدار سررسید، ثبت ساعت مطالعه با نمودار ۷ روز و آمار امروز/هفته
- 🏋️ **بخش «ورزش»** (اختیاری): برنامهٔ هفتگی به‌ازای هر روز (حرکت × ست × تکرار)، تیک‌زدن تمرین امروز، پیشرفت هفته و پیوستگی (streak) — هر دو بخش از تنظیمات → «بخش‌ها» فعال می‌شوند
- 🐎 **اسکرول و انیمیشن روان‌تر در اندروید**: حذف blurهای سنگین روی مسیرهای داغ، رندر خودکار ردیف‌های خارج از دید (`content-visibility`)، بدون stagger روی موبایل، اسکرولر واحد و contain شده
- 📍 دکمهٔ «موقعیت من» در ویجت آب‌وهوا (اجازهٔ مکان فقط با کلیک صریح، نه هنگام بوت)

**v1.2.0:**
- بازطراحی UI/UX — کارت‌های لیست، FAB موبایل، bottom-sheet فنری، لوگوی بزرگ‌تر، بخش «ظاهر» (رنگ برند/انیمیشن/اندازه متن)
- 📅 **روتين**: تقویم heatmap ماهانه + شعلهٔ پیوستگی + سوئیچ شمسی/میلادی همگام با تقویم اپ
- 🎁 **روزهای مهم**: یادآوری ۰ تا ۳۰ روز قبل (پیش‌فرض ۱۰ روز، ساعت‌دار) با **کاتالوگ پیشنهادی** — ولنتاین، روز مادر/پدر در هر دو جهان اسلامی و میلادی، رمضان، نوروز، یلدا و…
- 🌤 **آب‌وهوا**: چیپ مینیمال در نوار بالا + پاپ‌آور با جست‌وجوی شهر (Open-Meteo، بدون کلید)

**v1.1.2:** رفع کامل هستهٔ زنگ اندروید (ثبت پلاگین، مجوز اعلان، بازیابی بعد از ری‌استارت) + بخش وضعیت مجوزها و دکمهٔ «تست زنگ» در تنظیمات

**v1.1.1:** زنگ دقیق کارها (روز + ساعت، مثل آلارم گوشی، صفحهٔ تمام‌صفحه حتی با گوشی خاموش)، تکنیک پومودورو با فازهای خودکار، ریسپانسیو کامل اندروید

**v1.1.0:** تایمر با آلارم بومی اندروید (بوق ممتد مثل ساعت گوشی، حتی با صفحهٔ خاموش)، تقویم شمسی/میلادی، فونت وزیرمتن

**v1.0.0:** اولین ریلیز — سه‌پلتفرمی (وب/ویندوز/اندروید) با همگام‌سازی Supabase

## راه‌اندازی در ۳ قدم

1. **Supabase:** یک پروژه بساز و [`supabase/schema.sql`](supabase/schema.sql) را در SQL Editor اجرا کن —
   راهنمای تصویری: [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md)
   (برای ارتقا از نسخه‌های قبلی، همین فایل را **دوباره** اجرا کن — کاملاً امن است و چیزی را پاک نمی‌کند)
2. اپ را باز کن → ⚙ تنظیمات → **Project URL** و **anon key** را وارد کن → Test → Connect.
3. با یک ایمیل/رمز روی هر دو دستگاه وارد شو؛ همگام‌سازی خودکار و لحظه‌ای شروع می‌شود.

## امکانات

**ساختار کارها**
- 📥 Inbox + پروژه‌های رنگی + برچسب‌ها
- 🎯 ۴ سطح اولویت (P1–P4) با رنگ‌بندی استاندارد
- 🗂 زیروظایف (subtasks) با شمارندهٔ پیشرفت
- 🔁 تکرار خودکار: روزانه / روزهای کاری / هفتگی / ماهانه / سالانه (با ساخت خودکار نوبت بعدی هنگام تیک‌زدن)
- 📅 سررسید با تاریخ و ساعت

**زنگ و یادآوری**
- ⏰ زنگ دقیق کارها: زمان‌بندی مجزا برای هر کار + صفحهٔ تمام‌صفحهٔ بوق روی اندروید (حتی با گوشی خاموش و بعد از ری‌استارت، به‌لطف BootReceiver)
- ⏱ تایمر و پومودورو با فازهای خودکار و زنگ پایان تمرکز
- 🛎 «زنگ و اعلان‌ها» در تنظیمات: وضعیت مجوزها، آلارم دقیق، نمایش تمام‌صفحه و دکمهٔ تست
- 🎁 یادآوری روزهای مهم چند روز قبل از موعد (از همان موتور زنگ)

**روتين و آمار**
- 📅 تقویم heatmap ماهانه: هر روز با انجام کامل سبز می‌شود
- 🔥 شمارندهٔ پیوستگی (streak) فعلی و رکورد
- ↔️ سوئیچ شمسی/میلادی داخل خودِ تقویم، همگام با تقویم سراسری اپ

**بخش‌های اختیاری (تنظیمات → بخش‌ها)**
- 📚 **درس**: برنامهٔ هفتگی، مشق‌ها با موعد، ثبت ساعت مطالعه + نمودار هفتگی
- 🏋️ **ورزش**: برنامهٔ هفتگی با ست/تکرار، تیک‌زدن تمرین روز، پیشرفت هفته و streak

**هوشمندی ورود**
- ⚡ Quick Add با پارسر Natural-Language: `تماس با علی فردا 17:00 !p1 #کار @تماس`
  (`today`/`tomorrow`/روزهای هفته، امروز/فردا/شنبه…، `YYYY-MM-DD`، `!p1..p4`، `#پروژه`، `@برچسب`، `daily|weekly|…`)
- 🔍 جست‌وجوی فوری در عنوان، توضیحات و برچسب‌ها
- 📊 نماهای هوشمند: امروز (با گروه «عقب‌افتاده»)، پیش‌رو (۷ روز)، اولویت‌دار، همه، انجام‌شده

**زیبایی و تجربهٔ کاربری**
- 🌗 حالت روشن / تیره / بر اساس سیستم + رنگ برند + اندازهٔ متن قابل تنظیم
- 🇫🇦 **فارسی کامل با RTL** + انگلیسی (تاریخ‌ها در حالت فارسی شمسی نمایش داده می‌شوند)
- 🌤 ویجت آب‌وهوا با جست‌وجوی شهر و دکمهٔ «موقعیت من» (بدون کلید API)
- ⌨️ میان‌برها: `n` وظیفهٔ جدید · `/` جست‌وجو · `Esc` بستن
- 📱 ریسپانسیو: در موبایل سایدبار کشویی، پنل جزئیات تمام‌صفحه، bottom-sheet فنری و اسکرول روان
- 💾 کار بدون اینترنت (IndexedDB) + صف outbox؛ به‌محض وصل‌شدن، همگام می‌شود
- 🧾 پشتیبان JSON از کل داده‌ها (تنظیمات → خروجی)

## معماری

```
                 ┌────────────────────────────┐
                 │   یک کد‌بیس TypeScript      │
                 │  React + Vite + تایپ‌سخت   │
                 └─────────────┬──────────────┘
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   ┌─────────────────┐                  ┌──────────────────┐
   │ Electron (PC)   │                  │ Capacitor (اندروید)│
   │ Anjam-*.exe     │                  │ Anjam-*.apk      │
   └────────┬────────┘                  └────────┬─────────┘
            │   Supabase (Postgres + Auth + Realtime)  │
            └──────────────────┬──────────────────┘
                               ▼
        سینک LWW روی updated_at + صف outbox + کش IndexedDB
        (تغییرات زنده از طریق postgres_changes می‌آیند)
```

- **همگام‌سازی:** هر ردیف `updated_at` دارد؛ تغییر جدیدتر برنده است (Last-Write-Wins).
  تغییرات محلی اول در IndexedDB اعمال می‌شوند (آفلاین-فیرست)، در outbox می‌مانند و با اتصال،
  به‌صورت upsert به Postgres می‌روند؛ pull با کورسر + همپوشانی ۲ ثانیه‌ای انجام می‌شود.
  ۱۱ جدول: کارها، پروژه‌ها، برچسب‌ها، روتین، روزهای مهم + ۶ جدول بخش‌های درس/ورزش.
- **امنیت:** RLS روی هر جدول — هر کاربر فقط ردیف‌های خودش را می‌بیند؛ کلید anon عمومی است.
- **چرا الکترون به‌جای Go؟** نسخهٔ Go با go-webview2 طراحی شده بود، اما مراکز دانلود
  `dl.google.com` و `proxy.golang.org` روی شبکه‌های ایران مسدود/خراب هستند و ابزار Go قابل
  نصب نشد. الکترون همان رابط کاربری را با **یک زبان مشترک با اندروید (TypeScript)** اجرا می‌کند؛
  ساختار پروژه طوری است که پورت Go در آینده فقط یک `main.go` + اسکریپت build می‌خواهد.

## توسعه

```bash
npm install --include=dev
npm run dev              # وب‌سرور توسعه روی :5310
npm run build            # تایپ‌چک + بیلد production در dist/

# دسکتاپ
npx electron .           # اجرای محلی
npx electron-builder     # ساخت Setup/Portable در release/

# اندروید
npx cap sync android
node scripts/patch-capacitor-mirrors.js
cd android && ./gradlew assembleRelease

# QA (نیازمند پیش‌نمایش روی :4173 و کروم با CDP روی :9333)
node scripts/cdp-ux-check.mjs --port 9333
```

### ساختار

```
├── src/                 # هستهٔ اپ (React + TS)
│   ├── lib/sync.ts      # موتور همگام‌سازی (pull/push/realtime/outbox)
│   ├── lib/store.ts     # استور محلی + منطق دامنه
│   ├── lib/alarms.ts    # موتور زنگ (بومی اندروید + fallback وب)
│   ├── lib/nlp.ts       # پارسر Quick Add (EN/FA)
│   ├── lib/hijri.ts     # تقویم هجری برای روزهای مهم
│   ├── lib/occasions.ts # کاتالوگ مناسبت‌های پیشنهادی
│   ├── lib/weather.ts   # آب‌وهوا (Open-Meteo بدون کلید)
│   └── components/      # UI
├── electron/            # شل دسکتاپ
├── android/             # پروژهٔ Capacitor
├── scripts/             # QA (CDP) + ریلیز + راستی‌آزمایی
├── supabase/schema.sql  # اسکریپت دیتابیس + RLS + realtime
└── docs/                # راهنماها
```

## نقشهٔ راه

- تست end-to-end همگام‌سازی Supabase (نیازمند کلیدهای واقعی)
- ویجت اندروید (صفحهٔ خانه)
- آمار بهره‌وری هفتگی / ماهانه
- نمای تقویم کلی برای کارها + کشیدن‌و‌رداختن

## لایسنس

MIT — ببینید [LICENSE](LICENSE).

</div>

---

<details>
<summary><b>English (short)</b></summary>

**Anjam** is a professional to-do app with live sync between **Windows** and **Android** via Supabase.

- Tasks: projects, labels, priorities, subtasks, recurrence, natural-language Quick Add
- **Exact alarms**: full-screen ring on Android (survives screen-off and reboot), timer + Pomodoro, desktop notifications
- **Routine**: monthly heatmap calendar + streak, Jalali/Gregorian toggle
- **Key dates**: lead-time reminders (default 10 days) with a suggestion catalog covering both Islamic and Gregorian occasions
- **Weather**: minimal topbar chip with city search (keyless Open-Meteo)
- **Optional sections** (Settings → Sections): **Study** (weekly timetable, homework, study-time logs) and **Workout** (weekly plans, sets×reps, daily check-off, streak)
- Persian-first UI with full RTL + English; light/dark/system themes; offline-first with outbox sync

Download the latest release: https://github.com/amirlwf/anjam/releases/latest

Setup: run `supabase/schema.sql` in the Supabase SQL editor, then enter Project URL + anon key in Settings → Connect.

Dev: `npm install --include=dev && npm run dev` · build: `npm run build` · QA: `node scripts/cdp-ux-check.mjs --port 9333`

MIT licensed.

</details>
