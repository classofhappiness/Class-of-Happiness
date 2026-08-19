# CLASS OF HAPPINESS — ARCHITECTURAL REVIEW FINDINGS & FIX PLAN
**Date: 18 August 2026 · Read-only review per COH-HANDOVER.md Section 10 · Verified against real source files, live Supabase data, and the live website**

Every finding below was checked against actual code (file:line), live Supabase queries (via the service key in `backend/.env`), and — for the website — a live `curl` of classofhappiness.com, not against COH-HANDOVER.md's claims or stale local file copies. Several handover claims turned out to be stale, incomplete, or backwards; those are flagged explicitly.

Items are grouped **LAUNCH-BLOCKING** (must be true before real money/real school data is on the line) → **LAUNCH-ACCEPTABLE** (real, evidenced problems that don't block launch — ship and fix soon) → **POST-LAUNCH** (explicitly deferred by Jono). Within each group, items still map back to the original review's Section 6 (Admin Sync) / Section 7 (Fundamental Issues) framing, noted in each heading. Execute one item at a time with Sonnet.

---

## VERIFICATION GAP — READ THIS FIRST

`portal.html` and the legacy `admin.html` are **not in the git repo** — hand-uploaded to Namecheap/cPanel, and no local copy could be confirmed as exactly what's live. This review used the most-recently-modified local scratch copies as the best available proxy:
- Portal: `/Users/jono/Desktop/portal100.html` (Aug 18 08:38 — same day as this review, plausibly current)
- Legacy admin: `/Users/jono/Downloads/coh_admin-2.html` (Aug 4 08:32 — 2 weeks stale relative to portal)

The marketing site **was** checked live via `curl https://classofhappiness.com`, and that check proved the risk exactly: two findings from the stale local copy (Jul 30) turned out to already be fixed live. **Before executing any portal.html/admin.html fix in this plan, pull the actual live file from cPanel first** — the same gap almost certainly applies there too.

---

# LAUNCH-BLOCKING

### L1. [SECURITY] Hardcoded superadmin bypass code shipped in the app bundle *(Section 6 #1)* — ✅ DONE 2026-08-18
**File:** `frontend/app/admin/dashboard.tsx:1123-1141`

The in-app admin unlock screen calls `POST /admin/verify` to check the real session's role (correct, fixed Aug 14 — `backend/server.py:7031`). But the `catch` block still contains a **client-side fallback**:
```
} catch {
  if (adminCode === 'COH_SUPER_2026') { setUnlocked(true); setIsSuperAdmin(true); }
  else if (adminCode.length === 6) { setUnlocked(true); setIsSuperAdmin(false); }
  else { Alert.alert('Invalid code'); }
}
```
This fires on ANY network failure (Railway cold start, transient timeout, offline device) — not just a missing endpoint. The hardcoded string `COH_SUPER_2026` is sitting in the shipped JS bundle and grants full superadmin unlock with zero server validation; **any 6-character string** grants school_admin-level unlock. Once unlocked, `isSuperAdmin` is a plain local `useState` boolean (`:1100`) never re-verified for the component's lifetime. Entry to this screen is role-gated upstream (`frontend/app/settings.tsx:530-533` only shows "Admin Dashboard" to `admin`/`superadmin`/`school_admin`), so it isn't reachable by a random teacher/parent — but it's reachable by exactly the population (school admins) for whom this wrongly grants a higher privilege tier than they should ever get client-side.

**Fix:** delete the entire `catch` fallback block. If `/admin/verify` fails, show a retry/error state — never grant access client-side.

**What was actually done:**
1. **Verified the real path first**, as required before touching this: logged in live against production (`https://class-of-happiness-production.up.railway.app`) as `jono@classofhappiness.com` with PIN `COH2026JONO` — confirmed `role: superadmin` and a valid session token. Called `POST /admin/verify` with that real session token and got `{valid: true, is_super_admin: true}` back — the primary, server-checked path works correctly and doesn't depend on the fallback in any way.
2. **Removed the hardcoded bypass.** The `catch` block in `unlock()` (`frontend/app/admin/dashboard.tsx:1132-1141`) no longer contains the `COH_SUPER_2026` string or the "any 6-character code" school_admin fallback — a network/server failure now shows an error alert and denies access, full stop. Diff confirmed isolated to exactly this block (7 lines removed, replaced with one `Alert.alert` call) — no other part of the file touched.
3. `npx tsc --noEmit` shows 3 pre-existing type errors in this file (lines 32, 1230, 1234) — all unrelated to the edited lines (1123-1135), confirmed present regardless of this change.

**Not yet done — flag before considering this fully live:** this fix is committed to the repo but has **not been deployed** (no `git push`, no Expo/EAS rebuild). The hardcoded bypass remains live in any already-shipped app bundle and in the current Railway/Expo deployment until a new build goes out. Deploying is a separate, more consequential action (affects real users' installed app) — confirm with Jono before pushing/rebuilding.

### L2. School subscription pricing — backend and Stripe must be updated to match the website *(Section 7 #2)* — ✅ DONE & VERIFIED 2026-08-18
**Files:** `backend/server.py:67-79` (`SUBSCRIPTION_PLANS`), `backend/server.py:10568-10572` (`_get_plan_from_price`), `backend/server.py:6029-6031` (`GET /subscription/plans`, confirmed live-consumed by the app at `frontend/src/utils/api.ts:199`), Stripe dashboard products/prices, `portal100.html` (verified below).

**Ground truth from Jono: the website's school pricing is correct.** Live-confirmed via `curl https://classofhappiness.com` (`calcSavings()`, lines 1239-1241): **Starter €499/yr (≤5 teachers), Standard €999/yr (≤15 teachers), Plus €1,999/yr (>15 teachers)** — three tiers, differing by included teacher count.

The backend today defines only **two** school tiers at the **wrong** prices: `school_small` (`server.py:67-73`, €399/year, "5 teacher accounts, 150 students") and `school_large` (`server.py:74-80`, €1,499/year, "unlimited teachers"). This is a missing middle tier, not just two wrong numbers — there is no backend plan at all for a school with 6-15 teachers, and neither existing price matches any of the three real prices.

Confirmed **portal.html does not display school-plan pricing anywhere** (grepped for 399/499/999/1499/1999/"School Plan"/"Starter plan" — zero matches). The portal's "Subscriptions & Revenue" dashboard aggregates real subscription data rather than hardcoding plan prices, so it needs no direct price edit — but should be spot-checked after the fix to confirm its revenue totals reconcile against the corrected tiers.

Why this is launch-blocking, not cosmetic:
1. **The app itself shows the wrong prices.** `/subscription/plans` (`server.py:6029`) returns `SUBSCRIPTION_PLANS` directly and is fetched by the live app — any school admin viewing pricing in-app today sees €399/€1,499, not €499/€999/€1,999.
2. **Stripe products/prices must exist for the real three tiers.** No Stripe price IDs are hardcoded anywhere in the codebase (`grep` for `price_1`/`payment-link`/`buy.stripe.com` returns nothing) — checkout appears to rely on Stripe-hosted products/prices set up directly in the dashboard (acct `1TBwO3GVgsNSHYyt`), which must be created/verified for Starter/Standard/Plus before any school can be charged the advertised amount.
3. **The Stripe webhook can't currently tell school tiers apart at all.** `_get_plan_from_price` (`server.py:10568-10572`) only branches on whether the Stripe price id/nickname contains `"parent"` or `"teacher"` — every school price falls through to a generic `"subscriber"` label. Live-verified: `subscription_plan` is `NULL` for every user today regardless of `subscription_status` — no evidence school tier is tracked anywhere post-payment.
4. The closest thing to seat-based enforcement is informational only: `school_profiles.subscription_seats` (default 5, `server.py:8814`) and a `seats_used` count (`server.py:8595`) shown on the school admin's billing view — no code path blocks inviting more teachers than the seat count. Confirm whether that should become real enforcement now that tiers are correctly seat-differentiated.

**Fix (in order):**
1. Update `SUBSCRIPTION_PLANS` in `server.py:67-79` to three tiers matching the website exactly: Starter €499/yr (≤5 teachers), Standard €999/yr (≤15 teachers), Plus €1,999/yr (>15 teachers).
2. Create/verify the three corresponding Stripe products+prices (acct `1TBwO3GVgsNSHYyt`); confirm whatever generates the checkout link/session points at the correct price IDs (see L3 below — this checkout path is itself broken today and needs fixing in the same pass).
3. Extend `_get_plan_from_price` (`server.py:10568-10572`) with real branches for the three school price ids/nicknames so `subscription_plan` gets set correctly on webhook events, instead of falling through to `"subscriber"`.
4. Decide whether `subscription_seats`/`seats_used` should become real enforcement now that tiers are seat-differentiated, or stay informational by design.
5. Re-test school signup → Stripe checkout → webhook → `/subscription/plans` display end-to-end once (1)-(3) land — this touches real billing.

**Teacher pricing (€7.99/month) is unchanged** — independently verified to already match the live site exactly.

**What was actually done:**
1. `SUBSCRIPTION_PLANS` (`server.py:52-84`) restructured to three tiers exactly matching the website: `school_starter` €499/yr (≤5 teachers), `school_standard` €999/yr (≤15 teachers, previously didn't exist at all), `school_plus` €1,999/yr (>15 teachers). `price_aud` values are explicitly commented as rough placeholders, not real currency conversion — real multi-currency work is P1 (post-launch).
2. `_get_plan_from_price` (`server.py:10745-10755`) extended with `school_starter`/`school_standard`/`school_plus` branches.
3. **Real bug found and fixed while wiring this up:** the Stripe webhook (`server.py:~10800`) was passing only `price.id` (Stripe's auto-generated random string, e.g. `price_1Abc...`) into the plan-matching logic — which would **never** contain "teacher"/"parent"/"school_starter" no matter what Jono named the product, since Dashboard-created prices can't have a custom `id`. The actual identifying name lives in `price.nickname` or `price.lookup_key`. Fixed to check nickname → lookup_key → id, in that order, so it works regardless of which field ends up populated. Without this fix, none of the plan-matching work above would have actually worked in production.
4. **Confirmed with Jono:** Teacher Monthly (€7.99) and Parent Monthly Stripe prices already existed with no nickname set; Jono has since set their nicknames to `teacher_monthly`/`parent_monthly` — matches this code's expectations exactly.

**Deployed and verified live** (2026-08-18, against Stripe test mode — see L3 for the full test walkthrough): `GET /subscription/plans` confirmed returning all 5 correct plans in production. A real Stripe test subscription on the teacher price was created via the API, and the webhook correctly classified and persisted `subscription_plan: "teacher"` — proving the nickname-matching fix (#3 above) actually works end-to-end, not just in theory.

**Two more real bugs found and fixed only while live-testing** (not from static review — these only surface when the code actually runs against Stripe):
1. **The installed `stripe-python` version doesn't implement `.get()` on its response objects at all** (raises `AttributeError`, confirmed via Railway logs) — only bracket/index access works. This means the **entire webhook handler had been broken since it was first written**, for every event type, regardless of the nickname fix — `subscription_status`/`subscription_plan` updates from Stripe had very likely never once succeeded in production. Fixed with a small `_sget(obj, key, default)` helper (`server.py`, defined near the webhook) using proven-working bracket access, applied everywhere the webhook and the new status endpoint touch a Stripe SDK object. Separate commit: `89fc0d6`.
2. **Test-mode setup gap** (test-environment only, confirmed the live webhook endpoint was already correctly configured): the freshly-created test webhook endpoint was subscribed to `checkout.session.completed`/`customer.subscription.updated` but not `customer.subscription.created` — meaning Stripe never even attempted delivery for the event our test relied on. Fixed by updating the test endpoint's subscribed events to match what the code actually handles (`customer.subscription.created/updated/deleted`, `invoice.payment_succeeded/failed`). Live webhook (`we_1TpWTXGVgsNSHYytdK2b3RQQ`) checked read-only and already had the correct event list — no live change needed.

School Stripe products (Starter/Standard/Plus) and their Payment Links are still Jono's to create for the manual sales flow — not required for anything currently wired into the app, per the L3 scope decision (self-serve checkout is teacher/parent only).

### L3. Parent pricing model — free with school package, €4.99/mo self-serve otherwise; the self-serve payment path doesn't exist yet *(Section 7 #2, extended)* — ✅ DONE & VERIFIED 2026-08-18
**Files:** `backend/server.py:3546-3567` (`/parent/link-child`), `:3425-3441` (`/family/members`), `:9913-9921` (`/family/custom-strategies`), `:3311-3336` (`/resources`), `frontend/src/utils/api.ts:203-207` (`subscriptionApi.createCheckout`/`getPaymentStatus`), `frontend/app/subscription/index.tsx`, live website pricing copy.

**Ground truth from Jono: parents are free when their school has a package (linked via school invite code); parents at schools without a package subscribe €4.99/mo/family in-app, paid via web/Stripe — never Apple IAP.** (Confirmed: no `react-native-iap`/`expo-in-app-purchases`/StoreKit code exists anywhere in `frontend/` — nothing to remove there, good.)

This requires two things to actually work, and **neither does today**:

**(a) "Free with school package" is only partially wired, and has real gaps.** Four backend gates touch parent-facing limits, but only one of them checks school-package coverage at all:
- `POST /parent/link-child` (`:3546-3567`, the invite-code redemption itself) **does** check school coverage — `parent_covered` includes `bool(user.get("school_admin_id"))`, and it also checks the linked teacher's own `school_admin_id`/subscription via the classroom lookup. This one is close to correct already, modulo the pricing/tier fix in L2 not affecting its logic.
- `POST /family/members` (`:3425-3441`, "2 children" cap) — checks **only** `user.get("subscription_status")`, with **no school-coverage check at all**. A parent linked to a package school who hasn't personally been marked "active" would incorrectly hit this cap.
- `POST /family/custom-strategies` (`:9913-9921`, "6 strategies" cap) — same gap: subscription_status only, no school-coverage exemption.
- `GET /resources` (`:3311-3336`, `is_locked` flag) — same gap: subscription_status only, no school-coverage exemption.

None of these three carry a persistent "this parent's child attends a package school" flag set at link time — they'd need to look up the parent's linked children (`parent_links` → `students` → `classrooms` → teacher's `school_admin_id`) the same way `/parent/link-child` already does, or a `school_covered` flag should be written onto the parent's own user row at link time so subsequent checks are cheap. Either approach works; today none of the three do it at all, so **a parent at a fully-paid package school can still be told to upgrade** for adding a 3rd child, a 7th family strategy, or unlocking a resource.

**(b) The €4.99/mo self-serve payment flow for unlinked parents is completely non-functional today** — this is the launch-blocker inside the launch-blocker. The app's "Subscribe" button (`frontend/app/subscription/index.tsx:80-91`, `handleSubscribe`) calls `subscriptionApi.createCheckout` → `POST /subscription/checkout`, and payment confirmation calls `subscriptionApi.getPaymentStatus` → `GET /subscription/status/{session_id}`. **Neither endpoint exists anywhere in `backend/server.py`** — confirmed by direct grep, zero matches for `checkout` (case-insensitive) in the entire file. There is no `GET /subscription/status` collision either (the one existing route at `server.py:6445` is `/subscription/status`, a different no-path-param endpoint that just returns the caller's own current status — not the session-lookup one the frontend calls). **Right now, tapping "Subscribe" as either a parent or a teacher fails outright.** Live Supabase confirms this isn't theoretical: of 17 parent-role users, 0 have a `stripe_customer_id` set — nobody has ever actually completed a real Stripe payment as a parent. (4 parent rows show `subscription_status: active` with no Stripe customer behind them — almost certainly manually-set demo/test data, not real payments; no refund/cancellation cleanup needed.)

**Fix (in order):**
1. Build `POST /subscription/checkout` (create a Stripe Checkout Session for the given plan, return `{url, session_id}`) and `GET /subscription/status/{session_id}` (look up session status) — these are referenced by working frontend code today and simply don't exist server-side. This is required for the parent €4.99 flow to function at all, and also fixes teacher self-serve checkout, which is equally broken today.
2. Add the missing school-coverage check to `/family/members` (`:3425-3441`), `/family/custom-strategies` (`:9913-9921`), and `/resources` (`:3311-3336`) so a parent linked to a package school is treated as covered consistently everywhere, not just at link time.
3. Update `frontend/app/subscription/index.tsx` copy: the parent plan currently reads unconditionally "from €4.99/mo" (`:174`) with a flat `PARENT_PLANS`/`PARENT_FEATURES` list (`:10-13, 20-29`) that doesn't mention the free-with-school-package condition at all. Update to state the real model (e.g. "Free if your child's school has a Class of Happiness package — otherwise €4.99/mo per family") and skip straight to a "you're covered" state for parents who are already school-linked, rather than showing them a price at all.
4. Update the live website's parent pricing card (currently "EUR 2.99/month… Get started", unconditional, no mention of the free path — confirmed live at the pricing section) to clearly state the same conditional model.
5. **Bonus find, fix alongside this:** `frontend/app/subscription/index.tsx:37` (`TEACHER_FEATURES`) lists "SMS & push alerts" as a teacher plan feature — SMS is not implemented anywhere in the backend (same false claim pattern as the now-fixed website one). Correct to "Push alerts" while this file is being edited.
6. Re-test end-to-end once (1)-(2) land: invite-code redemption → parent sees no paywall anywhere in the app; a genuinely unlinked parent → sees the €4.99/mo prompt → completes real Stripe checkout → `subscription_status` flips to `active` correctly.

**Decided by Jono (2026-08-18):** `/reports/pdf/family/{id}` stays ungated — free for all parents regardless of subscription status, deliberately. It's a caring wellbeing report about their own child, not a premium feature, so it's intentionally excluded from the free/paid parent split described above. No change needed here as part of L3; this also settles A8's open question about this specific route (the school-overview and classroom-overview PDF gating question in A8 is unaffected and still open).

**Pricing correction while executing this:** Jono's actual considered parent price is **€4.99/mo**, not €2.99 as originally stated — confirmed in Stripe (existing "Parent Plan €4.99/mo" price, nickname now set to `parent_monthly`). All code, copy, and this plan doc updated to €4.99 throughout; a repo-wide grep for `2.99`/`2,99` confirms no leftover references anywhere (backend, frontend, or the website upload file) except one intentional historical comment noting the correction.

**What was actually done:**
1. **`_parent_is_school_covered(user)` helper added** (`server.py:3547-3592`), walking `parent_links → students → classrooms → teacher` and requiring the resolved school_admin's own `subscription_status == "active"` — the **stricter** definition Jono chose, closing a real loophole: the old logic only checked `bool(school_admin_id)` (link presence), so any school_admin on a lapsed/`none` plan would have made all their teachers' parents free forever, whether or not the school ever actually paid. Includes the same dual-match fallback (school_name lookup) as L4, since a teacher's own `school_admin_id` can still be unbackfilled.
2. **Applied the stricter coverage check** at all 4 sites: `/parent/link-child`'s existing gate (`server.py:3621-3654`, both the parent-side and the teacher-side checks rewritten to require `active` status, not just presence), `/family/members`'s 2-children cap (`:3446-3452`), `/family/custom-strategies`'s 6-strategies cap (`:10077-10084`), and `/resources`'s `is_locked` flag (`:3336-3343`, scoped to `role == "parent"` only — teacher gating is untouched since teacher pricing didn't change).
3. **Built the two missing endpoints**: `POST /subscription/checkout` (`server.py:6548-6577`, scoped to `teacher_monthly`/`parent_monthly` only per Jono's decision — school stays manual/sales-assisted) and `GET /subscription/status/{session_id}` (`:6579-6598`, returns the Stripe session's own `payment_status` directly rather than waiting on the async webhook, matching exactly what `frontend/app/subscription/success.tsx`'s `result.status === 'paid'` check expects).
4. **Stripe price IDs wired as env vars** (`STRIPE_PRICE_TEACHER_MONTHLY`, `STRIPE_PRICE_PARENT_MONTHLY`, `server.py:10738-10743`) rather than hardcoded, so Jono can set/rotate them without a code deploy — **not yet set on Railway, checkout will 500 with a clear "not configured" error until they are.**
5. **New `GET /parent/coverage-status`** (`server.py:3595-3603`) added — wasn't in the original plan text but is required to support #6 below; returns `{covered: bool}` for the currently logged-in parent.
6. **`frontend/app/subscription/index.tsx` rewritten**: annual billing removed entirely per Jono's decision (was already broken — `parent_annual`/`teacher_annual` had no backend or Stripe support, and the $39.99/$59.99 figures were placeholder USD, not real prices); a real bug fixed where `origin_url` was silently sent as `''` on every native build (`window.location.origin` doesn't exist outside a browser) — now uses `ExpoLinking.createURL('/')`, producing a real `classofhappiness://` deep link so Stripe's redirect can actually reopen the app; parent screen now fetches coverage status on load and shows a "✅ Free — your school has a package" card instead of the paywall when covered; the stray "SMS & push alerts" feature bullet corrected to "Push alerts"; School Package CTA and legal text corrected (was quoting a non-existent "$299/year" school price and "Prices in USD" despite showing EUR figures).
7. **`frontend/src/utils/api.ts`**: added `subscriptionApi.getParentCoverage()`.
8. **Website parent pricing card** (local upload-ready copy at `/Users/jono/Desktop/index-UPLOAD-2026-08-18.html`, freshly fetched live and edited, **not yet uploaded to cPanel**) rewritten to lead with "Free with your school's package" and state the €4.99/mo fallback, across all 6 languages (translations reviewed but not natively verified — recommend a native-speaker check before upload, especially PT/ES/IT/DE/FR). Also fixed a real, separate bug in the school ROI calculator (`calcSavings()`, line 1235) that was still computing the "what you'd pay individually" comparison using the old €2.99 figure — now €4.99, which directly affects the savings number shown to prospective school buyers.

**Deployed and verified live** (2026-08-18): Railway env vars set (`STRIPE_PRICE_TEACHER_MONTHLY`, `STRIPE_PRICE_PARENT_MONTHLY`, plus a temporary `STRIPE_TEST_MODE` toggle + `STRIPE_SECRET_KEY_TEST`/`STRIPE_WEBHOOK_SECRET_TEST` used only for this test pass, since Railway had only ever had a **live** Stripe key configured — testing against real money wasn't an option). Full loop tested against Stripe test mode:
- `POST /subscription/checkout` (teacher_monthly) → real Stripe Checkout Session created successfully.
- `GET /subscription/status/{session_id}` on the unpaid session → correctly returned `{"status":"unpaid","plan":"teacher_monthly"}` (this call originally 500'd — see the `.get()` bug below, found and fixed during this same test pass).
- A real test-mode subscription was created via the Stripe API (bypassing the hosted Checkout page, which can't be driven headlessly) using Stripe's built-in test payment method — this exercises the exact same webhook path a real completed checkout would. Webhook fired, `_find_user` matched the demo account by email and persisted `stripe_customer_id`, and `subscription_status`/`subscription_plan` updated correctly to `active`/`teacher` in Supabase — confirmed both directly in Supabase and via the app-facing `GET /subscription/status`.
- `GET /parent/coverage-status` tested against a real linked parent account — returned `covered: true`, traced end-to-end through `parent_links → students → classrooms → teacher → school_admin` to confirm the logic fired for the right (if slightly tangled, pre-existing demo-data) reason rather than a false positive.
- Test artifacts cleaned up afterward: Stripe test subscription cancelled, the demo teacher account (`jono+teacher@gmail.com`) reverted to its pre-test `subscription_status: trial` baseline, `STRIPE_TEST_MODE` flipped back to `false` (confirmed via a follow-up deploy) so the server is back on the live Stripe key.

**Real bug found only by live-testing, not fixable from static review — see L2 above for full detail**: this stripe-python version doesn't support `.get()` on its response objects; the webhook (and the new status endpoint) had used it throughout. Fixed via a `_sget()` helper (commit `89fc0d6`) — without this, none of the webhook-driven `subscription_status`/`subscription_plan` updates in this whole plan would have worked, in test or live.

**Still pending, not part of this fix:**
- `/Users/jono/Desktop/index-UPLOAD-2026-08-18.html` needs manual upload to cPanel — not automated, no FTP access from here.
- School Stripe products/Payment Links — Jono's to create for the manual sales flow (see L2).

### L4. School identity (school_admin_id vs school_name) — real data loss happening today *(Section 7 #1)* — ✅ DONE 2026-08-18
**File:** `backend/server.py` (every `.eq("school_admin_id"` / `.eq("school_name"` query site)

Queried live Supabase `users` table directly:
- All 4 `school_admin` rows have `school_admin_id = NULL` on their own row (matched to their school purely by `school_name`).
- Of 23 `teacher` rows: **0 have both fields set.** 3 real teachers at "Sunshine International School" have `school_name` set but `school_admin_id = NULL`. 1 has only `school_admin_id`. 19 have neither.
- A **third** school-identity concept exists beyond the two the handover names: a separate `school_profiles` table with its own `school_admin_user_id` column, currently 1 row ("St Lucy's ", trailing space in the stored name), `school_admin_user_id` also NULL. Not resolved by this fix — flagged as-is for a future canonical-school-entity decision.

Any endpoint filtering by `school_admin_id` alone silently drops the 3 real, active Sunshine teachers' data — not theoretical, today's actual data. This is launch-blocking rather than a nice-to-have because it directly undermines L2/L3's school-package coverage logic too: if a school's own teachers/parents aren't reliably matched to that school, "free because your school has a package" can't be trusted to work correctly for exactly the accounts most likely to be affected (newly-linked ones).

**What was actually fixed:**
1. **Root cause re-investigated, turned out different from the original hypothesis.** `/school/join` (`server.py:8280-8323`, the real invite-code redemption flow) already correctly sets *both* `school_admin_id` and `school_name` — it was never broken. The 3 affected teachers (`demo_teacher_001/002/003`, sarah.mitchell/james.okonkwo/maria.santos @sunshine-school.com) are pre-existing seed data created May 30–Jun 9, 2026, *before* any "Sunshine" school_admin account existed (created Jul 28) — they were seeded directly with only a `school_name` string, never run through the join flow. No ongoing linking-flow bug to fix.
2. **Ambiguity found and resolved:** two separate school_admin rows both use `school_name = "Sunshine International School"` — `demo_school_001` (demo@schoolportal.app) and `44bf76b1-c0ee-49d5-bc68-3e47bb5cf8b3` (schooladmindemo@classofhappiness.com, the account documented in COH-HANDOVER.md Section 2 as the real demo login). Backfilled against the documented account per Jono's decision; `demo_school_001` is an unused duplicate seed row, tracked separately in A13 below rather than fixed here.
3. **Backfilled** `school_admin_id = 44bf76b1-c0ee-49d5-bc68-3e47bb5cf8b3` onto all 3 teacher rows via direct Supabase PATCH — confirmed in the update response for each.
4. **Dual-match code fix applied** at the 3 single-match risk sites identified in the original review, using the same pattern already correct elsewhere in the file (merge-and-dedupe by `user_id` across an `school_admin_id` lookup and a `school_name`+`role=="teacher"` lookup):
   - `GET /school-admin/stats` (`server.py:8180-8186`)
   - `GET /school-admin/subscription` (`server.py:8592-8598`)
   - Superadmin "Schools Breakdown" loop (`server.py:6887-6892`)
   - `python3 -m py_compile backend/server.py` confirmed valid syntax after the edit.

**Verified live**, logged in as the real `schooladmindemo@classofhappiness.com` account against production (`https://class-of-happiness-production.up.railway.app`):
- `GET /school-admin/stats` → `total_teachers: 3, total_students: 24` (was silently 0 before the backfill)
- `GET /school-admin/subscription` → `seats_used: 3`, all 3 teachers (Maria Santos, Sarah Mitchell, James Okonkwo) listed by name/email
- `GET /school-admin/analytics` → `total_teachers: 3, total_students: 24`

All three checks ran against the **already-deployed** (pre-dual-match-fix) backend and passed purely from the data backfill — confirming the data-layer fix alone resolves the user-visible symptom immediately. The dual-match code change is deployed as defense-in-depth for any future similarly-orphaned row (e.g. from manual Table Editor edits, which the handover notes has happened before) — re-verify these same 3 endpoints once Railway redeploys, to confirm the new code path doesn't change the (already-correct) result.

**Deferred, not part of this fix:** part (d) of the original fix list — whether `school_profiles` becomes the canonical school entity long-term — remains open. `demo_school_001` cleanup is tracked in A13.

---

# LAUNCH-ACCEPTABLE
*(Real, evidenced problems. Don't block launch, but should be worked through soon after — roughly in the order listed.)*

### A1. Duplicate route registrations — dead code, no live impact *(Section 6 #2)* — ✅ DONE 2026-08-18
**File:** `backend/server.py`

Two paths were registered twice under `api_router`; FastAPI matches in registration order, so the first definition won and the second was unreachable — same bug class as commit `0792701`:
- `POST /auth/promote-admin` — line 2469 (live) vs 7307 (dead).
- `DELETE /admin/teacher-strategies/{strategy_id}` — line 8110 (live) vs 9456 (dead).

**Fix:** delete the dead (second) definition of each pair or merge intentionally; grep for other duplicates after any large edit.

**What was actually done:** re-ran the full-file duplicate-route scan first (`grep` every `@api_router.*` decorator, sorted, counted) to confirm these were still the only two duplicates after all the L1-L4/L2-L3 edits — they were, no new ones introduced.

For each pair, read both full definitions before touching anything, since "merge intentionally" turned out to be the right call in both cases, not a plain delete:
1. **`POST /auth/promote-admin`**: the live version hardcoded `["ADMINCLASS2026", "HAPPYADMIN2026"]` directly; the dead version read the same two codes from the shared `PROMO_CODES` dict (single source of truth, plus `.upper().strip()` input normalization) — confirmed `PROMO_CODES` currently holds exactly those two `"type":"admin"` entries, so accepted codes are unchanged today. Merged the dead version's logic into the live slot (better engineered, no duplication), kept the live version's original response shape (`{"message":..., "role":...}`), then deleted the now-fully-duplicate dead definition.
2. **`DELETE /admin/teacher-strategies/{strategy_id}`**: the live version only allowed `admin`/`superadmin`; the dead version was a genuine capability superset — added `school_admin` with an ownership check (school_admin can only delete their own) and proper try/except error handling. Grepped every frontend/app and portal.html caller of this path first — confirmed `school_admin` never actually calls this endpoint today from either surface (the app's `StrategyManager` and portal both route school_admin to `/school-admin/school-strategies` instead) — so promoting the richer version changes nothing for existing admin/superadmin behavior and simply enables a capability that was clearly intended but permanently unreachable. Merged it into the live slot, kept the original response shape (`{"message": "Strategy deleted"}`), deleted the dead definition.

**Verified:** `python3 -m py_compile server.py` passes; re-ran the duplicate-route scan — zero duplicates remain anywhere in the file; confirmed via grep that no frontend/portal caller inspects the response body of either endpoint (both call sites `await` the request without reading the result), so the response-shape choices above were low-risk either way. Not deployed as part of this change — bundle with the next push.

### A2. Full admin-capability parity map — retire legacy admin.html, close the school_admin app/portal gap *(Section 6 #3)*

**App — `frontend/app/admin/dashboard.tsx`, one shared component for both roles, no `frontend/app/school-admin/` directory exists:**
Superadmin: 6 tabs (Analytics, Strategies, Resources, Schools, Users, Settings). School_admin: strict subset, 4 tabs (Analytics, Strategies, Resources, "School"=Settings). Sharpest asymmetry: superadmin's Settings (`:1246-1253`) is one static "Platform Version" card; school_admin's Settings (`SchoolSettings`, `:843-956`) is a real functional form (school profile, wellbeing-alert email, teacher invite-code generator).

**Portal (`portal100.html`) — superadmin (`buildSuperAdminPortal`, line 415): 6 tabs** (Dashboard, Creatures, Schools, Users, Strategies, Resources).

**Portal — school_admin (`buildSchoolAdminPortal`, line 1423) — 9 tabs, the biggest gap the handover missed:** Dashboard, Resources, Strategies, Users, **Wellbeing Tracker, Our Team, Services** (third-party provider directory), **Creatures, My Wellbeing** — the last four exist *only* in the school_admin portal, zero app equivalent. This is the largest concrete SYNC PRINCIPLE violation found: not a lighter app version, just absent from the app.

**Legacy admin.html (`coh_admin-2.html`, 1,844 lines) — superadmin-only, targets Railway directly:** Login, Dashboard, Resources, Strategies, Users, Alerts, Schools, School Mgmt, Reports. Every capability maps 1:1 to something the portal already covers against the identical backend — **zero unique capabilities** — and it's demonstrably broken: `loadSubscriptionIntents()` (`:876`) is called but never defined (dashboard subscription card permanently stuck loading); School Analytics panel is fully broken (`:1223`, `:643` — references to a DOM element and handler that don't exist in this version); its "Grant Trial" button calls `POST /auth/apply-promo-trial` (`:1184`) — **this endpoint doesn't exist in `server.py`** (only `/auth/promo-code` does).

**Fix:**
1. **Retire legacy admin.html entirely** — zero unique capabilities, three already-broken features, unmaintained since Aug 4. Confirm portal's own Grant Trial / School Analytics equivalents work first, then remove from cPanel. (Also closes A5's XSS finding for this file.) — ✅ DONE 2026-08-18, see below.
2. Decide whether Wellbeing Tracker / Our Team / Services / My Wellbeing stay portal-only by design or need an app equivalent — product call. **Still open.**
3. Build an app-side school_admin "School Profile" settings screen matching the portal; decide what superadmin's app Settings should actually contain. **Still open.**
4. Port `/admin/wellbeing-alerts` into the portal's superadmin Dashboard if still wanted — live endpoint, no surface points at it today. **Resolved as not-needed** — see below, portal deliberately replaced this with the Wellbeing Tracker system instead.

**Item 1 — what was actually done (2026-08-18):** before touching anything, re-verified the live file directly rather than trusting the local scratch copy at face value. The real live URL wasn't literally `admin.html` (that path 404s) — it was `https://classofhappiness.com/coh_admin.html`, confirmed byte-identical to the `coh_admin-2.html` copy used throughout this review, so every finding above (broken Subscription Intents, broken School Analytics, dead Grant Trial endpoint) applied to the live file with no staleness gap. Confirmed zero dependencies before removal: no reference anywhere in the frontend app or marketing site; not served by the backend at all (a static file in cPanel's web root, independent of the FastAPI app — no code change needed); no `.htaccess` or server config reference; COH-HANDOVER.md only lists it as a surface to reconcile, no operational workflow depends on it. Found portal.html's own comments confirming deliberate, already-completed supersession — `// SCHOOL MANAGEMENT (ported from admin.html...)` at `portal100.html:1160`, and critically `// Replaces the old wrong /admin/wellbeing-alerts calls...` at `:1777`, which resolves item 4 above (the one capability the original review flagged as possibly-orphaned turns out to have already been deliberately replaced by the richer Wellbeing Tracker system, with the old endpoint explicitly recognized as wrong for the job). Jono deleted `coh_admin.html` from cPanel; confirmed 404 on the live URL immediately after. Items 2 and 3 remain open product/build decisions, unrelated to the retirement itself.

### A3. Creatures global-approve — ✅ DONE for backend/portal 2026-08-18, live-tested; mobile-parity question flagged separately below *(Section 6 #4)*
**Files:** `frontend/src/components/CreatureManagement.tsx:6-11`, `backend/server.py:10928-10971`

`CreatureManagement.tsx`'s own comment describes a two-step approval (teacher/parent approve locally — works; superadmin global-approve — the real gate before anything goes public). Grepping `frontend/` for `global-approve` returns exactly one hit, that same comment — **no React Native app code calls this endpoint.** Portal's Aug 18 Creatures tab renders an approval queue, but this review didn't confirm its Approve button actually posts to `/creatures/global-approve` with `visibility_scope`.

**Fix:** confirm live whether portal's Approve button calls this endpoint correctly; if not, it's a fully orphaned backend capability needing a UI built.

**What was actually found:** the premise didn't hold — portal already does this correctly, no building needed. Confirmed against the live portal file: `loadSACreatures()` → `GET /creatures/awaiting-global-approval` populates the queue; `renderSACreatureQueue()` renders three distinct approve buttons per item ("Classroom only" / "Whole school" / "Everyone (global)") plus reject; `saGlobalApprove(id, scope)` → `POST /creatures/global-approve/{id}` with `{action:'approve', visibility_scope: scope}`, exactly matching the backend contract; `saGlobalReject(id)` → same endpoint with `{action:'reject', reason}`. Live-tested read-only as real superadmin against production: `GET /creatures/awaiting-global-approval` → `200 OK`, `[]` (nothing currently queued — a normal empty state, not an error). Backend and portal sides are complete, correct, and confirmed working end-to-end.

**Separate open item, not urgent, deliberately not decided now:** the mobile app still has zero equivalent UI for this (confirmed no React Native code anywhere calls `global-approve`). Whether that's a real gap or an intentional portal-only capability (similar to how superadmin's app Settings tab is already thin by design, per the SYNC PRINCIPLE's "app matched at phone-appropriate level") is a product call for Jono, not something to build reflexively. If it does get built, it's a real UI task (queue screen, scope picker) — not a quick follow-up.

### A4. Superadmin period-pill bug — appears ALREADY FIXED, handover is stale *(Section 6 #5)* — ✅ VERIFIED RESOLVED 2026-08-18, no code change
**File:** `portal100.html:544-559`

Live code has an Aug 18-dated comment describing the exact cross-call fix the handover still lists as open. `changeSAStatsPeriod` now calls only `loadSuperAdminData()`.

**Fix:** no code change — live-test to confirm, then strike from the priority list.

**Re-verified against the actual live file** (fetched `https://classofhappiness.com/portal.html` directly and diffed byte-for-byte against the local `portal100.html` scratch copy used throughout this review — identical, so no staleness gap here unlike the marketing site earlier). Confirmed the fix genuinely holds: `changeSAStatsPeriod`/`saStatsPeriod` (superadmin) calls only `loadSuperAdminData()`; `changeSAPeriod`/`currentSAPeriod` (school_admin) calls only `renderOverview()`. No cross-call exists. The duplicate `#saPeriodTabs` DOM id (lines 430, 1582) is confirmed still present but dormant — the two builder functions are mutually exclusive per page load, so it never collides in a live DOM. Nothing to fix; struck from the priority list as the handover's own claim was simply stale.

### A5. [SECURITY] Stored-XSS risk in legacy admin.html; audit portal.html for the same pattern *(Section 6 #7)* — ✅ DONE 2026-08-19, both instances fixed
**Files:** `coh_admin-2.html` (retired, see below); `portal100.html` — `renderTeacherAlerts()` (`:3033-3095`), `renderSchoolUsersList()` (`:1522-1541`), `loadSASchools()` (`:1352-1381`), `displayTracker()` (`:1870-1891`)

Lower-privilege-originated data (school names, task notes, alert messages, teacher/user names) is inserted into a higher-privilege user's DOM via unescaped hand-built-HTML-string `innerHTML` assignment, with no escaping helper defined anywhere in either file.

**Resolved for `coh_admin-2.html`**: moot as of A2 item 1 — the file was deleted from cPanel 2026-08-18 (confirmed 404 on the live URL), so this exact vulnerable code no longer exists anywhere.

**`portal100.html` audit (2026-08-19):** confirmed the identical pattern, live — fetched the hosted file directly (`https://www.classofhappiness.com/portal.html`) and confirmed it's byte-identical to the local working copy before auditing, so findings reflect what's actually live, not a stale draft. No `esc()`/`escapeHtml()`/sanitize helper exists anywhere in the file's ~5,770 lines. Confirmed vulnerable in all 4 areas originally asked about:
- **`renderTeacherAlerts`** (most severe) — `a.message`, a **parent's free-text alert message**, interpolated completely raw; any parent could inject arbitrary HTML/JS into a teacher's alert view. Also `student_name`, `classroom_name`, and `resolveSN(a.strategy_name)` (can resolve to a user-typed custom strategy name) — all unescaped.
- **`renderSchoolUsersList`** ("Users") — `u.name||u.email` and `u.email` (self-set signup fields) raw-interpolated into a school_admin's DOM.
- **`loadSASchools`** ("Schools") — `school_name` and `principal_email` raw-interpolated into a **superadmin's** DOM. While fixing, found the same function also raw-interpolates `city`/`country`/`subscription_package` — all confirmed free-text inputs via `saSaveSchool` (not fixed dropdowns as assumed) — included these in the fix too, beyond the original 2-field scope.
- **`displayTracker`** (Wellbeing Tracker) — `student_ref`, `year_group`, `action`, `delegate`, and free-text `areas` (including a user-typed "Other" field) — lower severity (mostly a school_admin viewing their own input back) but same systemic gap.

Also found and fixed: every `onclick`/`title` attribute built from these same fields only escaped single-quotes for JS-string safety (`name.replace(/'/g,"\\'")`) — never escaped for the surrounding HTML-attribute context, so a `"` or `>` could still break attribute parsing.

**Fix applied:** added one shared `esc()` helper (HTML-entity escape: `& < > " '`) near the top of the file, and wrapped every field listed above with it — including the attribute-context ones, applied *around* the existing JS-quote-escape so both layers are covered. Scope stayed limited to exactly these fields; the file's other 100+ `innerHTML` assignments (static strings, emoji, counts, fixed-dictionary values) were left untouched.

**Verified:** diff reviewed and approved before applying; extracted and validated the full inline script with `node --check` — clean syntax, no errors. Final grep confirmed zero leftover unescaped instances of any flagged field in the 4 functions (one intentionally-untouched `+name+` remains inside a `confirm()` dialog call, which renders plain text only — not an innerHTML/XSS context, correctly out of scope). **Not deployed by this session** — `portal100.html` isn't tracked in git and has no established upload path available here (per A11's standing risk note); written to `/Users/jono/Desktop/portal100-UPLOAD-2026-08-19.html` for Jono to upload to cPanel manually, same process as prior website fixes. Not visually tested in a browser — no environment available here to do so; verified via source-level review, live byte-for-byte diff against the hosted file, and JS syntax validation instead.

### A6. The 'admin' role — was vestigial-but-live-exploitable, plus two more discovered self-serve promotion bugs — ✅ DONE 2026-08-20, live-verified *(Section 6 #6)*
Live Supabase had zero `role='admin'` rows, but `POST /auth/promote-admin` (`server.py:2469`) could still create one. Once set, `admin` = `school_admin`-level in the portal (`portal100.html:408`) but `admin` = `superadmin`-level in legacy admin.html (`coh_admin-2.html:797`) — same role string, two different privilege levels depending which surface reads it.

**2026-08-18 partial fix:** the specific admin.html-vs-portal conflict was resolved as a side effect of A2's admin.html retirement — no longer two surfaces disagreeing. Deliberately left open at the time: whether `admin` was a real stepping-stone tier worth keeping, or dead code to remove.

**2026-08-20 investigation — the deeper problem, requested as "show me what it is, what removing it would mean, quick decision":** the exact same cross-surface inconsistency never actually went away — it just relocated *inside* `server.py` itself. `/admin/verify` treated `admin` as school_admin-tier (`is_super_admin: false`), but ~20 real resource endpoints gated on `role in ("admin", "superadmin")`, treating it as fully equal to superadmin — their own docstrings said things like *"Superadmin can cancel any creature globally"* and *"Returns all users for superadmin"*, yet granted that to `admin` too (`GET /admin/users`, `POST /creatures/cancel/{id}`, `POST /admin/unlink-user`, `PUT /admin/global-strategies/{id}`, and ~16 more). Worse: this role was live self-serve reachable, not just dead code — 4 separate endpoints could grant it: `/auth/promote-admin` and `/auth/promo-code` (via hardcoded promo codes `ADMINCLASS2026`/`HAPPYADMIN2026`, no other auth check), `/subscription/redeem-trial-code` (same codes), and `/auth/fix-role` (a hardcoded-secret endpoint that could set **any** `user_id`'s role, not just the caller's own). Decision: **remove entirely** (Jono) — small, mechanical, zero data migration (zero live rows), nothing in the frontend branched on it.

**What was actually done (round 1, `a44ab78`):** deleted both `PROMO_CODES` admin entries, `/auth/promote-admin`, `/auth/fix-role`, and the admin branches inside `/auth/promo-code` and `/subscription/redeem-trial-code`. Collapsed all ~20 `role in ("admin","superadmin")` checks (plus `/admin/verify`'s own admin branch, added in A19 the same day) to superadmin-only. Left untouched, confirmed harmless: ~38 endpoints where `admin` appeared only alongside `school_admin`/`teacher`/`parent` in a broader allow-list (can no longer match since nothing grants it — stale but inert, not a behavior change), and 2 unrelated `created_by_role` default-value fallbacks (data tagging, not access control).

**Round 2 (`6115562`) — a bigger, adjacent bug found while wiring up the frontend side:** removing the now-dead `authApiExtended.promoteToAdmin` wrapper, found it had a real live caller — `settings.tsx`'s "Admin Access" section, visible to **every logged-in user** regardless of role. That UI's `handlePromoteAdmin` had a client-side hardcoded check for `['JONO_SUPERADMIN_2026', 'CLASS_CREATOR_2026']` — matching either would call `POST /auth/promote-superadmin`, a previously-unaudited endpoint (missed by the original grep, which searched for lowercase `"admin"` — these use different, uppercase code strings and weren't in `PROMO_CODES` at all) granting **full `role="superadmin"`** to any authenticated account, no other check. Same class of bug as L1 (hardcoded superadmin bypass shipped in the app bundle), just not caught in that pass, and more severe than the admin-role issue just fixed. A sibling endpoint, `/auth/promote-school-admin`, had the identical pattern for `role="school_admin"` via 3 more hardcoded codes (`ADMINCLASS2026`/`HAPPYADMIN2026`/`SCHOOLADMIN2026`) with a user-supplied `school_name` and no per-school binding or expiry.

**What was actually done (round 2):** deleted `/auth/promote-superadmin` and `/auth/promote-school-admin` entirely, and the whole "Admin Access" UI block in `settings.tsx` (the expandable code-entry section, both handlers, and the now-dead state: `showAdminCode`, `adminCode`, `promotingAdmin`, `showAdminCodeText`), plus the now-fully-dead `authApiExtended.promoteToAdmin` wrapper in `api.ts`. Confirmed via grep first: no other caller anywhere (frontend, backend, or the local `portal100.html` copy) referenced either endpoint or any of the code strings. Confirmed real school_admin onboarding is unaffected — `POST /admin/create-school-admin` already exists as the legitimate, superadmin-gated path and wasn't touched.

**Verified — both rounds, live against production after each deploy:** real superadmin login + `/admin/verify` + a real superadmin-gated resource endpoint (`GET /admin/stats`) all still work correctly; real school_admin (demo account) login + `/admin/verify` still work correctly; all 6 removed grant paths now correctly return 404 with the exact real codes that used to work (`/auth/promote-admin`, `/auth/fix-role`, `/auth/promote-superadmin`, `/auth/promote-school-admin`) or 400 "invalid code" (`/auth/promo-code`, `/subscription/redeem-trial-code` with the old admin codes); sibling legitimate functionality (real trial promo codes) unaffected; confirmed no account's role was altered by any of the failed probe attempts. `python3 -m py_compile` and `tsc --noEmit` both clean on every touched file — not even pre-existing errors in the two frontend files. Committed and pushed both rounds (`a44ab78`, `6115562`).

### A7. Colour drift — systemic, worse than "app vs. portal," no central fix point *(Section 7 #3/#4)* — ✅ DONE 2026-08-19 (frontend TSX/TS sweep complete)
- 42 files use the old palette (`#4CAF50`/`#F44336`/`#FFC107`) vs. 5 using brand (`#4CAF73`/`#E05252`/`#FFD93D`) across `frontend/src`+`frontend/app`.
- `ZoneButton.tsx:29-58` (`ZONE_CONFIG`) is the nominal shared source but bypassed by 10+ local redeclarations (`admin/dashboard.tsx:14`, `parent/alerts.tsx:11`, `teacher/dashboard.tsx:42`, `kiosk/index.tsx:14`, and more).
- **Three, not two, mutually-inconsistent palettes exist**: old, brand, and a third variant inside `teacher/dashboard.tsx:199,213` (`#43A047`/`#F9A825`/`#E53935`) — one file disagreeing with itself.
- Backend (`server.py` CREATURES model + every PDF generator) and portal (several functions, e.g. `renderTeacherAlerts`, the strategy zone picker) both lean old-palette too, alongside brand-correct sections in the same files.
- Brand yellow `#FFD93D` barely appears live anywhere — app, backend, and portal all default to `#FFC107` instead. This is the design doc being out of sync with reality, not surface drift.
- No central colour-constants file exists anywhere.

**Fix:** one shared colour-constants module (`frontend/src/constants/emotionColours.ts` + matching Python dict), single pass across all drifted files. Recommend canon `#4CAF73`/`#E05252`/`#4A90D9`, and update the design doc's yellow to the real `#FFC107` rather than repainting 45+ files.

**What was actually done (scoped pass, ~30-45 min budget — deliberately not the full sweep):**
1. Created `frontend/src/constants/emotionColours.ts` — `EMOTION_COLOURS` + `EMOTION_LIGHT_COLOURS`, canonising green/red/blue to brand (`#4CAF73`/`#E05252`/`#4A90D9`) and yellow to `#FFC107` (not the design doc's `#FFD93D`, per the reasoning already in this section — matches what real "correct-looking" screens already used).
2. `ZoneButton.tsx` — the nominal shared source — now actually imports from it instead of hardcoding its own copy. `teacher/strategies.tsx` already imported `ZONE_CONFIG` from `ZoneButton`, so it's fixed for free, no edit needed there.
3. `app/index.tsx` (the app's landing screen, seen by every user every session) — fixed directly. This one only imported `ZONE_FACES` (the emoji) from `ZoneButton`, not `ZONE_CONFIG`, so it had its own separate hardcoded colour array that fixing `ZoneButton` alone would **not** have covered — worth knowing for whoever does the remaining files, since "imports from ZoneButton" doesn't always mean "gets the colour fix for free."
4. `teacher/dashboard.tsx` — fixed all three local declarations, including the one the original review flagged as disagreeing with itself (`ZONE_COLORS_MAP`/`ZONE_COLORS_MAP2` used a third palette, `#43A047`/`#F9A825`/`#E53935`, different from `ZONE_COLORS` higher in the same file). Note: this file was being actively edited by Jono concurrently while this fix was applied — confirmed via git diff after the fact that the two sets of changes landed in different parts of the file with no collision, but flagging in case anything looks unexpected on review.
5. `student/rewards.tsx` — fixed the inline zone-colour ternary on the tip banner. Left one unrelated old-palette hex in the same file alone (`pointsEarned` text colour, `#4CAF50`) — that's a generic "success" accent colour, not zone logic, out of scope for this fix.

**Verified:** all 4 diffs reviewed in full before applying, isolated and clean; `tsc --noEmit` shows only pre-existing errors, none within dozens of lines of any edit made. Committed and pushed (`730f500`).

**Second pass (2026-08-19) — the remaining files, completed:**
Went through every file with a genuine `ZONE_COLORS`/`ZONE_COLOR`/`ZONE_CONFIG`/`ZONE_COLORS_MAP` zone-to-hex mapping (re-confirmed via a `ZONE_COLOR|zoneColors|ZONE_CONFIG` construct-name grep, not the earlier raw-hex grep, since raw hex matches were mostly incidental UI accents unrelated to zone logic — delete buttons, success ticks, alert badges, etc. — and correctly left untouched). Same two-part pattern applied to each: import `EMOTION_COLOURS` (and `EMOTION_LIGHT_COLOURS` where a file also had a matching light-tint dict) from the appropriate relative path, then replace the local hardcoded declaration with a reference to the shared constant. Files fixed: `parent/linked-child/[id].tsx` (`ZONE_COLORS`, `ZONE_CONFIG`, an inline ternary, a filter-chip array, and a fallback literal), `admin/dashboard.tsx` (`ZONE_COLORS` plus a separately-inlined zone check-in-count block that was using a **third**, previously-uncatalogued yellow variant, `#E0A800` — corrected to the canon `#FFC107`, the one real visual micro-change in this pass), `parent/alerts.tsx`, `parent/family-member-stats/[id].tsx`, `parent/widget.tsx`, `kiosk/index.tsx`, `teacher/alerts.tsx`, `teacher/classrooms.tsx`, `teacher/bulk-checkin.tsx` (keyed `b`/`g`/`y`/`r` rather than full zone names, so mapped per-key instead of a direct assignment), `teacher/checkin.tsx` (`ZONE_COLORS`, a `ZONES` array, and a separate inline dict further down the file), `teacher/student-detail.tsx` (`ZONE_COLORS`, two duplicate `ZONE_COLORS_MAP` inline declarations, and an inline zone-from-strategy-id ternary), `teacher/widget.tsx`, `src/components/CreatureManagement.tsx`, `src/components/FeelingsButton.tsx` (both `color` and `lightColor` fields — `lightColor` matched `EMOTION_LIGHT_COLOURS` exactly).

**Deliberately still not touched — flagged as separate findings, not silently changed:**
- `student/strategies.tsx` — uses a wholly different pastel palette (`#5DADE2`/`#58D68D`/`#F4D03F`/`#EC7063`), not part of the old/brand drift this fix targets.
- `src/components/CreatureCollection.tsx` and `src/components/CreatureShowcase.tsx` — both use a matching but distinct pastel palette (`#4FC3F7`/`#81C784`/`#FFD54F`/`#FF7043`, with its own light-tint set), same reasoning.

Changing either of these would be an unreviewed visual change to screens not part of the app/portal drift this item was scoped to fix — worth a deliberate design decision later, not a mechanical sweep.

**Still out of scope for this item** (frontend-only per the original scoping): the backend Python dict (CREATURES model + PDF generators in `server.py` still hardcode the old palette), and `portal100.html`'s own drifted functions (`renderTeacherAlerts`, the strategy zone picker, the school-sharing button — see Section 6 #8 in the original review).

**Verified:** every genuine `ZONE_COLOR*`/`zoneColors`/`ZONE_CONFIG` construct across `frontend/app` and `frontend/src` traced back to `EMOTION_COLOURS` via a final grep pass (excluding the 3 intentionally-skipped files above). `tsc --noEmit` run in 2 batches covering all edited files — all reported errors are pre-existing and unrelated to the colour changes (confirmed none reference `ZONE_COLORS`/`EMOTION_COLOURS` or fall on edited lines).

### A8. Freemium/gating consistency — PDF endpoints *(Section 7 #5)*
5 PDF routes exist; only student (`:4240`) and teacher-wellbeing (`:4917`) enforce download caps. Family, school-overview, and classroom-overview PDFs have zero cap gating (verified with a 120-line post-route grep window).

**Fix:** extend the existing cap pattern to the 3 ungated routes, or confirm deliberately that they're meant to stay uncapped. Revisit alongside L3's open question about whether family PDFs should gate on the parent's new coverage status.

### A9. Three strategy systems — ✅ DONE 2026-08-18 for teacher/parent content, live-tested *(Section 7 #2 old / now #6)*
Live Supabase `admin_teacher_strategies`: 39 rows, 22 student/9 teacher/8 parent. `GET /strategies` (the real check-in consumer) only reads `helpers`+`custom_helpers`, never this table. **The 17 teacher/parent rows are real, editable superadmin content, structurally unreachable by any teacher or parent today.**

**Fix:** build the missing teacher/parent-facing consumer screens, or explicitly stop presenting this content as if it reaches users.

**Correction before fixing:** the original framing ("structurally unreachable") turned out to be half-true. Deeper investigation found the real student flow doesn't even use `GET /strategies` — the app calls `GET /helpers` directly, whose defaults are hardcoded Python dicts (`DEFAULT_HELPERS` + per-language translations), not a Supabase table at all; `helpers`/`custom_helpers` only feed the less-used `/strategies` alias. More importantly: **teacher/checkin.tsx already had a half-finished integration** — it fetched `GET /admin/teacher-strategies` into an `adminStrategies` state that genuinely was merged into the rendered picker (`strategiesForZone`, merged with a hardcoded `TEACHER_STRATEGIES` list by zone, deduped by name) — so teacher-tagged content *was* already reaching teachers. The real bug: the fetch never passed `strategy_type`, so it silently pulled back **all 39 rows** — student- and parent-tagged content could appear in a teacher's own wellbeing check-in alongside the real teacher content, whenever it shared a zone and didn't collide by name. **Parent side (`parent/checkin.tsx`) had no integration attempt at all** — a separate hardcoded `PARENT_STRATEGIES` list existed, but nothing ever fetched from `admin_teacher_strategies`.

**What was actually done:**
1. `frontend/app/teacher/checkin.tsx` — added `?strategy_type=teacher` to the existing `loadAdminStrategies()` fetch. One-line fix; no backend change needed, the endpoint already supported the filter (`server.py:8237-8247`), nothing in the app was passing it.
2. `frontend/app/parent/checkin.tsx` — built the missing fetch from scratch, mirroring teacher's now-correct pattern: fetches `GET /admin/teacher-strategies?strategy_type=parent`, filters by zone client-side (the endpoint doesn't filter by zone), dedupes by name against both the hardcoded `PARENT_STRATEGIES` and the existing `/family/custom-strategies` fetch, merges all three sources.
3. Both diffs confirmed isolated and clean (`git diff` reviewed in full before applying); `tsc --noEmit` shows only pre-existing, unrelated errors in both files.
4. **Live-tested end-to-end** against production using real teacher and parent account logins (not just superadmin): `GET /admin/teacher-strategies?strategy_type=teacher` → exactly the 9 real teacher rows, no student/parent bleed-through; `?strategy_type=parent` → exactly the 8 real parent rows. Confirmed with both a superadmin token and the actual teacher/parent account types that call this in production.
5. **Not verified:** the actual on-screen render in the Expo app — no simulator/device environment available in this session to visually confirm. Verified the data layer (backend contract) and the code (clean diff, type-safe, mirrors an already-proven merge pattern) instead.

**Student-tagged rows (22) and the third-tier `school_strategies`/fork-on-touch system remain out of scope for this fix** — those were already reaching users via other paths per the original review; only the confirmed-orphaned teacher/parent content was addressed here.

### A10. Website claims — mostly already fixed live *(Section 7 #6)*
Checked live via `curl`: the stale local copy's "Now on iOS & Android" claim is already corrected live to "Now in Beta — iOS & Android" (honest); the stale copy's raw "SMS alerts" fallback text is already corrected live to "Wellbeing alerts" (only a harmless invisible HTML comment remains at line 550). No fix needed for either. The school pricing mismatch originally flagged here is now tracked as L2/L3 above (and reclassified: backend was wrong, not the site).

**Fix:** optional — remove the stale `<!-- SMS alerts -->` comment for cleanliness. Nothing else required.

### A11. Portal.html fragility — standing risk, no quick fix *(Section 7 #7)*
5,770-line hand-edited file, string-concatenated HTML, inconsistent escaping styles (cosmetic, not currently broken). The file's own version comment documents a prior incident where one missing brace broke the *entire* portal (60+ nested functions, blank/unclickable tabs) — real evidence of fragility. No build step, no linting, no local diff against cPanel.

**Fix:** not urgent, but plan a longer-term move to versioned `.js` files so syntax errors are catchable pre-upload.

### A12. PIN/auth model — handover's description was wrong; code is fine *(Section 7 #8)*
Verified `server.py:7321-7353`: PIN required for the 4 `ALWAYS_OPEN_PINS` demo accounts and for `admin`/`superadmin` roles via `ADMIN_PIN`; everyone else uses password/OAuth, no PIN. Opposite of what the handover claimed, but the actual behavior is coherent and needs no code change.

**Fix:** correct the handover doc only.

### A13. Cleanup, no dependencies
- `backend/server_backup.py`/`server_old.py` (6,548 lines each) — untouched since the repo's first commit, not referenced by `Procfile`/`railway.toml`/any import. Safe to delete.
- `/creatures/analytics` (`server.py:10891-10933`) — correctly superadmin-gated; N+1 query pattern building `top_users`/`top_schools`, and groups schools by raw `school_name` string (fragile to spelling/casing variants, e.g. the "St Lucy's " trailing-space example already in `school_profiles`) rather than a canonical school ID. Code-quality, not correctness.
- **`demo_school_001`** (email `demo@schoolportal.app`) — duplicate seed `school_admin` row for "Sunshine International School", found while executing L4. Created 21 minutes before the real demo account (`schooladmindemo@classofhappiness.com`, `44bf76b1-c0ee-49d5-bc68-3e47bb5cf8b3`, the one documented in COH-HANDOVER.md Section 2 and actually used for logins). `demo_school_001` isn't referenced by the handover, isn't the account the 3 Sunshine teachers were backfilled against, and appears to be an unused leftover from seeding. Confirm it's genuinely orphaned (no other rows reference `demo_school_001` as their `school_admin_id`) before deleting.

### A14. Crash on parent "My Wellbeing" screen — `.map(resolveName)` argument leak — ✅ DONE 2026-08-19, live-tested via real device
**File:** `frontend/app/parent/my-wellbeing.tsx:390,597`

Found by Jono real-device-testing tonight's A9 fix (not part of the original review — surfaced during verification). `resolveName(id, customNames?, t?)` was passed directly as an `Array.prototype.map` callback in two places. `map` always calls its callback as `(element, index, array)` — three arguments — so the array itself landed in `resolveName`'s third parameter (`t`). A non-empty array is truthy, so `if (t)` passed, then `t('strat_' + id)` tried to call the array as a function, throwing `"t is not a function (it is an object)"` — exactly the crash reported, at exactly the reported line. Confirmed unrelated to tonight's A9 fix itself (this file wasn't touched by it) — the other `resolveName` definitions elsewhere (`parent/alerts.tsx`, `parent/linked-child/[id].tsx`) only take a single `id` param, so the same `.map(resolveName)` pattern is harmless there.

**Fix:** wrapped both call sites in an arrow so only `id` gets passed (`.map((id: string) => resolveName(id))`), matching how every other caller already uses it.

**Verified:** diff reviewed in full before applying (isolated to exactly the two call sites); `tsc --noEmit` shows only a pre-existing, unrelated error in this file. No RN simulator/device available in this session to visually run the app (Playwright's bundled Chromium doesn't support this host's macOS version) — instead reproduced the exact error and confirmed the fix with a plain Node.js repro of the isolated `.map()` logic: buggy version throws `"t is not a function"` verbatim, fixed version resolves cleanly. Confirmed by Jono on a real device afterward.

### A15. "Most used strategies" showing raw UUIDs instead of names — ✅ DONE 2026-08-19, live-tested
**File:** `frontend/app/parent/my-wellbeing.tsx:73-96` (`fetchStrategyNames`)

Also found by Jono real-device-testing tonight. Traced via real production data (`family_zone_logs`, the actual table parent self-check-ins write to): the account's most recent entry (2026-08-18, i.e. that same testing session) had `strategies_selected: ["410a7a20-...", "074eee48-...", "1617e2c0-..."]` — real Supabase UUIDs. `074eee48...`/`1617e2c0...` resolved to `admin_teacher_strategies` rows "Routine check"/"Calm the environment" — parent-tagged content that only became selectable *tonight*, via the A9 fix. `resolveName`'s name-lookup chain (translation key → `strategyNames` state → hardcoded `STRATEGY_NAMES` dict → raw-id cleanup fallback) had no path to these: `strategyNames` is built from `GET /strategies`, which only ever queries the `helpers`/`custom_helpers` tables — it has never queried `admin_teacher_strategies` at all. So every parent strategy surfaced by tonight's A9 fix was guaranteed to display as a raw UUID here, by construction, until this fix.

(The third UUID, `410a7a20...`, resolved to a personal custom strategy ("Water Garden") that — confirmed live — `GET /strategies?zone=yellow` already returns correctly; that case was most likely just a casualty of the A14 crash preventing the section from ever finishing its render, not a separate name-resolution gap.)

**Fix:** extended `fetchStrategyNames()` to also fetch `GET /admin/teacher-strategies?strategy_type=parent` (same endpoint/pattern as the A9 fix) and merge those `id → name` pairs into `strategyNames` alongside the existing ones.

**Verified:** diff reviewed before applying (isolated addition, no changes to existing fetch logic); `tsc --noEmit` shows only the same pre-existing unrelated error as A14. Live-tested directly against production: called the new endpoint with a real parent token and confirmed both real problem UUIDs from tonight's actual check-in history (`074eee48...`, `1617e2c0...`) now resolve to their correct names ("Routine check", "Calm the environment") instead of the raw id.

### A16. Creature submission code accepted no real validation until after photo upload — ✅ DONE & LIVE-VERIFIED 2026-08-20
**Files:** `backend/server.py` (new `GET /creatures/validate-code/{code}`), `frontend/app/student/submit-creature.tsx`

Found and reported by Jono, unrelated to the original review. The code-entry screen's "Continue" button was gated only by a client-side `code.length < 6` check — no backend call at all — and even that threshold was wrong (real codes are 8 characters, generated by `generate_submission_code(length=8)`). The actual code check (existence, `used_count >= max_uses`, expiry, all against the `submission_codes` table) only ran at the very last step, inside `POST /creatures/submit` — meaning a student could complete the tutorial, fill in name/description/emotion, and upload all 4 stage photos (real network/bandwidth cost) before ever finding out the code was bad, with a fairly technical error message.

**Fix:** added `GET /creatures/validate-code/{code}`, reusing the exact same validation `/creatures/submit` already does, without creating a submission. The code-entry screen now calls this before advancing past the code step, showing the real reason ("Invalid code" / "Code has expired" / "Code has been used too many times") immediately. Also corrected the length gate to 8 characters to match real codes.

**Verified:** diff reviewed before applying (isolated to the code-entry step and the new endpoint); `python3 -m py_compile` and `tsc --noEmit` both pass clean, no errors at all in either changed file (not even pre-existing ones). Committed and pushed (`cab54ea`). Live verification was blocked the night this was written by a Railway platform-wide incident (deploys stuck in "Sleeping · Queued") — **re-verified live 2026-08-20** once Railway recovered: confirmed the deploy picked up the change (fresh deployment ID), then tested both cases directly against production — `GET /creatures/validate-code/ZZZZZZZZ` (garbage) → `{"valid":false,"reason":"Invalid code"}`; generated a real code via `POST /creatures/generate-code` as a real teacher account (`GAKAT22J`) and validated it → `{"valid":true}`. Both paths behave exactly as designed.

### A17. Admin PIN entry fails after a fast password→unlock sequence — race condition, exposed (not caused) by today's L1 fix — ✅ DONE 2026-08-20, verified against the real backend contract
**File:** `frontend/app/admin/dashboard.tsx`

Found and reported by Jono, unrelated to the original review — surfaced while testing today's L1 security fix. `AdminDashboard`'s `authToken` starts `null` and is only populated asynchronously:
```js
const [authToken, setAuthToken] = useState<string|null>(null);
useEffect(() => {
  AsyncStorage.getItem('session_token').then(t => setAuthToken(t));
}, []);
```
Neither the PIN input nor the "Unlock" button is gated on this load finishing. If `unlock()` fires before the `AsyncStorage` read resolves, `apiCall('/admin/verify', null, ...)` sends the request with **no Authorization header at all** (`apiCall` only sets it `if (token)` — a falsy token means the header is simply omitted, not sent as a literal "Bearer null"). The backend's `get_current_user` then finds nothing, `/admin/verify` returns `401`, and `unlock()`'s `catch` block fires.

**This is why it's connected to L1, without L1 having caused it:** before today, that `catch` block contained the hardcoded bypass L1 removed — so this exact race condition was already happening, just silently papered over by insecure auto-grant. Today's fix (correctly) replaced that bypass with a real error message and a real denial — which means this pre-existing timing bug is now visible as a hard failure for the first time, instead of a silent (if insecure) success. `settings.tsx` has a "Set Password" flow immediately followed by the "Admin Dashboard" entry point further down the same screen — setting a password then quickly tapping into Admin Dashboard and typing a PIN is exactly the kind of fast sequence that could beat the async token load, matching "PIN entry not working after password entry" precisely.

**Proposed fix:** don't let `unlock()` proceed (or show a brief loading state) until `authToken` has actually finished loading — e.g. gate the Unlock button on an `authTokenLoaded` flag set once the `AsyncStorage` read resolves, or have `unlock()` read the token synchronously/fresh right before calling `/admin/verify` instead of relying on component state that might not have settled. Since this touches the auth-unlock path L1 just secured, re-verify the full L1 fix (real login → real PIN → unlock) alongside this fix, not just the race condition in isolation, before considering it done.

**What was actually done (2026-08-20):** took the second option — `unlock()` now reads the session token fresh via `AsyncStorage.getItem('session_token')` at the exact moment of the call, instead of trusting the `authToken` component state, which removes the race at its source rather than adding a loading gate around it. `authToken` state is left untouched everywhere else in the file (its other uses only run after `unlocked` is true, well past any race window). Diff is a single isolated change to `unlock()`; `tsc --noEmit` shows the same 3 pre-existing errors as always in this file, none near the edit.

**Verified against the real backend contract** (no RN simulator/device available in this environment to literally reproduce the fast-tap race in a running app, so verified what each code path actually depends on instead) — all 4 distinct outcomes confirmed live against production:
- Real superadmin token → `{"valid":true,"is_super_admin":true}` → unlocks as superadmin.
- **No token at all** (the exact race-condition scenario) → `401 Not authenticated` → frontend's `catch` block → "Could not verify" shown, not a false unlock. This is what re-verifying L1 alongside this fix was for: confirms the security fix and this race-condition fix are both correctly in effect together.
- Real school_admin token → `{"valid":true,"is_super_admin":false}` → unlocks at school_admin level.
- Real non-admin-role token (tested with a teacher account) → `{"valid":false}` → "Invalid code" shown — correctly distinct from the network-error message, not conflated with it.

**Side-finding, not part of this fix:** `/admin/verify` never actually inspects the `adminCode` value the user types — access is purely role-gated server-side (`role == "superadmin"` / `role in ("school_admin","admin")`). The PIN field is effectively decorative today as long as the logged-in account already has the correct role. Not a new vulnerability (still gated by real authentication + role), just an unused input — flagged for awareness, not treated as a bug to fix here.

---

### A19. [PRIORITY — ADMIN ACCESS] Admin unlock skipped PIN entry entirely — root-caused, fixed, and live-verified — ✅ DONE 2026-08-20
**File:** `backend/server.py` (`/admin/verify`)

**Reported by Jono, real device:** logged in as `jono@classofhappiness.com` (the superadmin demo account) and pressed "Unlock" on the admin PIN screen — it went straight through to the admin dashboard with **no PIN code typed at all**.

**Root cause, fully traced — A17 is not broken; theory 2 confirmed, theory 1 ruled out.**
1. **`ALWAYS_OPEN_PINS` (theory 1) is a dead end for this account.** Live Supabase check confirmed `jono@classofhappiness.com`'s `role` is `superadmin`. `/auth/email-login`'s PIN check (`server.py:7511-7519`) is an `if role in ("admin","superadmin") ... elif email in ALWAYS_OPEN_PINS`, so the role branch matches first and `ALWAYS_OPEN_PINS` never fires for this account — it's only reachable for non-admin roles (e.g. the demo `school_admin`/parent/teacher accounts). Confirmed live: `ADMIN_PIN` (checked via `railway variables`) is `COH2026JONO` — the actual PIN required and typed at login was real.
2. **A17's own side-finding (theory 2) is the exact and complete cause.** `/admin/verify` (added `7627c0d`, "Real fix Aug 14") never read `code` from the request body at all — it granted `valid:true` purely from `get_current_user(request).role`, by deliberate design ("since the caller already has a real session token... no separate PIN needed"), predating A17 by a week. Frontend's `unlock()` sends `{code: adminCode}` with no non-empty check before calling it. Session tokens live 30 days in `AsyncStorage` (`server.py:7548`). Net effect: once logged in (with a real PIN, at login), the in-app "Unlock" screen — which visually implies a second PIN checkpoint — accepted anything, including empty, for up to 30 days per session, because the code was never inspected server-side.

**A17 confirmed NOT at fault** — its token-freshness fix is unrelated and still correct; re-verified alongside this fix (scenario 5 below).

**Decision (Jono): Option A — make the PIN a real second factor again, additive on top of the existing session+role check, not a replacement for it.**

**What was actually done:**
`/admin/verify` now requires the role check to pass (unchanged) **and** a matching PIN:
- `superadmin`/`admin` roles → compared against `ADMIN_PIN` env var (same value already required at login — no new secret).
- Accounts whose email is in `ALWAYS_OPEN_PINS` (covers the demo `school_admin`, `schooladmindemo@classofhappiness.com`) → compared against that account's own fixed value.
- **Real (non-demo) `school_admin` accounts intentionally left on the role-only check — Path 1, deliberate, not an oversight.** Live-checked who this actually affects: `kairos@classofhappiness.com` and `send@kairosmontessori.com` (a real school, Kairos Montessori) plus the orphaned `demo_school_001` (A13) have zero PIN infrastructure anywhere today — neither at login nor here. Inventing a shared/per-school PIN for them now was explicitly scoped out by Jono as a separate future feature (how a school admin would learn the PIN, reset flow, etc. — real design questions, not bundled into this additive fix).
- Frontend required **zero changes** — `unlock()` already had `if (d.valid) {...} else Alert.alert('Invalid code')`; the gap was entirely that the backend always returned `true`.

**Verified — full matrix run live against production, after deploy:**
1. Superadmin, correct PIN (`COH2026JONO`) → `{"valid":true,"is_super_admin":true}` ✅
2. Superadmin, **empty PIN — the exact original repro** → `{"valid":false,"is_super_admin":false}` ✅ (previously this returned `true`)
3. Superadmin, wrong PIN → `{"valid":false}` ✅
4. No token at all (A17's own race-condition scenario, re-confirmed still correctly denied) → `401 Not authenticated` ✅
5. Demo school_admin, correct PIN (`COH2026DEMO`) → `{"valid":true,"is_super_admin":false}` ✅
6. Demo school_admin, empty PIN → `{"valid":false}` ✅
7. Real (non-demo) school_admin (`kairos@classofhappiness.com`), empty PIN → `{"valid":true,"is_super_admin":false}` ✅ — confirms Path 1 genuinely unchanged, no regression for real customers.
8. Real school_admin, arbitrary random code → still `{"valid":true}` ✅ — same reasoning, role-only as designed.
9. Unrelated role (teacher) → `{"valid":false}` ✅ — unaffected by this change, as before.

All 9 scenarios matched expectations exactly. Diff reviewed and approved before applying (shown in full, no changes to session handling, A17's fix, or the general auth flow — purely additive). `python3 -m py_compile` clean. Deployed via `git push` (`a3a2539`), confirmed live via a fresh Railway deployment ID before testing. **Not yet visually confirmed on-device** — no simulator available in this environment; verified against the real backend contract instead, same methodology as A17. Frontend code required no changes, so no new client-side risk was introduced.

---

### A18. "Today" range pill on parent "My Wellbeing" showed a mislabeled 7-day count — root-caused, fixed, and live-verified — ✅ DONE 2026-08-19
**File:** `frontend/app/parent/my-wellbeing.tsx` (`loadData`)

**Reported by Jono, real device:** family/parent screen showed "3 check-ins today" for the family member Madalena when only 1 real check-in actually happened. Turned out not to be the family dashboard (`parent/dashboard.tsx`) at all — traced to the per-member "My Wellbeing" screen (`my-wellbeing.tsx`), reached via each adult family member's "Wellbeing" button.

**Scope check done first:** verified `parent/dashboard.tsx`'s own multi-source check-in fetch (`fetchMemberData`, covers `relationship==='child'` family members + school-linked children) separately — its 3 backend calls (`GET /zone-logs/student/{id}`, `GET /family/zone-logs/{id}`, `GET /parent/linked-child/{id}/all-checkins`) all correctly declare and honor a `days: int` query param matching what the frontend sends. **That path is unaffected** — this bug is isolated to the one `my-wellbeing.tsx` screen. (Also ruled out: Madalena is `relationship: 'partner'`, not `'child'`, so she was never in `fetchMemberData`'s scope in the first place — this initially misdirected the investigation toward the wrong file before the real screen was found.)

**Root cause: a query-parameter contract mismatch, not a fan-out or duplicate-data bug.** `loadData()` sent `?start=<ISO>&end=<ISO>` to `GET /family/members/{member_id}/checkins`, computed from whichever range pill (Today/7/14/30 days) was selected. The backend endpoint (`server.py:9690-9691`) only ever declared `days: int = 7` — it never read `start`/`end` at all, and FastAPI silently drops query params that don't match a declared parameter. Every range pill therefore always returned the same hardcoded last-7-days window, mislabeled with whatever pill happened to be selected. Confirmed live before fixing: hit the endpoint with the app's exact "Today" request (a real 24-hour window) and it still returned 3 rows — 1 from today plus 2 from exactly 7 days earlier, which is precisely what Jono saw.

**Fix:** `loadData()` already computed `const days = parseInt(range)` locally one line above the fetch — it just wasn't being sent. Changed the request to `?days=${days}`, matching the `days: int` convention every other check-in endpoint in this codebase already uses. Confirmed via grep this is the *only* caller of this endpoint sending `start`/`end` — the endpoint's other two callers (`linked-child/[id].tsx`, `family-member-stats/[id].tsx`) already correctly sent `days=`, so this was an isolated outlier, not a wider pattern. No backend change needed — the endpoint already correctly implemented `days`, it just never received it.

**Verified:** diff reviewed before applying (4-line change, isolated to the one fetch call, no other logic touched); `tsc --noEmit` shows only the same pre-existing, unrelated `useWindowDimensions` error already present in this file all session. This is a frontend-only change — no backend deploy needed. Live-tested all 4 range pills against production with the real fixed request shape: `days=1` → 1 (correct, was 3), `days=7` → 3, `days=14` → 4, `days=30` → 4 — each now genuinely distinct and matching the real underlying data, where before every pill silently returned the same number. Committed and pushed (`b78d20d`).

---

# FEATURES BUILT (outside the original review scope)

### F1. Kids' voice recording playback on colour/helper check-in buttons — ✅ DONE 2026-08-19, live-verified
**Files:** `backend/server.py` (`GET /voice-clips`), `frontend/src/utils/voiceClips.ts` (new), `frontend/src/components/VoiceToggleButton.tsx` (new), `frontend/app/student/zone.tsx`, `frontend/app/student/strategies.tsx`, `frontend/app/settings.tsx`

Real narrated audio (Matilda in English, Mateus in Portuguese) now plays automatically when a student taps a colour on the check-in zone screen or selects a helper strategy. English and Portuguese only — the other 4 app languages silently skip playback since no clips exist for them yet, by design (same "missing key → skip" path used for unfinished Portuguese clips).

**Storage decision:** no new DB table. `GET /voice-clips?language=X` lists the `voice-recordings` Supabase Storage bucket directly and returns `{clip_key: url}` for whatever's actually uploaded — replacing or adding a clip is the only step ever needed; nothing else can drift out of sync with it (the kind of dual-source-of-truth drift this review repeatedly found elsewhere, e.g. A7, A9).

**Bucket reorganization:** the bucket Jono had already created (`voice-recordings`, not `voice-clips` as first proposed — caught and corrected before building) held 50 real `.m4a` files flat at the root, human-named (`Blue_emotions.m4a`, `Ajudar_um_amigo.m4a`, etc.), not organized by language or matching the 28 canonical `clip_key` IDs (4 colours + 24 helpers, from `DEFAULT_HELPERS`). Listed the full inventory live, mapped every file to its canonical key by content (2 ambiguous matches — `Drink_water.m4a`→`blue_2`, `Continua_assim.m4a`→`green_1` — confirmed with Jono before moving anything), and moved all 35 real clips into `{language}/{clip_key}.m4a` via the Storage move API. Fixed two filename hazards in the process: a literal `&` in `Squeeze_&_release.m4a` and a trailing space in `Emocoes_Vermelhas .m4a` — both gone once renamed to plain `clip_key` names. Left 15 non-matching clips (greeting/praise/closing lines — `Well_done`, `See_you_tomorrow`, `Como_te_sentes_hoje`, etc.) untouched at the bucket root; Jono confirmed these are for a future phase (check-in start/completion screens), not this build.

**Coverage after reorganization:** English 27/28 (missing only the `green` colour clip). Portuguese 8/28 (4 colours + 4 of 6 green-zone helpers; all blue/yellow/red helper clips still pending from Mateus) — matches what Jono described going in.

**Playback + mute:** `voiceClips.ts` mirrors the existing (but previously unused/unwired) `sounds.ts` pattern. One persisted setting (`AsyncStorage`, device-local — not synced to the account, since check-in devices are often shared classroom tablets) with two entry points: a Settings toggle and a quick per-screen mute button on both check-in screens, rather than two states that could drift apart. Helper audio fires only when a card is *selected*, not deselected. Both of the app's two different strategy-ID schemes (`blue_1` from the real backend data, `b1` from the frontend's hardcoded emergency fallback) are normalized to the same clip key at lookup time, so playback doesn't silently break depending on which source a strategy card came from.

**Verified:** `python3 -m py_compile` and `tsc --noEmit` clean on every touched/new file (zero errors, not even pre-existing ones). All 35 reorganized Storage files confirmed publicly fetchable (200, correct `audio/x-m4a` content-type) via direct HTTP checks before and after deploy. Live-tested `GET /voice-clips` against production for both languages post-deploy: English returns exactly 27 keys, Portuguese exactly 8, an unsupported language (`es`) returns `{}` cleanly. **Not audio-tested in a running app** — no simulator/device available in this environment, so playback itself (does it actually sound right, timing, volume) hasn't been confirmed — only that the URLs, manifest, and code are correct. Committed and pushed (`c5ba4cc`).

**Not built yet, explicitly out of scope for this pass:** the 15 future-phase greeting/praise clips (F1 follow-up, whenever those screens get their own audio treatment); backend translation-dict entries for the new `t('voice')`/`t('voice_narration')`/`t('voice_narration_desc')` keys (currently rely on the English fallback string, same as many other keys in this app — not a functional gap, just unpolished for non-English Settings screens).

---

# POST-LAUNCH
*(Explicitly deferred by Jono — record only, no work now.)*

### P1. Multi-currency / country-adjusted pricing
Launch is **EUR-only**. AUD figures currently exist in `SUBSCRIPTION_PLANS` (`price_aud` fields, `server.py:44-79`) as leftover/parallel values — leave as-is for now, don't extend or fix them as part of L2/L3. Deferred work for later: real multi-currency support, purchasing-power-adjusted pricing by country, and a public-vs-private-school pricing distinction. For now, affordability cases are handled manually via NGO grants and ad hoc discounts, not through product-level pricing tiers.

### P2. UX/polish backlog — from real-device testing, 2026-08-20
Record only, no investigation or design done yet. All raised by Jono during real-device testing tonight, alongside A18/A19 above.

- **Creature submission placement** — move the creature-submission entry point inside the existing "My Creatures" button/modal rather than (or in addition to) its own dashboard shortcut icon — the current purple-icon shortcut is overlapping with other dashboard elements on real devices. Revisit the placement decided for the creature-submission-shortcut feature.
- **Classroom code — copy-to-clipboard.** Add a copy icon next to the classroom join code so teachers/parents don't have to manually retype it.
- **Missing loading indicator, Family dashboard.** No emoji/spinner loading state shown while the family dashboard's data is fetching — screen likely appears blank or frozen during load.
- **School contact details not editable.** Neither superadmin nor school_admin currently has a way to edit a school's contact details (address/phone/email or similar) — needs a real UI path, not currently exposed anywhere in app or portal.
- **Analytics: school-specific stats + colour-over-time graph.** Current analytics are aggregate; want the ability to drill into a single school's stats specifically, plus a graph showing zone-colour trends over time (not just point-in-time counts).
- **Future idea: "team sharing" PDFs.** Rough concept, not scoped — some way to share PDF reports with a wider team/group rather than one-to-one. Needs real scoping before it's actionable.

---

## SUGGESTED EXECUTION ORDER

1. **L1** — ✅ DONE 2026-08-18 — hardcoded bypass removed, verified against real login. Not yet deployed (no push/rebuild done).
2. **L2 + L3 together** — ✅ DONE & VERIFIED 2026-08-18. Deployed, tested end-to-end against Stripe test mode (checkout → webhook → subscription_status/plan), and a real pre-existing webhook bug (`.get()` on Stripe objects) was found and fixed in the same pass — see both sections above for full detail. Remaining: Jono to create the 3 school Stripe products/Payment Links (manual sales flow, not blocking), and upload the corrected website copy to cPanel.
3. **L4** — ✅ DONE 2026-08-18 — school identity backfill + dual-match audit, verified live.
4. **A1** — ✅ DONE 2026-08-18 — dead duplicate routes merged/removed, verified, not yet deployed.
5. **A4** — ✅ VERIFIED RESOLVED 2026-08-18 — re-checked against the live portal.html, no code change needed.
6. **A2 item 1** — ✅ DONE 2026-08-18 — legacy admin.html retired (closed A5's admin.html instance, resolved A6's cross-surface conflict). A2 items 2-3 (Wellbeing Tracker/Team/Services app parity, Settings tab decisions) still open — Jono's product call.
7. **A3** — ✅ DONE 2026-08-18 — backend/portal confirmed complete and live-tested, no build needed. Mobile-parity question left open, not urgent, Jono's product call whenever.
8. **A9** — ✅ DONE 2026-08-18 — teacher fix (add missing type filter) and parent fix (build missing fetch) both applied and live-tested against production with real teacher/parent accounts. Not yet deployed; on-screen render not visually confirmed (no simulator available this session).
9. **A7** — ✅ DONE 2026-08-19 — frontend TSX/TS sweep complete (shared constants file + all genuine zone-colour declarations across `frontend/app`+`frontend/src`, see A7 section). Backend Python dict + portal.html remain out of scope for this item, tracked separately.
10. **A5** — ✅ DONE 2026-08-19 — portal.html audit complete, same unescaped-innerHTML pattern confirmed in all 4 requested areas (Users, Schools, Alerts, Wellbeing Tracker) plus an attribute-context escaping gap, fixed with a shared `esc()` helper. Not yet deployed — dated upload copy left on Desktop for Jono to push to cPanel.
11. **A8** — PDF gating — family PDF stays ungated by decision (see L3); still open for school-overview/classroom-overview routes.
12. **A6** — ✅ DONE 2026-08-20 — turned out to be a live privilege-escalation path, not just dead-code cleanup: removed the self-serve `admin` role entirely (4 grant paths, ~20 endpoints treating it as superadmin-equal), then found and removed two more severe, previously-unaudited self-serve endpoints (`/auth/promote-superadmin`, `/auth/promote-school-admin`) plus the app UI exposing them to every user. Both rounds live-verified against production.
13. **A11** — portal fragility — standing risk, plan separately, no fixed timeline.
14. **A12** — doc correction only.
15. **A13** — cleanup, anytime.
16. **P1** — do not schedule; revisit after launch.
17. **A14** — ✅ DONE 2026-08-19 — parent My Wellbeing crash fixed, live-tested and confirmed by Jono on a real device. Found during real-device testing of A9, not part of the original review.
18. **A15** — ✅ DONE 2026-08-19 — "most used strategies" raw-UUID display fixed, live-tested against real production check-in data. Same discovery session as A14.
19. **A16** — ✅ DONE & LIVE-VERIFIED 2026-08-20 — creature submission code now validated before the full flow, not after. Confirmed live against production with both a real generated code and a garbage one.
20. **A17** — ✅ DONE 2026-08-20 — admin PIN race condition fixed (reads session token fresh instead of racy state), all 4 outcome paths verified against the real backend contract, including re-confirming L1's security fix still holds alongside it.
21. **A19** — ✅ DONE 2026-08-20 — root-caused (A17's own side-finding was the exact cause, not a regression), real PIN check restored on top of the existing session+role gate, deployed and verified against 9 live-production scenarios. Real (non-demo) school_admin accounts intentionally left role-only (Path 1) — a per-school PIN is a separate future feature.
22. **A18** — ✅ DONE 2026-08-19 — root-caused to a query-param mismatch on the parent "My Wellbeing" screen (not the family dashboard as first suspected), fixed by sending the already-computed `days` param instead of unread `start`/`end`, live-verified all 4 range pills against production.
