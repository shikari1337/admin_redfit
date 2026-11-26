#!/usr/bin/env node
/**
 * ADMIN-NAV-1 proof (docs/ADMIN-NAV-1.md section 3). Run from the admin root after npm install:
 *
 *   node scripts/nav-proof.mjs            compares this tree with origin/main
 *   node scripts/nav-proof.mjs <git ref>  compares this tree with that ref
 *
 * It bundles the base's menu.ts, routePermissions.ts and menuAccess.ts (read with git show) and this tree's, with the
 * esbuild the build already has, and checks:
 *   1. gate equality: the route table (path, any one of perms, all of modules) is the same path by path;
 *   2. reachability: over many access sets, whoever saw a page in the menu before sees it now, and whoever sees a
 *      page in the menu now may open it by the route table; each route is listed with where it lived and lives;
 *   3. what four people see (owner, orders only staff, catalog only staff, a store with modules off).
 * Exit code 1 on any failure. Writes nothing outside node_modules/.nav-proof (deleted with node_modules).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.cwd();
const base = process.argv[2] || 'origin/main';
const work = path.join(root, 'node_modules', '.nav-proof');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const BASE_FILES = ['src/lib/menu.ts', 'src/lib/routePermissions.ts', 'src/components/menu/menuAccess.ts'];
for (const f of BASE_FILES) {
  const text = execFileSync('git', ['show', `${base}:${f}`], { cwd: root, encoding: 'utf8' });
  const out = path.join(work, 'base', f);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, text);
}

async function bundle(name, dir) {
  const outfile = path.join(work, `${name}.mjs`);
  await build({
    stdin: {
      contents: [
        `export * as menu from '${dir}/src/lib/menu.ts';`,
        `export * as rp from '${dir}/src/lib/routePermissions.ts';`,
        `export * as access from '${dir}/src/components/menu/menuAccess.ts';`,
        `export * as rbac from '${root}/src/lib/rbac.ts';`,
      ].join('\n'),
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'warning',
  });
  return import(pathToFileURL(outfile).href);
}

const OLD = await bundle('base', path.join(work, 'base'));
const NEW = await bundle('tree', root);

let failures = 0;
const fail = (msg) => { failures += 1; console.log(`FAIL ${msg}`); };
const j = (v) => JSON.stringify(v ?? null);

/* 1. gate equality */

console.log(`\n== 1. Gate equality: ${base} against this tree ==`);
{
  const o = { perms: OLD.rp.ROUTE_PERMISSIONS_ANY, mods: OLD.rp.ROUTE_MODULES_ALL };
  const n = { perms: NEW.rp.ROUTE_PERMISSIONS_ANY, mods: NEW.rp.ROUTE_MODULES_ALL };
  const paths = [...new Set([...Object.keys(o.perms), ...Object.keys(o.mods), ...Object.keys(n.perms), ...Object.keys(n.mods)])].sort();
  let same = 0;
  for (const p of paths) {
    const a = `${j(o.perms[p])} ${j(o.mods[p])}`;
    const b = `${j(n.perms[p])} ${j(n.mods[p])}`;
    if (a === b) same += 1;
    else fail(`gate of ${p}: before perms ${j(o.perms[p])} modules ${j(o.mods[p])}, now perms ${j(n.perms[p])} modules ${j(n.mods[p])}`);
  }
  console.log(`${paths.length} gated paths, ${same} identical, ${paths.length - same} different`);
  if (same === paths.length) console.log('IDENTICAL');
}

/* access sets */

