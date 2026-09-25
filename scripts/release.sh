#!/usr/bin/env bash
# Creates (or updates) the GitHub release v1.2.0 and uploads all artifacts.
# Usage: GITHUB_TOKEN=ghp_xxx bash scripts/release.sh
set -euo pipefail
cd "$(dirname "$0")/.."

TOKEN="${GITHUB_TOKEN:?set GITHUB_TOKEN}"
API="https://api.github.com/repos/amirlwf/anjam"
AUTH="Authorization: Bearer $TOKEN"
TAG="v1.2.0"

PAYLOAD=$(cat <<'JSON'
{"tag_name":"v1.2.0","name":"Anjam v1.2.0","body":"## انجام — Anjam v1.2.0\n\nاپ To-Do حرفه‌ای با همگام‌سازی زنده Supabase بین ویندوز و اندروید (یک کدپایه‌ی TypeScript).\n\n**فایل‌ها:**\n- `Anjam-Setup-1.2.0.exe` — نصب‌کننده ویندوز\n- `Anjam-Portable-1.2.0.exe` — نسخه پورتبل بدون نصب\n- `Anjam-1.2.0.apk` — اندروید (امضاشده، minSdk 22 / target 34)\n\n**v1.2.0 — بازطراحی UI/UX:**\n- لیست وظایف به **کارت‌های نرم** تبدیل شد + ورود پلکانی (stagger) ردیف‌ها با انیمیشن expo-out\n- **دکمه شناور + (FAB)** در موبایل: افزودن سریع با یک لمس، وسط صفحه را اسکرول می‌کند\n- ورق پایینی (bottom-sheet) با اسلاید فنری، دسته‌ی گرفتن و blur پس‌زمینه\n- **لوگوی بزرگ‌تر و واضح‌تر** در سایدبار، ورود، صفحه‌ی بوت و آلارم\n- بخش **«ظاهر»** در تنظیمات: ۶ رنگ برند، انیمیشن نرم/کم، اندازه متن کوچک/متوسط/بزرگ\n- هدر چسبان گروه‌ها، پنهان‌سازی اکانت در موبایل (خروج از تنظیمات)، حلقه‌ی فوکوس، هاور بدون جابه‌جایی لایه\n\n**v1.2.0:** رفع کامل هسته‌ی زنگ اندروید + بخش مجوزها و تست زنگ.\n\n**v1.1.1:** زنگ دقیق کارها (روز + ساعت)، پومودورو، ریسپانسیو عمیق اندروید.\n\n**راه‌اندازی سریع:**\n1. در Supabase پروژه بساز و `supabase/schema.sql` را در SQL Editor اجرا کن.\n2. Authentication → Providers → Email → «Confirm email» را خاموش کن.\n3. اپ را باز کن → ⚙ تنظیمات → Project URL + anon key → Connect → با یک ایمیل روی هر دو دستگاه وارد شو.\n\nراهنمای کامل: `docs/SUPABASE_SETUP.md`"}
JSON
)

RID=$(curl -s --max-time 30 -H "$AUTH" "$API/releases" | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(next((r['id'] for r in d if r.get('tag_name') == '$TAG'), 0))
except Exception:
    print(0)
")
if [ "$RID" = "0" ] || [ -z "$RID" ]; then
  RID=$(printf '%s' "$PAYLOAD" | curl -s --max-time 30 -X POST -H "$AUTH" -H "Content-Type: application/json" --data-binary @- "$API/releases" | python -c "
import sys, json
try:
    print(json.load(sys.stdin).get('id') or 0)
except Exception:
    print(0)
")
fi
echo "RID=$RID"
[ "$RID" != "0" ] || { echo RELEASE_CREATE_FAILED; exit 1; }

# drop stale same-name assets so re-uploads are clean
for id in $(curl -s --max-time 30 -H "$AUTH" "$API/releases/$RID/assets" | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    d = []
names = {'Anjam-Setup-1.2.0.exe', 'Anjam-Portable-1.2.0.exe', 'Anjam-1.2.0.apk'}
print(' '.join(str(a['id']) for a in d if a['name'] in names))
"); do
  curl -s -o /dev/null -w "deleted asset $id: %{http_code}\n" --max-time 30 -X DELETE -H "$AUTH" "https://api.github.com/repos/amirlwf/anjam/releases/assets/$id"
done

up() {
  local name=$1 file=$2
  [ -f "$file" ] || { echo "  $name: MISSING FILE $file"; return 1; }
  curl -s --max-time 600 -X POST -H "$AUTH" -H "Content-Type: application/octet-stream" \
    --data-binary @"$file" "https://uploads.github.com/repos/amirlwf/anjam/releases/$RID/assets?name=$name" \
    | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    print('  unparseable response'); raise SystemExit(0)
url = d.get('browser_download_url')
if url:
    print('  OK ' + url)
else:
    print('  ERR ' + json.dumps(d.get('errors') or d)[:300])"
}

up "Anjam-1.2.0.apk" "releases/Anjam-1.2.0.apk"
up "Anjam-Setup-1.2.0.exe" "release/Anjam-Setup-1.2.0.exe"
up "Anjam-Portable-1.2.0.exe" "release/Anjam-Portable-1.2.0.exe"
echo "RELEASE=https://github.com/amirlwf/anjam/releases/tag/$TAG"
