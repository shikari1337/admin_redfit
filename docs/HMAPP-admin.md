# HMAPP admin screens (lane D1)

Written 11 Nov 2026 by admin lane D1 (Claude, Opus 5.5) in the worktree `admin_redfit/.claude/worktrees/hmapp`
(detached at main `80fa666`). Design: `growcord-rs/docs/briefs/HMAPP-design/60-business-partners.md` AD02 to AD09
and `90-review.md`. Nothing committed.

## 1. Screens and where they sit

| Screen | Path | Menu place | Files |
|-|-|-|-|
| AD02 Partner terms, AD03 Applications and partners, AD04 Commissions and payouts | `/partners` (tabs `applications`, `money`, `terms`) | Store Customers, after B2B (`lib/menu.ts`) | `pages/partners/Partners.tsx`, `components/partners/*` |
| AD05 Personas, AD06 Interest groups | `/settings/app/audience` (tabs `personas`, `interests`) | System, Settings, "App Audience" | `pages/app/AppAudience.tsx` |
| AD07 Feed approval queue | `/app/feed` (tabs `pending`, `approved`, `refused`) | Content, after Blog Posts, "App Feed" | `pages/app/AppFeedReview.tsx` |
| AD08 App settings | `/settings/app` (tabs: versions and links, switches, banners, support and sign in, look and prices, legal and privacy, hidden categories, doctor's slips) | System, Settings, "Mobile App" | `pages/app/AppSettings.tsx`, `components/app/*` |
| AD09 Business types | `/b2b`, new tab "Business types" | Store Customers, B2B (existing) | `components/b2b/B2BBusinessTypes.tsx` |
| AD09 Application checks | `/b2b`, Applications, the detail panel gains "From the app" (licence number, GSTIN check with its source, channel, licence files); Reject now needs a reason | existing | `components/b2b/B2BApplicationFacts.tsx`, `B2BApplications.tsx` |
| Business quotes | `/b2b`, new tab "Quotes" | existing | `components/b2b/B2BQuotes.tsx` |
| Business team | `/b2b`, Customers, a customer's detail gains "Team" | existing | `components/b2b/B2BTeamCard.tsx` |
| Customer order words and cancel window | `/settings/customer-orders` | System, Settings, "Customer Orders" | `pages/app/CustomerOrdersSettings.tsx` |
| Dispatch calendar | `/settings/shipping`, a card "When parcels leave" under the fees form | System, Settings, Shipping (existing) | `components/shipments/DispatchCalendarCard.tsx` |
| App customers also on WhatsApp | `/messaging/whatsapp?tab=connection`, a card under the connection | Messaging, WhatsApp (existing) | `components/messaging/AppCustomersWhatsAppCard.tsx` |

Routes are in `App.tsx`; the route gates are derived from the menu entries (`lib/routePermissions.ts`), so each new
path is gated by the permission named below.

## 2. Backend routes used and permissions

Every write button is off, with the reason in words, when the permission is missing; the server refuses anyway.
Errors show the server's words, the field it names and `details.problems` / `reasons` as a list.

| Screen | Routes | Read | Write |
|-|-|-|-|
| Partners | Retain `GET/PUT /api/v2/retain/partners/terms`; `GET /partners`, `GET /partners/{id}`, `POST /partners/{id}/approve`, `/refuse`, `/suspend`, `/resume`, `PUT /partners/{id}/rate`; `GET /partners/commissions`, `POST /partners/commissions/{id}/approve`, `/reject`; `GET/POST /partners/payout-batches`, `GET /partners/payout-batches/{id}`, `POST {id}/quote`, `/approve`, `/paid`, `/cancel` | `marketing.read` | decide, commissions, build, quote, cancel `marketing.manage`; terms and own rate `settings.manage`; approve batch and record payment `accounting.post`, never the builder (four eyes: the button is off for the builder, compared on `built_by` and the signed-in id) |
| App settings | Commerce `GET/PUT /api/v2/commerce/app/settings`, `GET /app/config` (switch names, theme preview, what is in force), `GET/PUT /app/hidden-categories`, `GET/PUT /settings/prescriptions` | `settings.read` | `settings.manage` and a person |
| Audience | Commerce `GET/PUT /api/v2/commerce/app/audience/settings`, `GET /app/hidden-categories` | `settings.read` | `settings.manage` and a person |
| Feed queue | Commerce `GET /api/v2/commerce/app/feed/review`, `POST /app/feed/review/reels/{id}/approve`, `/refuse` | `content.read` | `content.manage` and a person |
| Business types, facts, team, quotes | Trade `GET/PUT /api/v2/trade/business-types`, `GET /applications/{id}/app-facts`, `GET/POST /accounts/{customer_id}/team`, `POST /accounts/{customer_id}/team/{member_customer_id}/remove`, `GET /quotes`, `POST /quotes/{id}/answer`; licence files through the existing attachment routes, record `b2b_application/<customer_id>` | `b2b.read` | `b2b.manage` and a person |
| Customer orders | Commerce `GET/PUT /api/v2/commerce/settings/customer-orders` | `settings.read` | `settings.manage` and a person |
| Dispatch calendar | Ship `GET/PATCH /api/v2/ship/dispatch-calendar` | `settings.read` | `settings.manage` |
| App customers on WhatsApp | Comms `GET/PUT /api/v2/comms/whatsapp/app-customers` | `settings.read` | `settings.manage` |

## 3. Waiting on the backend release

- None of these routes is on the live server: they are uncommitted in `growcord-rs/.runs/wt-hmapp`, `-b`, `-c` and
  mount only with `GC_APP_ROUTES` or `GC_INTL_ROUTES` (both off on live). An unmounted route answers 404
  `RESOURCE_NOT_FOUND`; every screen then shows that it "is not available on this server yet" (`NotServed`). The Partners
  page shows it once for the whole page.
- Release order the screens need: migrations 435 to 444 (T3 to T6 notes), then the API with the app routes on.
  Partners also need Growcord's platform limits (gcsu, lane D2), the store's terms and the app switch `partners`.
- Payout batches cannot be approved or paid until Books books partner payouts (`retain.port_not_wired`, NEW-5) and
  Growcord sets `tds_rule_code` after the CA's answer (`retain.tax_not_configured`); the screen shows both in words.
- Every delivered commission is held for a person until trust signals exist (NEW-11): the Release button covers it.
- GAP NEW-1: partner, commission, batch, quote, team and channel states arrive as codes only; the screens show the
  code made readable, never words the server did not say.
- GAP NEW-8: persona kinds are not served; the kind box offers the codes the lists already use (and
  `persona_kinds` when the server adds it) and the server checks any other.
- GAP NEW-14: no version history read for the app and audience settings; the screens show none.
- Code lists the server checks but does not serve, kept beside their words in one place each until it does: the
  cancel window codes (`CustomerOrdersSettings.tsx`), the licence codes (`B2BBusinessTypes.tsx`) and the team role
  codes (`B2BTeamCard.tsx`). Design owner question 6 (team roles and credit) is still open.
- Not built, no backend for it: a reason on a business type change (the PUT takes none), "GSTIN required" per type
  (not in the backend shape), the type's label as applied on an application (the application keeps the key only),
  a feed queue for posts and blogs (they reach `published` only through a person already, T4b section 3), per store
  sections of the app document (kept unchanged on save; shown as a notice), support topics (`/support/topics`).

## 4. Reused, extended, new

- Reused: the admin kit `components/erp` (Page, SectionCard, TableShell, StatusChip, Money, TabBar, FilterBar,
  AttachmentPanel), `pages/panels/erp/shared.tsx` (`useLoad`, `Notice`, `ErrorNote`, `NotServed`, `ConfirmDialog`,
  `OnOff`, `whyDisabled`), `v2call`, `useTabParam`, `FilterChip`, `SearchBox`, `ImageField`, the existing catalogue
  reads (`brandsAPI`, `categoriesAPI`, `attributeValuesAPI` on `product-form`), `pagesAPI`, `customersAPI` search,
  `majorToMinor` / `minorToMajor`, `scaleDecimal`, the store date helpers.
- Extended: `isNotServed` (a 404 with an app's own dotted code is a real answer; `RESOURCE_NOT_FOUND` is not
  served), `errorText` (module switched off, non-role 403 words, the field), new `errorProblems` / `errorField`
  (`lib/v2/erp.ts`); `ErrorNote` lists problems; `ConfirmDialog` gains `confirmDisabled`; `whyDisabled` names any
  permission; `v2call` gains `keepMoney`; `unscale` exported (`lib/v2/shape.ts`); `AttachmentPanel` gains `readOnly`
  and the `b2b_application` record.
- New (design requests A1 to A4): `ReasonDialog` (shared.tsx), `CatalogItemPicker` and `LocaleWordsEditor`
  (`components/common`), `RateInput` and `MoneyInput` (`components/erp/RateMoneyInput.tsx`); typed calls in
  `lib/v2/partners.ts`, `lib/v2/appSettings.ts`, `lib/v2/business.ts` (no earlier client for these routes).

## 5. Checks

The TypeScript check (`npx tsc`, no emit) and `npm run build` (tsc and vite) pass in the worktree. The admin has no lint script or lint
config. No screenshots. `node_modules` and `dist` removed afterwards.
