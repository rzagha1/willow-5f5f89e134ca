# Eshels Baby App

[Open the app](https://rzagha1.github.io/willow-5f5f89e134ca/) · [Repository](https://github.com/rzagha1/willow-5f5f89e134ca)

A calm, mobile-first baby tracker for two parents. Vanilla HTML, CSS, and JavaScript; no build, accounts, backend, analytics, external fonts, or runtime dependencies. All entries stay on the phone until you export or share them.

## Files

Upload these eight files to the repository root:

- `index.html`, `styles.css`, `app.js`, `manifest.json`, `sw.js`
- `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`

The three PNGs are included and can also be regenerated using `icon-maker.html`. Keep that helper locally; do not upload it. `tests/`, `artifacts/`, and this guide are development/delivery files, not required for hosting. `DELIVERY.md` contains the complete source in separately labeled code blocks.

## Set up GitHub Pages — no git commands

1. Sign in to **github.com**. Click the **+** menu at the top right, then **New repository**.
2. Give it a plain, non-guessable name such as `willow-7b9c2e84`. Select **Public**, check **Add a README file** to create the `main` branch, and click **Create repository**. A random name is not access control; the app code is public. Never upload baby data or backups to this repository.
3. On your computer, double-click the local `icon-maker.html`. Click each of the three **Download** buttons. If your browser asks to allow multiple downloads, allow them. Check that the names match the three icon filenames above exactly, without a `(1)` suffix.
4. Open the repository's **Code** tab. Click **Add file → Upload files**. Drag in all eight hosting files listed above, including your three PNG downloads. Do not include `icon-maker.html`. Scroll down and click **Commit changes**, choosing the `main` branch.
5. Open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**. Set the branch to **main** and folder to **/(root)**, then click **Save**. [GitHub's publishing instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
6. Wait about a minute, then refresh the Pages settings. Publishing can take up to ten minutes. Open the displayed `https://<username>.github.io/<repo-name>/` address. [GitHub Pages quickstart](https://docs.github.com/en/pages/quickstart).
7. On **each Android phone**, open that exact HTTPS address in Chrome while online. Enter that parent's name and the same baby's name. In the Chrome menu, choose **Install app** (some versions show **Add to Home screen → Install**).
8. Open the installed app once while online. Wait for **Saved on this phone · ready offline** on Home. Close it, turn on airplane mode, and launch it again. Log an entry and reopen to check that it remains saved.

**Keep the URL unchanged.** Each phone's data is tied to the exact app URL. Never rename the repository or change the GitHub username after logging starts. Do not clear Chrome site data or uninstall without first downloading a JSON backup. A backup on the same phone can still be lost with the phone; keep a copy elsewhere.

## Daily use

- **Sleep:** start a timer or choose **Manual entry** to set its start and end. Running timers survive closing the app. Stop from Home or the edit sheet.
- **Feed:** choose Breast and a side, Bottle and an amount, or Solids and a note. Each breast side has its own timer. A time labeled **Now** can be expanded to set an earlier date and time.
- **Diaper:** tap Wet, Dirty, or Both to save immediately. Undo is available for five seconds. Tap **Add details** first if you want a note or earlier time.
- **Misc:** choose a quick label or write your own. Notes are optional.
- **Timeline:** tap any entry to edit it. Delete asks for confirmation. Sleep crossing midnight appears on each affected day, with only that day's portion counted in its total.
- **Settings:** save names, bottle units, clock style, and appearance. Auto follows the phone's theme.

## Share between phones

Both phones hold independent copies. Sync after either parent makes changes, preferably before starting another timer.

**File:** in Settings choose **Send sync file**. Select Messages, WhatsApp, email, or another share destination. If file sharing is unsupported, the file downloads; send that file yourself. On the other phone, save the attachment and select **Import sync file**. Repeat in the other direction to bring both phones up to date.

**Code:** choose **Copy sync code**, send the copied text, then use **Paste sync code → Import code** on the other phone. If clipboard permission is unavailable, the app displays selectable text. Codes use gzip where supported and accept an uncompressed format too. Share files are a better fit for a large history.

Imports match event IDs and keep the later `updatedAt`. Reimporting identical data adds no duplicates. Deletions are stored as tombstones and shared, so an older file cannot resurrect a deleted entry. The result reports added, updated, unchanged, and deleted counts. These categories are mutually exclusive. Exact timestamp ties keep the local record. Keep both phones' system clocks set automatically.

Sync includes events and deletion markers, not the other phone's preferences. Sending is manual: no background communication occurs. Sync files and codes are not encrypted; only share them with someone you trust. The app itself makes no requests to a third party. Your chosen sharing app may use the network.

## Backup, restore, and CSV

**Download backup** exports all events, tombstones, and settings. **Restore backup** validates the entire file before asking to replace all local entries and preferences, including the device name. Cancel leaves everything untouched. Make a fresh backup before replacing data.

CSV includes all event fields, including UTC timestamps and the deletion flag. It is for reading in a spreadsheet and cannot be restored. Fields are quoted and spreadsheet formula prefixes are neutralized. Backup/export filenames begin with `eshels-baby-` and include the local date.

A reminder appears after seven days without a backup or CSV export; for a new installation, the seven days begin at first launch. A download records that you requested an export; check that the file reached your Downloads folder.

## Ship an update

1. Change the required file(s). Change `CACHE_VERSION` near the top of `sw.js` to a new value, for example `1.0.1`. Keep `VERSION` in `app.js` aligned when releasing.
2. On github.com, open the repository's **Code** tab, then **Add file → Upload files**. Upload the changed files **and `sw.js`** and commit to `main`. Do not rename the repo.
3. Wait for Pages to finish publishing. Open the app online. Chrome checks for a new service worker; if necessary close and reopen the app later.
4. Tap **Update available, tap to refresh**. The new worker activates and reloads the app. Your IndexedDB entries remain intact.

All app resources come from the installation cache; unknown requests are rejected instead of fetched. Chrome's own service-worker update checks, and precaching a new release, necessarily use the network while online. This is the browser lifecycle exception needed to support the requested update flow. The app has no runtime data fetches. [Service-worker lifecycle reference](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## Test locally

From this directory, run:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://localhost:8765/` in desktop Chrome. The app's main page must use localhost or HTTPS; double-clicking `index.html` does not provide the secure context required for service workers. Only the icon maker is intended to run by double-clicking.

Open **Chrome DevTools → Application**:

- **Manifest:** verify the app name, three icons, relative start URL and scope, and no errors.
- **Service Workers:** wait for the worker to activate. Leave **Update on reload** unchecked when testing the normal update toast.
- **Cache storage:** confirm all eight paths (root plus index, CSS, JS, manifest, and three icons) are cached.
- **IndexedDB:** expand the app's path-specific database, then `data`; the `state` record stores events and settings.
- **Network:** choose **Offline**, reload both `/` and `/index.html`, and log an entry. Reopen to confirm persistence. Switch back to **No throttling** afterward.
- **Console:** check for unexpected errors. Use the device toolbar at 320–480px width, portrait and landscape.

The optional `tests/browser.cjs` and `tests/edge-cases.cjs` run browser assertions using an already available Playwright installation (`node tests/browser.cjs` with the server running; `node tests/edge-cases.cjs` starts its own temporary server). It is development-only; the hosted app needs no Node, npm, build step, or library.

## Verification performed

Automated Chromium checks passed for onboarding; all four event categories and feeding modes; edit, delete, and Undo; timer persistence; history Back, Escape, backdrop, and focus trapping; theme changes; CSV and JSON downloads; restore and cancellation; two independent browser stores syncing; duplicate imports and tombstones; gzip and plain codes; malformed inputs; midnight and daylight-saving boundaries; offline logging and reload; GitHub Pages-style nested paths; real service-worker update activation; storage fallback and failures; and layouts from 320px through landscape, including 200% text. Screenshots are in `artifacts/`.

Physical Android installation, TalkBack, vibration, force-stop behavior, and the native Android share sheet still need the device checklist below. Published on GitHub Pages: https://rzagha1.github.io/willow-5f5f89e134ca/

## Acceptance checklist on the two Android phones

- [ ] Install and open on both phones; enter distinct parent names.
- [ ] Log a sleep, bottle, left/right breast feed, solids, diaper, and miscellaneous event.
- [ ] Add notes and adjust event times; edit an existing entry.
- [ ] Start sleep, force-close, reopen, and confirm elapsed time continued; stop it.
- [ ] Turn on airplane mode, reopen, log entries, and reopen again.
- [ ] Sync A to B and B to A using a file; repeat using a code.
- [ ] Import the same file twice and confirm no duplicate entries.
- [ ] Edit the same event on both phones at different times; confirm the later edit wins after sync.
- [ ] Delete on one phone, sync, and confirm the entry disappears on the other. Reimport an older file and confirm it stays deleted.
- [ ] Import malformed JSON, an invalid timestamp, an unknown category, and an overlong note; confirm safe rejection with existing data unchanged.
- [ ] Download a backup, make a change, restore, and verify both entries and preferences. Cancel a restore once and verify nothing changes.
- [ ] Export CSV and inspect it; copy a code and use native file sharing.
- [ ] Check Light, Dark, and Auto, including changing the phone theme with Auto selected.
- [ ] Enter a sleep from yesterday 23:30 to today 01:30; verify 30 minutes yesterday and 90 minutes today.
- [ ] Press Android Back and tap the backdrop to close sheets. Check large system text, TalkBack labels, keyboard focus, and reduced motion.
- [ ] Publish an update, accept its toast, and confirm entries survive.

## Troubleshooting

1. **Install option missing:** use current Chrome on Android, the exact HTTPS Pages URL, and a regular browsing profile. Wait for Pages to finish. Check that all three icon URLs load and DevTools shows a valid manifest and activated service worker. If already installed, launch from the home screen.
2. **Old version after an update:** confirm `CACHE_VERSION` changed and the new `sw.js` was uploaded. Wait for Pages to publish, open online, and tap the update toast when Chrome detects it. For desktop development, click **Update** in Application → Service Workers. Avoid clearing site data to force an update.
3. **Blank screen after install:** open the same URL online. Verify that `app.js`, `styles.css`, and the icons were uploaded with exact case and filenames. Check the console. Fix missing files, bump the cache version, and reopen. Do not delete the IndexedDB data as a troubleshooting step.
4. **Share sheet not opening:** invoke sharing with a direct button tap in Chrome. Native file sharing depends on browser support and permission; the app falls back to a download. Send that downloaded file manually or use Copy sync code. Cancelling a share is harmless. [Web Share API requirements](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share).
5. **Data missing after a URL change:** return to the original exact URL and Chrome profile on that phone; export a backup there. Open the new address, restore the backup, and check the device name. Different phones, profiles, domains, ports, and repository paths have separate stores. If the old site data was erased and there is no backup or other parent's copy, the app cannot recover it.

## Assumptions and deliberate limits

- One baby per installation; two parents sync manually. There is no server, login, automatic sync, cloud backup, notification, medical advice, or added tracking category.
- A feed count is one logged feed entry, so left and right timers count separately. Wet+dirty counts once in each diaper total. Overlapping sleep records sum their durations; reconcile accidentally duplicated manual records in Timeline.
- Stored timestamps are UTC; presentation and calendar-day totals use the phone's timezone. A running timer has no end time and survives app closure. Starting the same timer side twice on one phone is prevented; independently started timers on different phones retain their separate IDs after sync.
- IndexedDB is primary. localStorage is only the fallback if IndexedDB cannot be opened. Storage failure is shown rather than silently reporting a successful save. Browser persistence is a request, not a guarantee; the warning stays visible if Chrome does not grant it.
- Imports are limited to 10 MB / 25,000 events. Names are capped at 60 characters, labels at 80, notes at 2,000, and bottle amounts at 10,000. Malformed input is rejected atomically.
- Secondary text is slightly darker than the suggested light muted color to meet 4.5:1 contrast. The requested pastel category colors, system fonts, original SVG icons, and soft dark theme are retained.
- Desktop is only a centered phone column. The app does not add iOS-specific behavior.

Three possible next improvements, **not implemented**: optional feed reminders; an explicit conflict-review screen for simultaneous edits; encrypted share files.
