/**
 * Icon picker — nine icon families, none of them in the first load.
 *
 * This file used to `import * as X from 'react-icons/<family>'` nine times. A
 * namespace import cannot be tree-shaken, so every icon of every family was
 * retained; with those families also named in vite's `manualChunks` the result
 * was a 10.9 MB `icons-vendor` chunk (2.29 MB gzipped) modulepreloaded on EVERY
 * page of the admin, for a picker that opens on six screens. That is
 * COMMON_MISTAKES #149's barrel-import trap, in Vite rather than Turbopack.
 *
 * Each family is now behind `import()` and arrives only when it is needed — the
 * tab is opened, or an icon that belongs to it is rendered. `getIconComponent`
 * keeps its synchronous signature (its two callers render the result directly):
 * it returns a small component that resolves its own family and paints once the
 * chunk lands. The component is memoised per `lib:name`, so the identity is
 * stable across renders and React does not remount it.
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Search } from 'lucide-react';

// Icon format: "lib:iconName" e.g. "lucide:Check", "fa:FaCheck"
export const ICON_FORMAT = { prefix: true, separator: ':' };

type IconModule = Record<string, React.ComponentType<any>>;

export interface IconLibrary {
  id: string;
  name: string;
  prefix: string;
  /**
   * Loads the family. Static specifiers only — vite needs to see each one.
   * The module is a namespace object, not an `IconModule`; `loadLibrary`
   * narrows it, and `listIcons` drops anything that is not a component.
   */
  load: () => Promise<Record<string, unknown>>;
}

const ICON_LIBRARIES: IconLibrary[] = [
  { id: 'lucide', name: 'Lucide', prefix: 'lucide', load: () => import('lucide-react') },
  { id: 'fa', name: 'Font Awesome', prefix: 'Fa', load: () => import('react-icons/fa') },
  { id: 'fi', name: 'Feather', prefix: 'Fi', load: () => import('react-icons/fi') },
  { id: 'ai', name: 'Ant Design', prefix: 'Ai', load: () => import('react-icons/ai') },
  { id: 'bi', name: 'Boxicons', prefix: 'Bi', load: () => import('react-icons/bi') },
  { id: 'hi', name: 'Heroicons', prefix: 'Hi', load: () => import('react-icons/hi') },
  { id: 'io', name: 'Ionicons', prefix: 'Io', load: () => import('react-icons/io5') },
  { id: 'md', name: 'Material Design', prefix: 'Md', load: () => import('react-icons/md') },
  { id: 'tb', name: 'Tabler', prefix: 'Tb', load: () => import('react-icons/tb') },
  { id: 'bs', name: 'Bootstrap', prefix: 'Bs', load: () => import('react-icons/bs') },
];

const INTERNAL_KEYS = new Set(['createLucideIcon', 'default', 'icons', 'lucideReact', 'Icon', 'ForwardRef']);

/** Families already fetched, so a second open costs nothing. */
const loaded = new Map<string, IconModule>();
const inflight = new Map<string, Promise<IconModule>>();

function loadLibrary(id: string): Promise<IconModule> {
  const cached = loaded.get(id);
  if (cached) return Promise.resolve(cached);
  const running = inflight.get(id);
  if (running) return running;
  const lib = ICON_LIBRARIES.find((l) => l.id === id);
  if (!lib) return Promise.resolve({});
  const p = lib
    .load()
    .then((raw) => {
      const mod = raw as IconModule;
      loaded.set(id, mod);
      inflight.delete(id);
      return mod;
    })
    .catch(() => {
      inflight.delete(id);
      return {} as IconModule;
    });
  inflight.set(id, p);
  return p;
}

type Entry = { name: string; fullId: string; Icon: React.ComponentType<any>; lib: IconLibrary };

