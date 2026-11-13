# HMAPP admin screens, round two (lane DA)

Written 13 Nov 2026 by admin lane DA (Claude, Opus 5.5) in the worktree `admin_redfit/.claude/worktrees/hmapp3`
(detached at main `c416ee9`). Plan: `growcord-rs/docs/briefs/HMAPP-3-growth.md` point 11 and the admin side of points 4,
6, 7, 8, 9 and 10, plus the owner's App tracking decision of 13 Nov (sent by the coordinator). Nothing committed. The
round one screens and their notes are in `docs/HMAPP-admin.md` (kept as written).

## 1. Round one brought onto this admin

The earlier lane's work (worktree `hmapp`, at `80fa666`) was applied whole: its tracked diff (13 files) applied cleanly
with `git apply`, and its 25 untracked files were copied. The six commits between `80fa666` and `c416ee9` touch 9 files
(order, refund and return screens, `Connections.tsx`), none of them in that work, so nothing conflicted and no newer
admin work was changed. Screens: Partners, Mobile App settings, App Audience, the feed queue, the B2B tabs (business
types, application facts, quotes, team), Customer Orders, the dispatch calendar card, the WhatsApp app customers card,
and the shared pieces (`ReasonDialog`, `CatalogItemPicker`, `LocaleWordsEditor`, `RateInput`, `MoneyInput`).

The 404 helper (`lib/v2/erp.ts` `isNotServed`) checked against today's backend: the host answers an unmounted route
(404 and 405 alike) with `RESOURCE_NOT_FOUND` "No such route" (`hosts/api/src/serve.rs`); an app's own missing record is
a dotted code (`commerce.not_found`), as the earlier change assumed. But the kernel's record layer also answers
`RESOURCE_NOT_FOUND`, with "<Entity> not found" (`lib/kernel/resource/src/resource/ops.rs`), which the helper took for
"not served". Extended: `RESOURCE_NOT_FOUND` is "not served" only with "No such route" (or no words); any other 404 with
it is a real answer and shows the server's words.

## 2. New screens and changes

| Screen | Path, menu | Server (lane) | Read; write |
|-|-|-|-|
| App analytics | `/analytics/app`, Analytics, App | `GET /api/v2/insights/app/analytics?from&to` (BB) | `orders.read`, module analytics |
| App answers card | customer page `/customers/{id}` | `GET /api/v2/commerce/customers/{id}/app-answers` (BB) | `customers.read` |
| Audience report | `/settings/app/audience?tab=report`, third tab | `GET /api/v2/commerce/app/audience/report` (BB) | `reports.read` |
| App offers | `/app/offers`, Marketing, after Coupons | coupons with `sales_channels` `["app"]` (BA, tenant 450) | `marketing.read`, module coupons; `marketing.manage` |
| Coupon form and list | `/coupons/new`, `/coupons/{id}/edit`, `/coupons` | `/api/v2/commerce/coupons` fields `sales_channels`, `first_channel_order` (BA) | as coupons |
| Feed approval | `/app/feed`, source switch Store reels or Instagram | `GET /app/feed/review?kind=instagram`, `POST /app/feed/review/instagram/{media_id}/approve`, `/refuse` (BC, tenant 461) | `content.read`; `content.manage` and a person |
| App assistant and scan | `/settings/app/assistant`, Settings | `GET /app/assistant`; `GET, PUT /app/assistant/settings`; `GET /app/assistant/usage?days` (BC, tenant 460); switches through `PUT /app/settings` | `settings.read`; `settings.manage` and a person |
| App tracking and integrations | `/settings/app/tracking`, Settings | `GET /api/v2/marketing/app-events/destinations`, `PUT .../destinations/{key}` `{enabled}` (BB, always mounted) | `settings.read`, module connectors; `settings.manage` and a person |