function collectGates(menu) {
  const perms = new Set();
  const mods = new Set();
  const take = (i) => {
    for (const p of [i.perm ?? []].flat()) perms.add(p);
    for (const m of i.modules ?? []) mods.add(m);
    for (const c of [...(i.children ?? []), ...(i.palette ?? [])]) take(c);
  };
  for (const g of menu.MENU) for (const s of g.subs) for (const i of s.items) take(i);
  for (const i of menu.OFF_MENU) take(i);
  for (const e of menu.EXTRA_ROUTES) { for (const p of [e.perm ?? []].flat()) perms.add(p); for (const m of e.modules ?? []) mods.add(m); }
  return { perms, mods };
}
const g1 = collectGates(OLD.menu);
const g2 = collectGates(NEW.menu);
const ROLES = ['admin', ...NEW.rbac.ASSIGNABLE_ROLES];
for (const r of ROLES) for (const p of NEW.rbac.effectivePermissionsFor(r)) if (p !== '*') g2.perms.add(p);
const PERMS = [...new Set([...g1.perms, ...g2.perms])].sort();
const MODS = [...new Set([...g1.mods, ...g2.mods])].sort();

function accessOf(name, granted, off) {
  const eff = granted === '*' ? ['*'] : NEW.rbac.effectivePermissionsFor('', granted);
  const offSet = new Set(off);
  return { name, hasPerm: (p) => NEW.rbac.hasPermIn(eff, p), canAccess: (m) => !offSet.has(m) };
}
const SETS = [];
SETS.push(accessOf('nobody', [], []));
SETS.push(accessOf('admin, every module off', '*', MODS));
for (const r of ROLES) {
  const granted = r === 'admin' ? '*' : NEW.rbac.effectivePermissionsFor(r);
  SETS.push(accessOf(`role ${r}`, granted, []));
  for (const m of MODS) SETS.push(accessOf(`role ${r}, ${m} off`, granted, [m]));
}
for (const p of PERMS) {
  SETS.push(accessOf(`only ${p}`, [p], []));
  SETS.push(accessOf(`only ${p}, every module off`, [p], MODS));
  for (const m of MODS) SETS.push(accessOf(`only ${p}, ${m} off`, [p], [m]));
}
for (let a = 0; a < PERMS.length; a += 1) for (let b = a + 1; b < PERMS.length; b += 1) {
  SETS.push(accessOf(`${PERMS[a]} and ${PERMS[b]}`, [PERMS[a], PERMS[b]], []));
}

/* 2. reachability */

/** Every page the base's menu showed this person: rows, fold children and Growcord Ship's pages. */
function oldVisible(a) {
  const out = new Set();
  for (const g of OLD.access.visibleMenu(a)) for (const s of g.subs) for (const i of s.items) {
    for (const x of OLD.menu.withChildren(i)) if (!x.external) out.add(x.to);
    for (const p of i.palette ?? []) out.add(p.to);
  }
  return out;
}

/** Every page this tree's menu shows this person, anywhere: rows, area tabs, Growcord Ship's pages, other products' pages. */
function newVisible(a) {
  const groups = NEW.access.visibleMenu(a);
  return new Set(NEW.access.navEntries(groups, a).filter((e) => !e.external).map((e) => e.to));
}

