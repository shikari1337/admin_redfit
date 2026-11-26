# ADMIN-NAV-1: a compact sidebar, areas with tabs, the same gates

Owner, 26 Nov 2026: "make admin sidebar menu compact and improvise the use expericne by adding existing and
morefeatures. and tabs and interal ui and other so according to artitectecture ecverything acceassbile at easy
with proper security and need to know basis"

Owner's pattern for Growcord Ship, the same day: "instead of 5 options in sidebar create options on top as tabs or
inner sidebar". This lane takes that pattern (src/pages/growship/GrowshipLayout.tsx) to the whole admin.

Branch `admin-nav`, worktree `.claude/worktrees/admin-nav`, base origin/main 7f40050. Admin only: no backend
permission, no backend route and no App.tsx route changes.

## 1. What is there today (read 26 Nov 2026)

- ONE table drives the sidebar, the route guard and the command search: `src/lib/menu.ts` (MENU, OFF_MENU,
  EXTRA_ROUTES, GROWSHIP_TABS, GROWSHIP_MORE). `src/lib/routePermissions.ts` derives the route gates from it, first
  writer wins, longest prefix matches. `src/components/menu/menuAccess.ts` decides what a person sees (permitted:
  any one permission; moduleOn: every module).
- 8 groups, 48 sidebar rows, folds that open to about 150 links (Settings 27, Products 12, Orders 12, Analytics 9,
  Inventory 8, Marketing 36 across 7 sub groups).
- 64 working routes are only in OFF_MENU, reached by buttons on pages. The command search lists the top level rows
  and the Growcord Ship tabs only: no fold child, no OFF_MENU page.
- No page draws a route level tab strip for its sibling pages except Growcord Ship (its own layout) and Pricing (its
  own four sub routes under one tab). Payments has header buttons to Settlements, Analytics, COD payouts and
  Requests; they stay (never remove a working control). Messaging, Settings Center and others have in page tabs on
  `?tab=` or `?group=`; those are a different level and stay.

## 2. The design

### 2.1 Areas

An AREA is a sidebar row whose pages are tabs. In `menu.ts` it is an item with `children` (as the folds were), built
by one helper, `area()`, which gives the row the route and gate of its FIRST tab, so the derived route table does not
change. Each tab keeps its own `perm` and `modules`.

- The shell (`Layout.tsx`) draws the area's tabs on top of every page that belongs to the area, including owned
  record pages (an order, a product editor). App.tsx routes are not restructured.
- Which area a page belongs to: the longest matching route over every entry (rows, tabs, Growcord Ship's pages,
  OFF_MENU pages, and what each owns). Only when that winner is a tab is the strip drawn, so a WMS page under
  `/panel/inventory/...` never shows the Inventory tabs.
- Tabs a section holds beyond seven, and tabs marked `more` (rarely used, or opening full screen), sit under More.
  When the open page is under More, the More button carries its name.
- An area whose tabs name a `section` (Settings, Marketing home) draws two rows: the sections, then the open
  section's tabs.
- A strip is drawn only when the person may open two or more of the area's tabs.
- Growcord Ship keeps its own layout and its own strip. The shell draws nothing on `/growship`. Its strip now uses
  the same shared component (`AreaTabs`), so there is one tab strip in the admin, not two copies.

### 2.2 The sidebar

19 rows in the same 8 groups (48 before):

- Overview: Dashboard; Analytics
- Orders: Orders; Payments; Shipments; Growcord Ship
- Catalog: Products; Inventory
- Marketing: Marketing home; Ads; Social; Campaigns and inbox; Offers and channels
- Messaging: Messages
- Store Customers: Customers
- Content: Appearance; Store content
- System: Settings; Help and support

Denser rows (smaller group labels, less padding), no folds. Each area row and Growcord Ship has a flyout on desktop
(hover, or the arrow button for keyboard and click) listing the pages that person may open, by section, so a deep
page is one move away. Clicking the row opens the area on its remembered tab, else the first tab the person may
open. On a phone the row opens the area, the sheet closes, and the tabs scroll sideways. The collapsed icon mode keeps
working: the flyout opens from the icon.

### 2.3 Areas and their tabs (More marks the tabs under More)

- Analytics: Dashboard, Sales Insights, Delivery & RTO, Store, Marketing, Users, Realtime; More: Custom, App
- Orders: All Orders, Order desk (was OFF_MENU), Create Order, Abandoned Carts, Returns (was a row), Refunds,
  Quotations; More: Credit Notes & Challans, Sales & Team, Automation rules (was OFF_MENU), POS (New Sale) (was a row)
- Payments: Payments, Settlements, COD payouts, Payment analytics, Payment requests (were under the Orders fold)
- Shipments: Shipments (was a row), Returns in, E-way bills, Weight claims (all three were OFF_MENU)
- Products: All Products, Create Product, Import / Export, Categories, Brands, Bundles, Pricing (was a row); More:
  Companies, Attributes, Tags, Size Charts, Specifications, Variant Link Groups, Gallery (was a row)
- Inventory: Stock Levels, Stock desk (was OFF_MENU), Batches & Expiry, Reorder, Warehouses (was a row), Vendors (was
  a row), ERP Sync; More: Approvals, Outlets & Transfers, Consignment, Distributor Network
- Marketing home: section Insights: Marketing home, Performance, Marketing reports, Growth, Ads analytics, Social
  analytics, Search insights; section Setup: Connections, Events health, ChatGPT ads, Compliance, Settings
- Ads: Ads Manager, Create ad, Audiences, Creative library, Lead forms, Rules and tests, AI Ads Studio; More: Ad
  accounts
