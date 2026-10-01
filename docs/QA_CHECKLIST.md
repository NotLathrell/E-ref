# E-REF quality assurance checklist

A tester ticks each box after checking it on the build under test. **Auto** items are covered by a
script, so run the script and read the result. **Manual** items need a person and a phone.
The requirements checklist (`REQUIREMENTS_CHECKLIST.md`) says what was built; this one says how to
verify that it works.

**Build under test:** ______________  **Tester:** ______________  **Date:** ______________
**Phone (model / Android version):** ______________  **Server:** ☐ local  ☐ Cloudflare tunnel

---

## 0. Before you start

- [ ] Backend starts with no errors and `GET /health` returns `"ready": true` with no `loadErrors`
- [ ] `EREF_DEV_RETURN_CODE` is **not** set on the server (it exposes reset codes)
- [ ] The APK installs over the previous version and keeps the login (same signing key, higher `versionCode`)
- [ ] The phone can open `<server address>/health` in its browser
- [ ] Note the backend version reported by the server: ______________

## 1. Automated checks (run first; all must pass)

| Check | Command | Covers | Pass |
| --- | --- | --- | --- |
| Backend tests (66) | `python -m pytest backend/tests` | Accounts, admin, detection, inventory, scanning, non-functional | ☐ |
| Mobile tests | `cd mobile && npm test` (server running) | Smoke, features, dark mode, context and sync | ☐ |
| Detector evaluation | `python backend/evaluate_detector.py` | Detector precision, recall, mAP | ☐ |
| Confidence calibration | `python backend/calibrate.py` | Threshold behaviour on held-out photos | ☐ |

## 2. Account and access

| # | Check | Type | Pass |
| --- | --- | --- | --- |
| 2.1 | Sign up with a valid name, email and password of 8+ characters | Manual | ☐ |
| 2.2 | Sign up rejects: empty name, bad email, password under 8 characters, mismatched confirmation | Auto/Manual | ☐ |
| 2.3 | Signing up with an email already in use is refused with a clear message | Auto | ☐ |
| 2.4 | Sign in works; a wrong password shows an error and does not reveal whether the email exists | Auto/Manual | ☐ |
| 2.5 | Closing and reopening the app keeps you signed in | Manual | ☐ |
| 2.6 | An expired or tampered session sends you back to sign in | Auto | ☐ |
| 2.7 | Forgot password: code is sent by email, a wrong code is refused, 5 wrong tries lock it, the code expires after 15 minutes | Auto/Manual | ☐ |
| 2.8 | New password can be set after verification, and the old one no longer works | Manual | ☐ |
| 2.9 | Sign out returns to the sign-in screen | Manual | ☐ |
| 2.10 | Two accounts on one phone never see each other's items | Auto | ☐ |
| 2.11 | On the sign-in screen, **Set server address** accepts a tunnel address and the next request goes to it | Manual | ☐ |

## 3. Scanning and detection

| # | Check | Type | Pass |
| --- | --- | --- | --- |
| 3.1 | Camera permission is requested; denying it shows a usable message, not a crash | Manual | ☐ |
| 3.2 | Take a photo of a fresh food from the supported list: the correct food and **Fresh** (70-100%) are returned | Manual | ☐ |
| 3.3 | Same for a visibly rotten food: **Rotten** (0-29%) is returned | Manual | ☐ |
| 3.3b | A partly spoiled or ageing food lands in the **Sub Fresh** (30-69%) middle band, not forced to Fresh or Rotten | Manual | ☐ |
| 3.4 | A photo picked from the gallery works the same as a camera photo | Manual | ☐ |
| 3.5 | A photo with several foods gives one box and result per food, each with its own Fresh / Sub Fresh / Rotten reading | Manual | ☐ |
| 3.6 | A photo of a non-food object or an unsupported food is not confidently named; the app asks for confirmation | Manual | ☐ |
| 3.7 | Low-confidence results (identity under 60%, or freshness under 65%) show the "please confirm" step | Auto | ☐ |
| 3.7b | The freshness tier shown always matches the freshness percent (≥70% Fresh, 30-69% Sub Fresh, <30% Rotten) | Auto | ☐ |
| 3.8 | A rotated phone photo is analysed upright (EXIF handling) | Auto | ☐ |
| 3.9 | Corrupt, empty, or wrong-type upload returns a clear error, not a crash | Auto | ☐ |
| 3.10 | With the server off, the app says it could not reach the server and shows the address it tried | Manual | ☐ |
| 3.11 | Scan result screen is readable in light and dark mode | Manual | ☐ |