console.log(`\n== 2. Reachability over ${SETS.length} access sets (${PERMS.length} permissions, ${MODS.length} modules) ==`);
{
  let checks = 0;
  const narrowed = new Map();
  const leaked = new Map();
  const refusedBefore = new Map();
  const openNotListed = new Map();
  const shipNotListed = new Map();
  // The pages this tree lists by their own gate: rows, area tabs and OFF_MENU pages. Growcord Ship's pages follow
  // its row's gate (its own lane's rule, unchanged), so they are reported apart.
  const listedNow = new Set();
  const shipPages = new Set();
  for (const g of NEW.menu.MENU) for (const s of g.subs) for (const i of s.items) {
    for (const x of NEW.menu.withChildren(i)) if (!x.external && !x.children?.length) listedNow.add(x.to);
    for (const p of i.palette ?? []) shipPages.add(p.to);
  }
  for (const i of NEW.menu.OFF_MENU) listedNow.add(i.to);
  for (const a of SETS) {
    const before = oldVisible(a);
    const now = newVisible(a);
    for (const p of before) {
      checks += 1;
      // Reachable before = shown AND opened by the route guard. A link the guard refused is a leak now closed.
      if (!OLD.rp.canOpenPath(p, a.hasPerm, a.canAccess)) { if (!now.has(p)) refusedBefore.set(p, a.name); continue; }
      if (!now.has(p)) narrowed.set(p, a.name);
    }
    for (const p of now) { checks += 1; if (!NEW.rp.canOpenPath(p, a.hasPerm, a.canAccess)) leaked.set(p, a.name); }
    // Every page a person may open is listed for them somewhere (OFF_MENU pages: in the command search).
    for (const p of listedNow) { checks += 1; if (NEW.rp.canOpenPath(p, a.hasPerm, a.canAccess) && !now.has(p)) openNotListed.set(p, a.name); }
    for (const p of shipPages) if (NEW.rp.canOpenPath(p, a.hasPerm, a.canAccess) && !now.has(p)) shipNotListed.set(p, a.name);
  }
  for (const [p, who] of narrowed) fail(`${p} was in the menu and opened for "${who}", and is not in the menu now`);
  for (const [p, who] of leaked) fail(`${p} is in the menu for "${who}", who may not open it`);
  for (const [p, who] of openNotListed) fail(`${p} opens for "${who}" but is not in the menu or the command search`);
  console.log(`${checks} visibility checks, ${narrowed.size} narrowed, ${leaked.size} shown without access, ${openNotListed.size} openable but not listed`);
  if (refusedBefore.size) {
    console.log('Links the old menu showed that the route guard refused, now left out (need to know):');
    for (const [p, who] of refusedBefore) console.log(`  ${p}  (for example "${who}")`);
  }
  if (shipNotListed.size) {
    console.log('Growcord Ship pages that open but follow the Growcord Ship row (shipments.read or billing.read, unchanged); each redirects to a page listed elsewhere:');
    for (const [p, who] of shipNotListed) console.log(`  ${p}  (for example "${who}")`);
  }
}

/* what each role sees now that it did not before (pages it could already open by their address) */

console.log('\nNewly in the menu per role (every module on); each already opened by its address before:');
for (const r of ROLES) {
  const a = accessOf(r, r === 'admin' ? '*' : NEW.rbac.effectivePermissionsFor(r), []);
  const was = oldVisible(a);
  const entries = NEW.access.navEntries(NEW.access.visibleMenu(a), a);
  const tabs = [...new Set(entries.filter((e) => e.kind !== 'other' && e.kind !== 'area' && !was.has(e.to)).map((e) => `${e.label} (${e.row ?? e.group})`))];
  const other = entries.filter((e) => e.kind === 'other' && !was.has(e.to));
  const byProduct = {};
  for (const e of other) byProduct[e.product] = (byProduct[e.product] ?? 0) + 1;
  const search = Object.entries(byProduct).map(([p, n]) => `${n} ${p}`).join(', ');
  console.log(`  ${r}: ${tabs.length ? tabs.join(', ') : 'no new tab'}${search ? `; in the command search: ${search} pages` : ''}`);
}

/* where each route lived, and lives */