What each does:
- App analytics leads with up to three decisions computed from its own figures (app share of sales, the step where
  most sessions stop, the share of searches that found nothing), then installs, devices, app orders and sales with the
  change against the period before, app against website (orders, sales, buyers), installs and devices by day, the
  funnel in the server's step order ending with `ordered`, searches by the way people searched (the server keeps no
  search words), install sources (channel, source, campaign, partner), platforms, and buyers who buy again.
- The app answers card and the report show the server's own names (persona label, catalogue name) and its state
  word (`plane_off`, `not_kept`, `no_person`, `not_answered`, `consent_withdrawn`) in a sentence. Answers show only
  while consent is in force; the report names nobody.
- App offers is not a second editor: BA built the app only discount as a coupon limited to the app. The coupon form
  gains "Where can it be used" (everywhere, only website orders `online_store`, only app orders `app`; both saved
  together kept as saved; BA allows at most those two) and "Only the customer's first order there"; it sends the two
  fields only when the coupon it read carried them or the person set them, because a server before tenant 450 refuses
  a field it does not know. The list marks "App only". App offers lists every coupon limited to the app (read page by
  page with the Coupons page's own loader, `fetchAllCoupons`) and links to the form (`/coupons/new?channel=app`).
- Feed approval: a source switch sends `kind=instagram` (nothing for reels, since the older queue refuses an unknown
  query field); the page answers Instagram items under `instagram`, reels under `items`. An Instagram item shows its
  picture or video (`image_url` is the poster for a video), caption, permalink, when it was posted, its product tags
  with the server's name and picture for each (`FeedReviewTagView`, linked to the product; changed on the Instagram
  page), and whether its files are in the store's storage. Its `id` is null while pending, so decisions go to
  `/instagram/{media_id}`.
- Assistant and scan: what the app can offer now with the server's reason in words (switched off, not set up,
  budget spent, no AI key with a link to the AI key setup, country store), the three switches (saved one at a time,
  the app document read fresh), the daily token budget, per install and per customer limits, the fixed reply words by
  language over the served `word_keys`, and usage by day, purpose and outcome. The server counts tokens, not money,
  and keeps no per request list: the page says so and shows no cost.
- Tracking: BB's list (Meta, whose switch is `metaPixel.appEvents`, and Google Ads; GA4 is not offered, the page says
  why). One switch per destination, off by default; turning on asks first and repeats the server's `sends` and
  `steps`. Each row shows Sending, On waiting for the account, Account connected or Not connected (`enabled`, `ready`,
  `sending`), each `missing` code in words with a link to where it is set (Meta pages; Google's Connections tab), and
  the server's `never_sent` list. A switch may go on before the account is connected (the server keeps it and sends
  nothing until ready).

## 3. Waiting on the backend, and gaps

- None of the new routes is on live yet. Every screen shows "not available on this server yet" on the host's "No such
  route", except the customer page's App answers card, which hides itself there (a store without the app).
