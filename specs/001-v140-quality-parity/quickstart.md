# Quickstart: verifying Anjam v1.4.0

All commands run from the repo root (`anjam/anjam`) in Git Bash on Windows.

## 0. Quality gates (always)

```bash
npm run build                                   # tsc --noEmit && vite build
python scripts/sql-lint.py supabase/schema.sql  # must print PARSE_OK
```

## 1. Preview + CDP QA harness

```bash
npx vite preview --port 4173 --strictPort --host 127.0.0.1   # background
powershell -NoProfile -Command "Get-CimInstance Win32_Process |
  Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*qa-profile*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
cmd /c start "" "C:/Program Files/Google/Chrome/Application/chrome.exe" \
  --remote-debugging-port=9333 \
  --user-data-dir="C:/Users/My Sweet/AppData/Local/hermes/cache/scratch/chrome-qa-profile14" \
  --no-first-run --disable-extensions --disable-gpu \
  --disable-features=CalculateNativeWinOcclusion \
  --disable-backgrounding-occluded-windows --disable-renderer-backgrounding \
  --disable-background-timer-throttling --app=http://127.0.0.1:4173
node scripts/cdp-ux-check.mjs --port 9333 > release/qa/qa-v140.log 2>&1
grep UX_QA_SUMMARY release/qa/qa-v140.log    # expect failed:[]
```

The harness seeds and clears app data at boot, so it is idempotent.

## 2. Manual checks per story

### US1 — Android scroll / FAB / overflow (P1)

1. Preview on `http://127.0.0.1:4173`, Chrome devtools device toolbar at
   **360 × 740**, touch emulation on.
2. Visit every view: Today, Upcoming, All, Completed, Priorities, Inbox, each
   project, each label, Routine, Important days, Study, Workout.
3. For each: swipe the content area once, confirm it reaches the bottom.
4. Tap **+** on every view — the composer must focus/open and a task must be
   creatable with Enter.
5. Console assertion: `document.scrollingElement.scrollWidth <= innerWidth`
   (and `[...document.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX === 'visible')` is empty).

### US2 — night advisory (P1)

1. Settings → confirm the advisory is on.
2. Devtools console:

```js
// force each rule (QA hook)
__advisoryEval({ now:new Date(), temp:22, lo:4, nextTemp:6, code:3,
  upcomingCodes:[95], precipitationHours:2, precipitationPeak:80,
  windPeak:12, tempDrop:0, aqi:null }, new Date('2026-09-25T22:10:00'), 'fa')
// => { shown:true, ruleId:'storm', ... } and a popup appears
```

3. Clear sky context → `{ shown:false }` and no popup.
4. Same rule twice in one day → second call returns `shown:false`.
5. Call with a noon `now` → `shown:false` regardless of the forecast.
6. Same sequence with `'en'` and confirm the English copy reads naturally.

### US3 — period timetable (P1)

1. Study → Timetable: no `type="time"` input exists anywhere.
2. Set شنبه to 6 periods, یکشنبه to 5 — column counts change immediately.
3. Assign subjects to cells, reload, confirm persistence.
4. With a v1.3 backup (times present) imported: cells are filled in time order,
   nothing is lost, `period` is set on every row.

### US4 — themes / logo / motion (P2)

1. Settings → Themes: 6 themes + "Variable (weather)".
2. For each theme, switch light → dark and check every surface; no unreadable
   text, no stray hex colour outside the token block.
3. Enable Variable, force weather (rain / snow / clear) and watch the palette
   cross-fade; `document.documentElement.dataset.weatherTheme` reflects it.
4. Check the logo ≥ 48 px in sidebar, drawer, auth, setup, boot and alarm.
5. Enable reduced motion (devtools) → all animations stop.

### US5 — backup / restore (P2)

```bash
node scripts/backup-roundtrip-check.mjs   # export → wipe → import → diff
```

Must print `BACKUP_ROUNDTRIP_OK` (row counts + prefs identical).
Manual: export on desktop (downloads a file); export on Android (share/clipboard
fallback); import a corrupt file → error shown, nothing overwritten.

### US6 — school news (P3)

```js
regionFromLocation('کرج', null)      // => key 'alborz'
regionFromLocation('كرج', null)      // => key 'alborz'  (Arabic/Persian yeh fold)
regionFromLocation('شیراز', null)    // => key 'shiraz'
matchClosure(sampleItems, region)    // closure headline only
pendingAlert(items, new Date('2026-09-25T21:00:00'))  // one alert or null
```

Block the network (devtools offline) → no error popup, no alert.

## 3. Release

```bash
npx cap sync android && node scripts/patch-capacitor-mirrors.js
export JAVA_HOME="C:/Users/My Sweet/toolchain/jdk17.0.20_10" ANDROID_HOME="C:/Users/My Sweet/android-sdk"
(cd android && ./gradlew assembleRelease)
BT="C:/Users/My Sweet/android-sdk/build-tools/34.0.0"
"$BT/apksigner.bat" sign --ks release.keystore --ks-pass pass:anjam2026 \
  --key-pass pass:anjam2026 --out releases/Anjam-1.4.0.apk \
  android/app/build/outputs/apk/release/app-release-unsigned.apk
npx electron-builder --win
git add -A && git -c user.name=amirlwf -c user.email=amirlwff@gmail.com commit -m "feat: …"
git -c http.sslBackend=openssl -c http.version=HTTP/1.1 push origin main
```