function listIcons(lib: IconLibrary, mod: IconModule): Entry[] {
  const list: Entry[] = [];
  for (const name of Object.keys(mod)) {
    if (INTERNAL_KEYS.has(name)) continue;
    const Icon = mod[name];
    if (typeof Icon !== 'function' && typeof Icon !== 'object') continue;
    if (!Icon) continue;
    if (lib.id === 'lucide') {
      if (name.endsWith('Icon') && name !== 'Icon') continue;
      if (name.length < 2) continue;
      if (name[0] !== name[0].toUpperCase()) continue;
    } else if (!name.startsWith(lib.prefix)) {
      continue;
    }
    list.push({ name, fullId: `${lib.id}:${name}`, Icon, lib });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/** React to a family arriving. Returns the entries of every family asked for. */
function useIconEntries(libIds: string[]): { entries: Entry[]; loading: boolean } {
  const key = libIds.join(',');
  const [, bump] = useState(0);
  const pending = useRef(0);

  useEffect(() => {
    let live = true;
    const missing = libIds.filter((id) => !loaded.has(id));
    if (!missing.length) return;
    pending.current = missing.length;
    bump((n) => n + 1);
    for (const id of missing) {
      loadLibrary(id).then(() => {
        if (!live) return;
        pending.current -= 1;
        bump((n) => n + 1);
      });
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const entries = useMemo(() => {
    const out: Entry[] = [];
    for (const id of libIds) {
      const mod = loaded.get(id);
      const lib = ICON_LIBRARIES.find((l) => l.id === id);
      if (mod && lib) out.push(...listIcons(lib, mod));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, libIds.every((id) => loaded.has(id))]);

  return { entries, loading: libIds.some((id) => !loaded.has(id)) };
}

interface IconPickerModalProps {
  onSelect: (iconId: string) => void;
  onClose: () => void;
  currentIcon?: string;
}

export const IconPickerModal = ({ onSelect, onClose, currentIcon = '' }: IconPickerModalProps) => {
  const [search, setSearch] = useState('');
  // Start on ONE family rather than all ten: opening the picker used to mean
  // ten chunks at once, and nobody scrolls 30,000 icons.
  const [category, setCategory] = useState<string>('lucide');

  const libIds = useMemo(
    () => (category === 'all' ? ICON_LIBRARIES.map((l) => l.id) : [category]),
    [category],
  );
  const { entries, loading } = useIconEntries(libIds);

  const filteredIcons = useMemo(() => {
    let list = entries;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q) || i.lib.name.toLowerCase().includes(q));
    }
    return list.slice(0, 300);
  }, [entries, search]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-scrim p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between rounded-t-xl border-b border-line bg-surface-2 p-4">
          <h3 className="text-lg font-bold text-ink">Select icon</h3>
          <button type="button" onClick={onClose} className="rounded-full p-2 transition-colors hover:bg-surface-2" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-3 border-b border-line p-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-ink-mute" size={18} />
            <input
              autoFocus
              placeholder="Search icons (e.g. check, truck, user)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-line py-2 pl-10 pr-4 outline-none focus:ring-2 focus:ring-focus"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {ICON_LIBRARIES.map((lib) => (
              <button
                key={lib.id}
                type="button"
                onClick={() => setCategory(lib.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  category === lib.id ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-ink-soft hover:bg-surface-raised'
                }`}
              >
                {lib.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                category === 'all' ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-ink-soft hover:bg-surface-raised'
              }`}
              title="Loads every family — slower"
            >
              All families
            </button>
          </div>
        </div>
        <div className="min-h-[300px] flex-1 overflow-y-auto bg-surface-2/50 p-4">
          {loading && !entries.length ? (
            <div className="py-10 text-center text-sm text-ink-mute">Loading icons…</div>
          ) : (
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
              {filteredIcons.map(({ name, fullId, Icon }) => (
                <button
                  key={fullId}
                  type="button"
                  onClick={() => { onSelect(fullId); onClose(); }}
                  className={`group flex aspect-square flex-col items-center justify-center rounded-lg border p-3 transition-all hover:bg-brand-soft ${
                    currentIcon === fullId ? 'border-brand bg-brand-soft ring-2 ring-focus' : 'border-transparent bg-surface shadow-sm'
                  }`}
                  title={`${name} (${fullId})`}
                >
                  {React.createElement(Icon, { className: 'mb-2 h-6 w-6 text-ink-soft' })}
                  <span className="w-full truncate text-center text-[10px] text-ink-mute">{name}</span>
                </button>
              ))}
              {!filteredIcons.length && (
                <div className="col-span-full py-10 text-center text-ink-mute">No icons found</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface IconPickerProps {
  value?: string;
  onChange: (iconId: string) => void;
  label?: string;
}

function parseIconId(value: string): { libId: string; iconName: string } | null {
  if (!value) return null;
  if (value.includes(':')) {
    const [libId, iconName] = value.split(':');
    return { libId, iconName };
  }
  if (value.length >= 2 && value[0] === value[0].toUpperCase()) {
    const prefix = value.substring(0, 2).toLowerCase();
    const lib = ICON_LIBRARIES.find((l) => l.prefix.toLowerCase().startsWith(prefix) || l.id.startsWith(prefix));
    if (lib) return { libId: lib.id, iconName: value };
    return { libId: 'lucide', iconName: value };
  }
  return { libId: 'lucide', iconName: value };
}

/**
 * One component per `lib:name`, created once and reused — a new component type
 * on every render would remount the icon (and re-run its family load) forever.
 */
const dynamicIcons = new Map<string, React.ComponentType<any>>();

function makeDynamicIcon(libId: string, iconName: string): React.ComponentType<any> {
  const key = `${libId}:${iconName}`;
  const existing = dynamicIcons.get(key);
  if (existing) return existing;

  const Dynamic: React.FC<any> = (props) => {
    const [mod, setMod] = useState<IconModule | null>(() => loaded.get(libId) ?? null);
    useEffect(() => {
      if (mod) return;
      let live = true;
      loadLibrary(libId).then((m) => { if (live) setMod(m); });
      return () => { live = false; };
    }, [mod]);
    const Icon = mod?.[iconName];
    // Until the family lands (and if the name is wrong) hold the space rather
    // than jumping the layout.
    if (!Icon) return <span className={props.className} style={{ display: 'inline-block', width: props.size ?? '1em', height: props.size ?? '1em' }} aria-hidden />;
    return React.createElement(Icon, props);
  };
  Dynamic.displayName = `Icon(${key})`;
  dynamicIcons.set(key, Dynamic);
  return Dynamic;
}

/**
 * The component that draws `value`. Synchronous by contract (callers do
 * `const I = getIconComponent(v); return <I/>`) — the loading happens inside.
 */
function getIconComponent(value: string): React.ComponentType<any> | null {
  const parsed = parseIconId(value);
  if (!parsed) return null;
  if (!ICON_LIBRARIES.some((l) => l.id === parsed.libId)) return null;
  return makeDynamicIcon(parsed.libId, parsed.iconName);
}

const IconPicker = ({ value = '', onChange, label = 'Select Icon' }: IconPickerProps) => {
  const [showModal, setShowModal] = useState(false);
  const CurrentIcon = value ? getIconComponent(value) : null;

  return (
    <div>
      {label && <label className="mb-1 block text-sm font-medium text-ink-soft">{label}</label>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex min-w-[160px] items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 hover:bg-surface-2"
        >
          {CurrentIcon ? (
            <>
              {React.createElement(CurrentIcon, { size: 20, className: 'shrink-0 text-ink-soft' })}
              <span className="truncate text-sm text-ink-soft">{value}</span>
            </>
          ) : (
            <span className="text-sm text-ink-mute">No icon selected</span>
          )}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="rounded p-2 text-ink-mute hover:bg-bad-bg hover:text-bad"
            title="Clear icon"
          >
            <X size={16} />
          </button>
        )}
      </div>
      {showModal && (
        <IconPickerModal
          currentIcon={value}
          onSelect={(id) => { onChange(id); setShowModal(false); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
};

export default IconPicker;
export { getIconComponent, parseIconId, ICON_LIBRARIES };
