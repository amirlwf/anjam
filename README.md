# انجم — Anjam ✅

> اپلیکیشن To-Do حرفه‌ای با همگام‌سازی Supabase بین ویندوز و اندروید
> Professional to-do app with Supabase sync across Windows & Android

در حال ساخت... (Work in progress)

## معماری / Architecture

- **PC (ویندوز):** Go + WebView2 → یک فایل `anjam.exe` تک‌فایلی
- **اندروید:** Capacitor (WebView) → فایل `app-release.apk`
- **UI مشترک:** TypeScript + Vite (یک کد‌بیس برای هر دو پلتفرم)
- **همگام‌سازی:** Supabase (Postgres + Auth + Realtime) با کش آفلاین IndexedDB
