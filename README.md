# Eshels Baby App

[Open the app](https://rzagha1.github.io/willow-5f5f89e134ca/) · [Repository](https://github.com/rzagha1/willow-5f5f89e134ca)

A small baby tracker for your family. The phone app uses vanilla HTML, CSS, and JavaScript with no build step, external fonts, analytics, or runtime libraries. It saves locally first. Paired phones automatically exchange entries through your private Cloudflare Worker and D1 database.

## Connect both phones once

1. Open your **private family link** in Chrome on each phone, while online. Use the same link on both. Enter each parent's own name and the baby's name.
2. Check for **Connected · syncing automatically** on Home or in Settings.
3. Install from Chrome's menu. The label may be **Install app**, **Add to Home screen**, or an install option within **Install and create shortcut**. Keep using the installed app at the same address.
4. Settings → **Link another phone** shares or copies that same private link when needed. There is no daily sync button, file transfer, or code to copy.

The link contains a secret access key. Anyone with it can read and change your family's entries. Keep it within your family; never put it in the public repository, an issue, or a screenshot. The app removes it from the address bar after opening it and keeps it in local storage. Backups do not include it. A phone using only the ordinary public app URL needs the private link before automatic sync starts.

**Keep the existing app URL unchanged.** Renaming the repository or changing the domain creates a separate local store. Updating this release preserves the existing entries and preferences. Opening the family link uploads existing entries and merges them with the other phone's entries.

## Daily use

- **Sleep:** the dark sleep sheet follows `simlar.png`: lavender header, large elapsed time, orange Start/Stop Timer button, editable start/end times, notes, and Add Photo. Tap **Save** to save your edits and close. A running timer survives closing or restarting the app. **Manual entry** opens both date/time fields. Photos are resized and saved as JPEGs.
- **Feed:** breast left/right timers, bottle amount and unit, or solids with a note. Expand **Now** to log an earlier time.
- **Diaper:** Wet, Dirty, or Both saves immediately. Undo is available briefly. **Add details** lets you add a note or an earlier time.
- **Misc:** choose a quick label or enter your own.
- **Timeline:** tap an entry to edit or delete it. Sleep spanning midnight appears on each affected day; daily totals include only that day's duration.
- **Settings:** names, bottle unit, clock, theme, family connection, backups, and CSV export. Each phone keeps its own preferences.

## How automatic sync works

Every saved change also enters a durable local queue. When connected, changes are sent shortly after saving; the other phone checks for changes every five seconds while the app is visible. Both mobile data and Wi-Fi work, and the phones can use different networks. Sleep/feed timer starts and stops, notes, photos, and deletions all sync.

Offline changes remain saved and queued through reloads. Sync retries after connection failures, when internet returns, and when the app returns to the foreground. Browsers may suspend a background app or stop it completely; opening it again resumes syncing automatically. Continuous syncing while force-closed is not supported.

Each entry has a stable ID. Different entries merge without duplicates. Edits to the same entry use the later `updatedAt`; equal timestamps use a deterministic tie-breaker, preferring deletion when otherwise tied. If the server already has a different winning edit, the sending phone displays a conflict notice. Keep the phones' date and time set automatically. Deletion markers remain stored so older copies cannot bring entries back. Two parents can still independently start separate timers while offline; reconcile those separate entries in Timeline if needed.

## Backup and restore

**Download backup** saves events, photos, deletion markers, and preferences as JSON. Keep a copy somewhere separate from the phone. **Restore backup** validates the file before showing a confirmation. On a connected phone it merges entries into the family, keeping later edits/deletions, and restores preferences. On an unconnected phone it replaces local entries/preferences. Cancel changes nothing.

**Export CSV** provides spreadsheet-friendly event fields, UTC timestamps, and deletion flags. Photos are included in JSON backups, not CSV. CSV cannot be restored. Spreadsheet formula prefixes are neutralized. A reminder appears after seven days without requesting a backup or CSV export; check that the file actually reached Downloads.

Browser storage can be cleared by the user or operating system. IndexedDB is primary; localStorage is a fallback. A failed save reports an error. Synced entries remain on Cloudflare, but entries that have not yet synced need the original phone's local storage or a backup.

## Hosting files

Keep these files at the existing GitHub Pages repository root:

- `index.html`, `styles.css`, `app.js`, `event-data.js`
- `sync-config.js`, `sync.js`, `sw.js`, `manifest.json`
- `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`

`sync-config.js` contains only the public Worker address, never a key. The service worker caches the phone app for offline use and lets requests to this one sync endpoint go directly to the network. Private sync responses have `Cache-Control: no-store` and are never put in the app cache.

`cloudflare/worker.js`, `cloudflare/schema.sql`, and `cloudflare/wrangler.jsonc` are the backend source/configuration. The event validator is shared by the browser and Worker. `icon-maker.html` can regenerate the included icons. `tests/` and `artifacts/` are development files. `DELIVERY.md` contains the text source in labeled code blocks.

## Cloudflare setup and maintenance

Use the owner's free Cloudflare account. Authenticate Wrangler locally; no Cloudflare API token goes into the app. Create a D1 database named `eshels-baby`, put its ID in `cloudflare/wrangler.jsonc`, and apply `cloudflare/schema.sql`. Set the Worker secret `FAMILY_KEY_HASH` to the SHA-256 hex digest of a cryptographically random 32-byte, base64url-encoded family key. Save the original key privately, outside the repository. The Worker refuses requests until this secret is configured.

Deploy with `npm run deploy --prefix cloudflare`, then set `SYNC_URL` in `sync-config.js` to the deployed HTTPS Worker origin. `APP_ORIGIN` restricts browser access to `https://rzagha1.github.io`. The private invitation is the unchanged app URL followed by `#family=` and the original key. Never publish this full invitation in source files or delivery archives.

Authenticated requests validate every event and apply writes/reads in one D1 transaction. Changes are paginated in batches of four. Unknown credentials, disallowed browser origins, malformed input, and oversized requests are rejected. Only the hash of the family key is stored on the Worker; event data is stored in D1. Connections use HTTPS. This is access-controlled cloud storage, **not end-to-end encryption**: the Cloudflare account owner can administer/read the database. There are no public event endpoints.

To revoke a leaked family link, generate a new key, replace the Worker secret hash, and open the new invitation on each authorized phone. Existing events remain in D1. Do not delete the database or change the secret casually. Cloudflare free-plan limits can interrupt syncing if exceeded; local saving and retries continue. Keep backups, especially when attaching many photos.

References: [D1 prepared statements and transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).

## Ship an app update

1. Run the relevant checks below. Update `VERSION` in `app.js` and `CACHE_VERSION` in `sw.js` together.
2. Upload the changed hosting files and `sw.js` to the existing repository's `main` branch. GitHub Pages stays set to `main` / root. Never upload baby data, family keys, OAuth credentials, or `.dev.vars`.
3. After Pages publishes, open the installed app online and tap **Update available, tap to refresh**. The app reloads; local entries, preferences, pairing, and queued changes remain.

The first automatic-sync release is **1.1.0**, upgrading the original offline release **1.0.0** without changing the URL or local database name. Backend changes deploy separately with Wrangler.

## Test locally

```sh
python3 -m http.server 8765 --bind 127.0.0.1
node tests/browser.cjs
node tests/edge-cases.cjs
npm ci --prefix cloudflare
node tests/automatic-sync.cjs
```

Open `http://127.0.0.1:8765/`. The browser tests use an already installed Playwright. The automatic-sync test creates a disposable local D1 database, starts Wrangler's actual Worker runtime, serves an isolated copy of the app, and links two independent browser stores using a test-only key. It never uses the production family/database. These are development tools; the phone app has no Node/npm requirement.

Checks cover all logging types; sleep timer/edit/photo controls; themes; responsive sheets and large text; Back/Escape/focus behavior; backup/CSV/restore; legacy import validation; midnight/DST; offline reload; service-worker updates retaining data; storage fallback/failures; automatic two-phone updates; offline queue replay; simultaneous edits; deletions; pagination; request retries; authentication and CORS. Screenshots are in `artifacts/`.

## Physical phone checks

- Open the private link on both phones and install the app. Confirm the connected status.
- Leave one phone on mobile data and the other on Wi-Fi. Start a sleep on one, then stop it on the other.
- Add/edit notes and a photo, and delete an entry. Confirm both phones agree within a few seconds.
- Use airplane mode to log entries, close/reopen the app, then reconnect. Confirm automatic merging.
- Check native installation/sharing, TalkBack, vibration, large system text, and a force-close/reopen while a timer runs.

These physical Android checks cannot be fully reproduced by the desktop browser tests.

## Limits

One baby/family; no notifications, reminders beyond backups, account-management UI, or medical advice. A left/right feed counts as a separate feed. Wet+dirty counts in both totals. Overlapping sleep entries add together. UTC timestamps display in each phone's timezone.

Inputs cap names at 60 characters, labels at 80, notes at 2,000, and bottle amounts at 10,000. Photos accept image files up to 15 MB, resize to at most 900 pixels on the longest side, and must compress to at most 250,000 characters. JSON imports cap at 10 MB / 25,000 events. Large photo histories may exceed the backup import limit; keep backup sizes below 10 MB until a streaming backup format is added.