function oldWhere() {
  const out = new Map();
  const put = (to, where) => { if (!out.has(to)) out.set(to, where); };
  for (const g of OLD.menu.MENU) for (const s of g.subs) for (const i of s.items) {
    put(i.to, i.children?.length ? `${g.label}: ${i.label} fold (its first line)` : `${g.label}: row`);
    for (const c of i.children ?? []) put(c.to, `${g.label}: under ${i.label}`);
    for (const p of i.palette ?? []) put(p.to, `${g.label}: ${i.label} tab (own layout)`);
  }
  for (const i of OLD.menu.OFF_MENU) put(i.to, 'off menu: a button on a page');
  for (const e of OLD.menu.EXTRA_ROUTES) put(e.path, 'no menu entry: redirect or deep link');
  return out;
}
const ALL = accessOf('owner', '*', []);
const before = oldWhere();
const nowEntries = NEW.access.navEntries(NEW.access.visibleMenu(ALL), ALL);
const nowWhere = new Map();
for (const e of nowEntries) if (e.kind !== 'area' && !nowWhere.has(e.to)) nowWhere.set(e.to, NEW.access.whereLabel(e));
for (const e of nowEntries) if (e.kind === 'area') nowWhere.set(e.to, `${nowWhere.get(e.to) ?? NEW.access.whereLabel(e)}; the ${e.label} row lands here`);
const extraNow = new Map(NEW.menu.EXTRA_ROUTES.map((e) => [e.path, 'no menu entry: redirect or deep link (unchanged)']));