- Social: Facebook and Instagram, Publisher, Comments, Instagram, Google Reviews
- Campaigns and inbox: All chats, Campaigns, Quick send, Templates, Automation, Contact lists, Messenger settings
- Offers and channels: Coupons, App Offers, Meta catalog, Channels, Daily file, Excel Import, Mapping; More:
  Allocation
- Messages: Notifications, WhatsApp, Email, SMS, Cart recovery, Retention (were 6 rows)
- Customers: All Customers, CRM, B2B, Partners, Credit Control (were 5 rows)
- Appearance: Pages, Themes, Banners, Menus, Style, Products, Trust Badges
- Store content: FAQs, Reviews, Questions & Answers, Wishlists, Blog Posts, App Feed, SEO (were 7 rows)
- Settings: section Store: Settings Center, All settings pages, Store Configuration, Markets, Modules, Contact
  Submissions, Setup Guide (was a row); More: Setup wizard (was OFF_MENU). Section Selling: Payment Methods &
  Discounts, Payment Gateways, GST Display, Tax Rules, Invoice, Order Numbering, Customer Orders; More: Return
  Policies, Manufacturers, Doc templates, Custom fields (both were OFF_MENU). Section Shipping: Shipping, Packages,
  Wallet. Section Messages: API Integrations, Message templates, Cart Recovery Automation. Section App: Mobile App,
  App Audience, App Assistant, App Tracking. Section Team and plan: Staff & Access (was a row), Billing, Logs (was a
  row)

### 2.4 Other products' pages

Books (accounting, GST), WMS (floor, counts, labels, scanner, units, transfers, stock reports) and Make (purchase
orders, scorecard, kits, work orders) stay in OFF_MENU with their gates and their buttons, reached from the header
tabs as today. New: each OFF_MENU entry names its product (`product`), and the command search lists them for people
who may open them, labelled with that product. The breadcrumb names the product too.

### 2.5 New features (cheap and safe; no new backend call from the sidebar)

- A Search button at the top of the sidebar opens the command search (Cmd K or "/" still work).
- Pinned pages: a Pin button in the breadcrumb row pins the open page when it is a menu page; pins show at the top
  of the sidebar, each with an unpin button.
- Recent pages: the last 5 menu pages opened, under the pins.
- Each area remembers its last tab.
- The breadcrumb reads Area, then Tab (then the record, as before).
- The command search lists every area, every area tab, Growcord Ship's pages and the other products' pages, each
  with where it lives. With an empty query it shows the pins and recent pages first.
- Pins, recent pages and last tabs are kept per person in this browser (localStorage key per user id, every read and
  write in try and catch). They hold paths only and are filtered again through the same gates on every render.

### 2.6 Need to know

- A row, tab, flyout entry, pin, recent page or search result appears only when `permitted` and `moduleOn` (the
  existing functions) pass for that page's own entry, and pins and recent pages also pass `canOpenPath`, the route
  guard's own table.
- An area row appears only when at least one of its tabs does, and it lands on the first of them (or the remembered
  one, when the person may still open it). No count or hint of a page a person may not open is shown. `planLocked`
  stays as it is (it counts pages hidden by a module; no screen shows it today).
- Until the store's module list has loaded, entries that need a module are left out (the route guard waits the same
  way), so a page of a module that is off never flashes into the menu.
- Visibility of a fold child used to need the parent's gate as well. It now needs only the page's own gate, which is
  the route guard's gate. So a person may now SEE a page in the menu that they could already OPEN by its address (for
  example a person with `ads.read` but not `marketing.read` sees Ads analytics). Nobody sees a page they cannot open.

## 3. Proof (scripts committed with the change)

`scripts/nav-proof.mjs` (node, uses the esbuild the build already has; run from the worktree root after npm install;
the base ref is the first argument, origin/main when left out):

1. Gate equality: the route table (path, perms, modules) from the base menu and from this branch, compared path by
   path. Any difference fails the run.
2. Reachability: every route that was a row, a fold child, a Growcord Ship page or an OFF_MENU page before, with
   where it lives now (row, tab, More, flyout, search). Checked over many access sets (every role, every role with
   each module off, every single permission, every pair of permissions, with each module off): whoever saw a page
   before still sees it, and whoever sees a page may open it by the route table. Any failure fails the run.
3. What some people see: the owner with everything, an orders only staff member, a catalog only staff member, and a
   store with modules off, printed row by row with their tabs.

Also: type check clean, `npm run build` succeeds. The repository has no eslint set up (no config, not in
devDependencies), so there is no lint run to compare.

## 4. Files

- `src/lib/menu.ts`: the new MENU shape, `area()`, `section`, `more` and `product` fields, the surfaced OFF_MENU pages
  moved into their areas, every gate unchanged.
- `src/components/menu/menuAccess.ts`: areas shown by their tabs, `navEntries`, `whereIs`, `areaView`, `activeTab`.
- `src/components/menu/AreaTabs.tsx` (new, from GrowshipLayout's strip): the one tab strip, and `AreaStrip` for the
  shell.
- `src/components/menu/navMemory.ts` (new): pins, recent pages, last tabs.
- `src/components/app-sidebar.tsx`: compact rows, flyouts, Search, Pinned, Recent.
- `src/components/Layout.tsx`: the area strip, the breadcrumb (Area, Tab), the Pin button, one nav state.
- `src/components/menu/ShellChrome.tsx`: the command search reads `navEntries`.
- `src/pages/growship/GrowshipLayout.tsx`: uses `AreaTabs`.
- `scripts/nav-proof.mjs`.

## 5. Not in this lane

- Live count badges in the sidebar (owner rule: only what is on screen asks the backend).
- Moving Books, WMS or Make pages into the sidebar.
- Pinning record pages (an order, a product): only menu pages can be pinned.
- Pinning on a phone: the breadcrumb row with the Pin button is hidden on a phone, as before; recent pages work.