## 4. Expiry date reading (OCR)

| # | Check | Type | Pass |
| --- | --- | --- | --- |
| 4.1 | A clear label photo with "EXP 12/05/2026" style text is read correctly | Manual | ☐ |
| 4.2 | Different formats are understood (DD/MM/YYYY, MM/YYYY, "Best before …") | Auto | ☐ |
| 4.3 | An unreadable label falls back to the estimated shelf life instead of failing | Manual | ☐ |
| 4.4 | The date can be edited by hand before saving | Manual | ☐ |

## 5. Inventory (Shelf)

| # | Check | Type | Pass |
| --- | --- | --- | --- |
| 5.1 | A scanned item is saved with food, freshness, expiry, storage and status | Manual | ☐ |
| 5.2 | **Add food by hand** works and validates required fields | Manual | ☐ |
| 5.3 | Edit an item's name, date, storage and quantity | Manual | ☐ |
| 5.4 | Mark used, mark thrown away, restore, and delete each update the list and History | Auto/Manual | ☐ |
| 5.5 | Moving to the fridge or freezer changes the estimated remaining days sensibly | Auto | ☐ |
| 5.6 | Search and category filters return the right items and can be cleared | Manual | ☐ |
| 5.7 | Items added with no connection are kept and sent when the connection returns | Auto | ☐ |
| 5.8 | Signing in on a second phone shows the same items | Manual | ☐ |
| 5.9 | 50+ items scroll smoothly | Manual | ☐ |

## 6. Prioritisation, alerts and history

| # | Check | Type | Pass |
| --- | --- | --- | --- |
| 6.1 | **Use First** lists the highest-risk item first; ties go to fewer days left, then name | Auto | ☐ |
| 6.2 | Used and discarded items do not appear in the priority list | Auto | ☐ |
| 6.3 | Home totals, soon-to-spoil count and category breakdown match the Shelf | Manual | ☐ |
| 6.4 | Alerts screen lists at-risk items with the right urgency label | Manual | ☐ |
| 6.5 | Notification permission is requested; a local notification arrives for an item nearing expiry | Manual | ☐ |
| 6.6 | Turning alerts off stops notifications | Manual | ☐ |
| 6.7 | History shows every scan, move, use and discard in order | Auto/Manual | ☐ |

## 7. Recipe recommendations

| # | Check | Type | Pass |
| --- | --- | --- | --- |
| 7.1 | With items on the shelf, recipes that use the most urgent items rank highest | Auto | ☐ |
| 7.2 | Empty shelf shows an "add food first" message, not an error | Auto | ☐ |
| 7.3 | Cooking or saving a recipe changes later recommendations; viewing changes them less | Auto | ☐ |
| 7.4 | Dismissed recipes and avoided ingredients stay out | Auto | ☐ |
| 7.5 | Recipe detail shows ingredients and which ones you already have | Manual | ☐ |

## 8. Admin

| # | Check | Type | Pass |
| --- | --- | --- | --- |
| 8.1 | The Admin row appears in Profile **only** for admins | Auto/Manual | ☐ |
| 8.2 | A non-admin who calls an admin endpoint is refused (403) | Auto | ☐ |
| 8.3 | Admin can add, edit and remove a food, and the change reaches another phone after a refresh | Manual | ☐ |
| 8.4 | Invalid food values (negative shelf life, empty name) are rejected | Auto | ☐ |
| 8.5 | Admin sees all accounts (no password data) and can promote or demote; the last admin cannot be removed | Auto/Manual | ☐ |

## 9. Model quality (measured, not opinion)

| Measure | Target | Last result | Pass |
| --- | --- | --- | --- |
| Detector mAP@0.5 | ≥ 90% | 97.4% | ☐ |
| Detector precision / recall | ≥ 90% | 96.2% / 94.4% | ☐ |
| Exact object count on composed frames | ≥ 95% | 99.7% | ☐ |
| Real photos: food found / right label | ≥ 90% | 99.7% / 95.3% | ☐ |
| Identity accepted at 0.90 threshold, known foods | ≥ 95% | 98.6% | ☐ |
| Unseen food wrongly named at 0.90 threshold | as low as possible | 30% (known weakness) | ☐ |
| Plain-background photos | note the result | weak (about 50–59% accuracy) | ☐ |
| `POST /predict` latency, local | under 1 s | mean 70 ms, p95 73 ms | ☐ |
| `POST /ocr` latency, local | under 2 s | about 0.4–0.5 s | ☐ |