console.log('\n== Where every route lived and lives (seen as the owner, every module on) ==');
let missing = 0;
for (const [to, was] of [...before.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const now = nowWhere.get(to) ?? extraNow.get(to);
  if (!now) { missing += 1; fail(`${to} (${was}) is nowhere now`); continue; }
  const button = was.startsWith('off menu') ? '; its buttons unchanged' : '';
  console.log(`${to}\n    before: ${was}\n    now:    ${now}${button}`);
}
console.log(`${before.size} routes before, ${before.size - missing} found now, ${missing} missing`);

/* 3. what four people see */

function show(a) {
  const groups = NEW.access.visibleMenu(a);
  console.log(`\n[${a.name}]`);
  let rows = 0;
  for (const g of groups) {
    console.log(`${g.label.toUpperCase()}`);
    for (const s of g.subs) for (const i of s.items) {
      rows += 1;
      const landing = NEW.access.areaLanding(i, null);
      const tabs = i.children ?? i.palette ?? [];
      if (!tabs.length) { console.log(`  ${i.label}  (${i.to})`); continue; }
      console.log(`  ${i.label}  lands on ${landing}, ${tabs.length} page${tabs.length === 1 ? '' : 's'}`);
      for (const sec of NEW.access.tabSections(tabs)) {
        const { inline, more } = NEW.access.splitTabs(sec.tabs);
        const label = sec.label ? `${sec.label}: ` : '';
        console.log(`    ${label}${inline.map((t) => t.label).join(', ')}${more.length ? `; More: ${more.map((t) => t.label).join(', ')}` : ''}`);
      }
    }
  }
  const entries = NEW.access.navEntries(groups, a);
  const other = entries.filter((e) => e.kind === 'other');
  console.log(`${rows} sidebar rows; ${entries.length} entries in the command search${other.length ? `, of them other products: ${other.map((e) => `${e.label} (${e.product})`).join(', ')}` : ''}`);
  // A pin of every listed page: only those this person may open survive.
  const pinned = NEW.access.keepOpenable([...before.keys()], entries, a);
  const bad = pinned.filter((p) => !NEW.rp.canOpenPath(p.to, a.hasPerm, a.canAccess));
  if (bad.length) fail(`${a.name}: pins kept a page they may not open: ${bad.map((b) => b.to).join(', ')}`);
  console.log(`pins of all ${before.size} routes kept ${pinned.length}, every one openable: ${bad.length === 0 ? 'yes' : 'NO'}`);
  return rows;
}

console.log('\n== 3. What four people see ==');
{
  const count = (groups) => Object.fromEntries(groups.map((g) => [g.label, g.subs.reduce((n, s) => n + s.items.length, 0)]));
  const was = count(OLD.access.visibleMenu(ALL));
  const now = count(NEW.access.visibleMenu(ALL));
  const total = (c) => Object.values(c).reduce((a, b) => a + b, 0);
  console.log(`sidebar rows for the owner, before and now: ${Object.keys(was).map((k) => `${k} ${was[k]} to ${now[k] ?? 0}`).join('; ')}; all ${total(was)} to ${total(now)}`);
  show(ALL);
  show(accessOf('orders only staff (orders.manage)', ['orders.manage'], []));
  show(accessOf('catalog only staff (products.manage)', ['products.manage'], []));
  show(accessOf('owner of a store with marketing, inventory, analytics, shipping, accounting and wms off', '*', ['marketing', 'inventory', 'analytics', 'shipping', 'accounting', 'wms']));
}

/* 4. the real sidebar and strip, rendered to HTML */

console.log('\n== 4. The sidebar and the tab strip rendered for several people and pages ==');
{
  const outfile = path.join(work, 'render.mjs');
  // The sidebar warms page chunks on hover (menu/prefetch.ts); the check does not need the pages, so that file is a stub.
  const stubPrefetch = {
    name: 'stub-prefetch',
    setup(b) {
      b.onResolve({ filter: /menu\/prefetch$/ }, () => ({ path: 'prefetch', namespace: 'nav-stub' }));
      b.onLoad({ filter: /.*/, namespace: 'nav-stub' }, () => ({ contents: 'export function prefetchGroup() {}', loader: 'js' }));
    },
  };
  await build({
    entryPoints: [path.join(root, 'scripts', 'nav-render-entry.tsx')],
    // Packages load from node_modules as they are (React's server build is CommonJS); only the admin's code is bundled.
    bundle: true, packages: 'external', platform: 'node', format: 'esm', outfile, logLevel: 'warning', jsx: 'automatic',
    plugins: [stubPrefetch],
  });
  const R = await import(pathToFileURL(outfile).href);
  const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  const everyPath = [...before.keys()];
  const people = [
    ALL,
    accessOf('orders only staff (orders.manage)', ['orders.manage'], []),
    accessOf('catalog only staff (products.manage)', ['products.manage'], []),
    accessOf('role dispatcher', NEW.rbac.effectivePermissionsFor('dispatcher'), []),
    accessOf('role marketing_manager', NEW.rbac.effectivePermissionsFor('marketing_manager'), []),
    accessOf('role accountant', NEW.rbac.effectivePermissionsFor('accountant'), []),
    accessOf('owner of a store with modules off', '*', ['marketing', 'inventory', 'analytics', 'shipping', 'accounting', 'wms']),
  ];
  // Saved state that tries to show everything: every route pinned and recent, and every area's remembered tab a
  // page the person may not open.
  const lastAll = {};
  for (const g of NEW.menu.MENU) for (const s of g.subs) for (const i of s.items) if (i.children?.length) lastAll[`${g.id}/${i.label}`] = '/panel/accounting/journals';
  const saved = { pins: everyPath, recent: [...everyPath].reverse(), last: lastAll };
  const pages = ['/dashboard', '/orders/SM-9188', '/settings/staff', '/growship/shipments', '/panel/inventory/transfers', '/panel/accounting/trial-balance', '/pricing/changes'];
  let links = 0;
  for (const a of people) {
    for (const p of pages) {
      const out = R.renderNav(a, p, saved);
      for (const h of [...hrefs(out.sidebar), ...hrefs(out.strip)]) {
        links += 1;
        if (!NEW.rp.canOpenPath(h, a.hasPerm, a.canAccess)) fail(`${a.name} on ${p}: the rendered menu links to ${h}, which they may not open`);
      }
      for (const to of [...out.pinned, ...out.recent]) if (!NEW.rp.canOpenPath(to, a.hasPerm, a.canAccess)) fail(`${a.name}: a saved page they may not open was shown: ${to}`);
      if (out.recent.length > 5) fail(`${a.name}: more than 5 recent pages`);
    }
    // Recent pages on their own (no pins): at most five, each openable.
    const onlyRecent = R.renderNav(a, '/dashboard', { pins: [], recent: [...everyPath].reverse(), last: lastAll });
    if (onlyRecent.recent.length > 5) fail(`${a.name}: more than 5 recent pages`);
    for (const to of onlyRecent.recent) if (!NEW.rp.canOpenPath(to, a.hasPerm, a.canAccess)) fail(`${a.name}: a recent page they may not open was shown: ${to}`);
    const plain = R.renderNav(a, '/dashboard', { pins: [], recent: [], last: {} });
    const sample = R.renderNav(a, '/dashboard', saved);
    console.log(`${a.name}: ${hrefs(plain.sidebar).length} links in the sidebar with nothing saved; with every route saved ${sample.pinned.length} pins kept of ${everyPath.length}, and with only recent pages ${onlyRecent.recent.length} recent shown`);
  }
  console.log(`${links} rendered links checked against the route table`);

  // Pages and what the shell shows on them, for the owner.
  const expect = [
    ['/orders/SM-9188', 'orders/Orders', '/orders', 'Orders / All Orders / SM 9188'],
    ['/orders/new', 'orders/Orders', '/orders/new', 'Orders / Create Order'],
    ['/panel/orders/payments/settlements/stl_1', 'orders/Payments', '/panel/orders/payments/settlements', null],
    ['/panel/orders/rto', 'orders/Shipments', '/panel/orders/rto', 'Shipments / Returns in'],
    ['/pricing/changes', 'catalog/Products', '/pricing/discovery', 'Products / Pricing / changes'],
    ['/settings/staff', 'system/Settings', '/settings/staff', 'Settings / Staff & Access'],
    ['/settings/billing/product-services', 'system/Settings', '/settings/billing', null],
    ['/panel/marketing/templates', 'marketing/Campaigns and inbox', '/panel/marketing/templates', null],
    ['/panel/marketing/connections/callback', 'marketing/Marketing home', '/panel/marketing/connections', null],
    ['/growship/shipments', null, null, 'Growcord Ship / Shipments'],
    ['/growship', null, null, null],
    ['/panel/inventory/transfers', null, null, 'WMS / Transfers'],
    ['/panel/inventory/purchasing', null, null, 'Make / Purchase orders'],
    ['/panel/accounting/trial-balance', null, null, 'Books / Trial balance'],
    ['/dashboard', null, null, 'Overview / Dashboard'],
    ['/support/42', null, null, 'System / Help and support / 42'],
  ];
  const none = { pins: [], recent: [], last: {} };
  for (const [p, key, active, trail] of expect) {
    const out = R.renderNav(ALL, p, none);
    const gotKey = out.view?.key ?? null;
    const gotActive = out.view?.active ?? null;
    if (gotKey !== key || gotActive !== active) fail(`${p}: strip ${gotKey} on ${gotActive}, expected ${key} on ${active}`);
    if (trail && out.trail !== trail) fail(`${p}: breadcrumb "${out.trail}", expected "${trail}"`);
    console.log(`${p}: ${out.view ? `${out.view.key} tabs, open tab ${out.view.active}${out.view.section ? `, section ${out.view.section}` : ''}` : 'no shell tabs'}; breadcrumb ${out.trail}${out.here ? `; pinnable as ${out.here}` : ''}`);
  }

  // A remembered tab the person may no longer open is not used: the row lands on the first tab they may open.
  const catalog = accessOf('catalog only staff (products.manage)', ['products.manage'], []);
  const kept = R.renderNav(catalog, '/products', { pins: [], recent: [], last: { 'catalog/Inventory': '/inventory', 'catalog/Products': '/products/tags' } });
  if (!hrefs(kept.sidebar).includes('/panel/inventory/network') || hrefs(kept.sidebar).includes('/inventory')) fail('catalog staff: the Inventory row did not land on the first tab they may open');
  if (!hrefs(kept.sidebar).includes('/products/tags')) fail('catalog staff: the Products row did not land on the remembered tab');
  console.log(`catalog staff, remembered tabs /inventory (not theirs) and /products/tags: Inventory row lands on /panel/inventory/network, Products row on /products/tags`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
