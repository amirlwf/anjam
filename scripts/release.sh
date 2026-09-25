#!/usr/bin/env bash
# Creates (or updates) the GitHub release for the CURRENT package.json version
# and uploads all artifacts. Version comes from package.json — never hardcoded.
# Usage: GITHUB_TOKEN=ghp_xxx bash scripts/release.sh
set -euo pipefail
cd "$(dirname "$0")/.."

TOKEN="${GITHUB_TOKEN:?set GITHUB_TOKEN}"
API="https://api.github.com/repos/amirlwf/anjam"
AUTH="Authorization: Bearer $TOKEN"
# api.github.com handshakes are flaky on this host — every call retries.
api() { curl -s --retry 6 --retry-all-errors --retry-delay 2 --max-time 30 "$@"; }
VER=$(node -p "require('./package.json').version")
TAG="v$VER"

PAYLOAD=$(cat <<JSON
{"tag_name":"$TAG","name":"Anjam $TAG","body":"## انجام — Anjam $TAG\\n\\nاپ To-Do حرفه‌ای با همگام‌سازی زنده Supabase بین ویندوز و اندروید (یک کدپایه‌ی TypeScript).\\n\\n**فایل‌ها:**\\n- \`Anjam-Setup-$VER.exe\` — نصب‌کننده ویندوز\\n- \`Anjam-Portable-$VER.exe\` — نسخه پورتبل بدون نصب\\n- \`Anjam-$VER.apk\` — اندروید (امضاشده، minSdk 22 / target 34)\\n\\n**تغییرات کامل این نسخه:** در \`README.md\` (بخش تاریخچهٔ نسخه‌ها).\\n\\n**راه‌اندازی سریع:**\\n1. در Supabase پروژه بساز و \`supabase/schema.sql\` را در SQL Editor اجرا کن (idempotent — اجرای دوباره برای ارتقا امن است).\\n2. Authentication → Providers → Email → «Confirm email» را خاموش کن.\\n3. اپ را باز کن → ⚙ تنظیمات → Project URL + anon key → Connect → با یک ایمیل روی هر دو دستگاه وارد شو.\\n\\nراهنمای کامل: \`docs/SUPABASE_SETUP.md\`"}
JSON
)

RID=$(api -H "$AUTH" "$API/releases" | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(next((r['id'] for r in d if r.get('tag_name') == '$TAG'), 0))
except Exception:
    print(0)
")
if [ "$RID" = "0" ] || [ -z "$RID" ]; then
  RID=$(printf '%s' "$PAYLOAD" | api -X POST -H "$AUTH" -H "Content-Type: application/json" --data-binary @- "$API/releases" | python -c "
import sys, json
try:
    print(json.load(sys.stdin).get('id') or 0)
except Exception:
    print(0)
")
fi
echo "RID=$RID (tag $TAG)"
[ "$RID" != "0" ] || { echo RELEASE_CREATE_FAILED; exit 1; }

# drop stale same-name assets so re-uploads are clean (never abort the script)
for id in $(api -H "$AUTH" "$API/releases/$RID/assets" | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    d = []
names = {'Anjam-Setup-$VER.exe', 'Anjam-Portable-$VER.exe', 'Anjam-$VER.apk'}
print(' '.join(str(a['id']) for a in d if a['name'] in names))
"); do
  curl -s -o /dev/null -w "deleted asset $id: %{http_code}\n" --retry 4 --retry-all-errors --retry-delay 2 --max-time 30 -X DELETE -H "$AUTH" "https://api.github.com/repos/amirlwf/anjam/releases/assets/$id" || echo "delete $id failed (ignored)"
done

up() {
  local name=$1 file=$2
  [ -f "$file" ] || { echo "  $name: MISSING FILE $file"; return 1; }
  curl -s --max-time 600 --retry 3 --retry-delay 3 -X POST -H "$AUTH" -H "Content-Type: application/octet-stream" \
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

up "Anjam-$VER.apk" "releases/Anjam-$VER.apk"
up "Anjam-Setup-$VER.exe" "release/Anjam-Setup-$VER.exe"
up "Anjam-Portable-$VER.exe" "release/Anjam-Portable-$VER.exe"
echo "RELEASE=https://github.com/amirlwf/anjam/releases/tag/$TAG"