Also do a **field test**: photograph at least 10 real items per supported food in kitchen light
and record how many are labelled correctly: ______ / ______.

## 10. Security and privacy

| # | Check | Type | Pass |
| --- | --- | --- | --- |
| 10.1 | Passwords are stored hashed (scrypt), never in plain text | Auto | ☐ |
| 10.2 | Every inventory and admin endpoint refuses a request with no or an invalid token | Auto | ☐ |
| 10.3 | Login takes about the same time for existing and unknown emails | Auto | ☐ |
| 10.4 | `backend/data/` (database and `secret.key`) is not committed | Manual | ☐ |
| 10.5 | No secrets in the repo or in the APK (SMTP password, `EREF_SECRET`) | Manual | ☐ |
| 10.6 | Public server is reached over HTTPS (the tunnel address), not plain HTTP | Manual | ☐ |
| 10.7 | Oversized or malformed input never causes a server error (`TC-NF-SEC-02`) | Auto | ☐ |
| 10.8 | Test accounts (Smoke Tester, Context Tester, and similar) are removed before real users join | Manual | ☐ |

## 11. Performance and reliability

| # | Check | Type | Pass |
| --- | --- | --- | --- |
| 11.1 | Cold start of the app to a usable screen: under 5 s on the test phone | Manual | ☐ |
| 11.2 | A full scan (photo to result) over the tunnel: under 5 s | Manual | ☐ |
| 11.3 | 10 scans in a row, no crash, no slowdown | Manual | ☐ |
| 11.4 | Server survives a restart with all accounts and items intact | Manual | ☐ |
| 11.5 | Server memory stays stable after 100 requests | Manual | ☐ |
| 11.6 | Losing and regaining the connection mid-scan gives an error, then recovers | Manual | ☐ |

## 12. Compatibility and appearance

| # | Check | Type | Pass |
| --- | --- | --- | --- |
| 12.1 | Runs on at least two different Android phones and two Android versions | Manual | ☐ |
| 12.2 | Small screen (about 5") and large screen (about 6.7"): nothing cut off or overlapping | Manual | ☐ |
| 12.3 | Light and dark mode both readable; text contrast is adequate | Auto/Manual | ☐ |
| 12.4 | Follows the phone's dark-mode setting and the in-app appearance setting | Manual | ☐ |
| 12.5 | Portrait rotation lock and rotating the phone do not break screens | Manual | ☐ |
| 12.6 | Keyboard never hides an input field on sign-in, sign-up, or edit screens | Manual | ☐ |
| 12.7 | Larger system font size does not clip labels or buttons | Manual | ☐ |
| 12.8 | App icon and splash screen display correctly | Manual | ☐ |

## 13. Release gate

Do not hand the APK to other people until every line is ticked.

- [ ] Section 1 all pass
- [ ] Every **Manual** item in sections 2–8 and 10–12 passed on a physical phone
- [ ] Section 9 targets met, and the known weaknesses are stated where the results are reported
- [ ] Server runs on the tunnel with `start-public.ps1`, and a second person on a **different network** can sign up, scan, and see their own data
- [ ] Version number and version code raised, APK rebuilt and signed
- [ ] Test data removed; at least one real admin account exists

## Known limits to state, not hide

- Scanning needs the server to be on and reachable. The free tunnel address changes each time the server restarts.
- The detector was trained on composed frames, so localisation on cluttered real-world photos is not measured. Foods outside the 12 supported ones can still be named wrongly (30% at the 0.90 threshold).
- Notifications, camera, and the APK were not yet verified on a physical phone when this list was written.
- The signature on the current APK is the debug key, so it should not be published on an app store.
- The recommender weights (0.5 / 0.3 / 0.2) were set by hand, not learned.
- Models were trained on a CPU-only laptop, so they are small and lightly trained.

## Defects log

| # | Section / item | What happened | Severity (high / medium / low) | Status |
| --- | --- | --- | --- | --- |
| | | | | |