- The A+ studio's `frontends` choice still offers the website frontends only; BA's note says the app honours
  `storefront` and `app`. Not changed here (outside this round's screens).
- BC usage has no money figure and no per request list (by design: no personal data). The brief's "cost" is shown as
  tokens; the provider's bill is the money.
- BB analytics has no device return curve; "Who comes back" shows repeat buyers (app and other) from `retention`.
- Codes the server checks but does not serve, kept with their words in one place each: the assistant's reason codes
  (`AppAssistant.tsx`), the answers state words (`AppAnswersCard.tsx`), the feed sources `reel` and `instagram`
  (`AppFeedReview.tsx`), the app channel `app` (`APP_SALES_CHANNEL`, from `app_headers::APP_SALES_CHANNEL`).
- Health words: the server drops search words and only shop events can be forwarded; the screens never show a search
  term unless the server sends one.

## 4. Reused, extended, new

- Reused: the admin kit (`components/erp`), the analytics kit (`panelAnalytics/Kit`, `DateRangeBar`, `vizTheme`),
  `shared.tsx` (`useLoad`, `ErrorNote`, `NotServed`, `ConfirmDialog`, `OnOff`, `whyDisabled`), `useAiStatus` and its
  setup link, `META_ROUTES` and `connectionsHref`, `couponsAPI` and the v2 coupon route row, the Coupons page's
  `fetchAllCoupons` (now exported), `getAppSettings`, `putAppSettings`, `getAppConfig`, `codeLabel`, `localeName`,
  `pruneBlank`, the store date helpers.
- Extended: `isNotServed` (above); the feed queue client (`FeedReel` became `FeedItem`, one shape for both sources;
  `approveFeedItem`, `refuseFeedItem` replace the reel only calls); `setAppSwitch` beside the app document calls; the
  coupon row's spelling spec (`sales_channels`, `first_channel_order`);
  `KIND_WORDS` exported from `CatalogItemPicker`; the coupon form and list; the customer page; the audience page.
- New: `lib/v2/appGrowth.ts` (typed calls for the round two routes and the coupon channel helpers; no earlier client),
  `pages/app/AppAnalytics.tsx`, `AppOffers.tsx`, `AppAssistant.tsx`, `AppTracking.tsx`, `components/app/AppAnswersCard.tsx`,
  `AudienceReport.tsx`.

## 5. Checks

The TypeScript check (`npx tsc`, no emit) and `npm run build` (tsc and vite) pass; the chunk size warning is the base's. No lint config in the
admin. Every added line scanned for dashes, arrows, middle dots, curly quotes and ellipsis characters: none (three
periods appear only as path prefixes in code comments). No screenshots. `node_modules` and `dist` removed afterwards.

## 6. Checked against the backend lanes, and brought onto current main

Written 13 Nov 2026 (evening) by lane DA after the three backend lanes wrote their notes
(growcord-rs `.runs/wt-hm3-a/docs/PORT_NOTES/HMAPP-BA.md`, `wt-hm3-b/.../HMAPP-BB.md`, `wt-hm3-c/.../HMAPP-BC.md`) and
their views were read. Fixed:
- Tracking moved from the guessed `/insights/app/tracking` to BB's `/marketing/app-events/destinations` (fields `ready`,
  `missing`, `sending`, `sends`, `steps`, `setting`, `never_sent`); the Meta only fallback, the Settings Center words
  helper and the `EventSettings.appEvents` extension it needed were dropped. Menu row gated on module connectors.
- App analytics: the funnel is ordered by BB's step list (not the object's key order), with words per step; the
  insight and the App orders tile use the server's `app_share_of_sales` and `app_share_of_orders` (shares of every
  channel); other channels' orders and sales show beside app and website.
- Coupons: "Only orders placed on the website" (`online_store`) added beside the app; App offers reads every page of
  coupons and names a buy 2 get 1 coupon; its menu row is gated on module coupons as Coupons is.
- Assistant: reply lines are kept on one line (BC refuses control characters, 1 to 400 characters).
- Feed: Instagram items say when they were posted; the tags already showed BC's names and pictures.
- Customer page: the App answers card hides where the app routes are not served and for an erased person.
Matched as built: the app answers and audience report (BB), assistant status, settings and usage (BC), feed queue and
decisions (BC), the coupon fields (BA). The orders page's channel filter reads `/sales-channels`, so BA's "App" shows
there with no admin change.

Brought onto admin main in a fresh worktree (first `708e889`, then again on `acb0bd0` when main moved): the change
set applied with three way merge; conflicts in `CouponForm.tsx` and `Coupons.tsx` (MENU-1 coupons rewrote both: the
channel part was rebuilt on the new form's `payload` and the list's State cell), `UserDetail.tsx` (MENU-1 customers'
Store notes card kept, the app answers card after it), `ShippingSettings.tsx` and `B2BApplications.tsx` (MENU-1 b2b's
credit imports and this work's application facts import both kept). `npx tsc` and `npm run build` pass.
