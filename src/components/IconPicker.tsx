import React, { useState, useMemo } from 'react';
import * as LucideIcons from 'lucide-react';
import * as FaIcons from 'react-icons/fa';
import * as FiIcons from 'react-icons/fi';
import * as AiIcons from 'react-icons/ai';
import * as BiIcons from 'react-icons/bi';
import * as HiIcons from 'react-icons/hi';
import * as IoIcons from 'react-icons/io5';
import * as MdIcons from 'react-icons/md';
import * as TbIcons from 'react-icons/tb';
import * as BsIcons from 'react-icons/bs';
import { X, Search } from 'lucide-react';

// Icon format: "lib:iconName" e.g. "lucide:Check", "fa:FaCheck"
export const ICON_FORMAT = { prefix: true, separator: ':' };

export interface IconLibrary {
  id: string;
  name: string;
  prefix: string;
  icons: Record<string, React.ComponentType<any>>;
}

const ICON_LIBRARIES: IconLibrary[] = [
  { id: 'lucide', name: 'Lucide', prefix: 'lucide', icons: LucideIcons as any },
  { id: 'fa', name: 'Font Awesome', prefix: 'Fa', icons: FaIcons },
  { id: 'fi', name: 'Feather', prefix: 'Fi', icons: FiIcons },
  { id: 'ai', name: 'Ant Design', prefix: 'Ai', icons: AiIcons },
  { id: 'bi', name: 'Boxicons', prefix: 'Bi', icons: BiIcons },
  { id: 'hi', name: 'Heroicons', prefix: 'Hi', icons: HiIcons },
  { id: 'io', name: 'Ionicons', prefix: 'Io', icons: IoIcons },
  { id: 'md', name: 'Material Design', prefix: 'Md', icons: MdIcons },
  { id: 'tb', name: 'Tabler', prefix: 'Tb', icons: TbIcons },
  { id: 'bs', name: 'Bootstrap', prefix: 'Bs', icons: BsIcons },
];

const INTERNAL_KEYS = new Set(['createLucideIcon', 'default', 'icons', 'lucideReact', 'Icon', 'ForwardRef']);

function getLibraryIcons(lib: IconLibrary): Array<{ name: string; fullId: string; Icon: React.ComponentType<any> }> {
  const list: Array<{ name: string; fullId: string; Icon: React.ComponentType<any> }> = [];
  const prefix = lib.prefix;
  Object.keys(lib.icons).forEach((name) => {
    if (INTERNAL_KEYS.has(name)) return;
    const Icon = lib.icons[name];
    if (!Icon) return;
    if (lib.id === 'lucide') {
      if (name.endsWith('Icon') && name !== 'Icon') return;
      if (name.length < 2) return;
    } else {
      if (!name.startsWith(prefix)) return;
    }
    try {
      list.push({ name, fullId: `${lib.id}:${name}`, Icon });
    } catch {
      // skip invalid
    }
  });
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

const ALL_ICONS: Array<{ name: string; fullId: string; Icon: React.ComponentType<any>; lib: IconLibrary }> = (() => {
  const result: Array<{ name: string; fullId: string; Icon: React.ComponentType<any>; lib: IconLibrary }> = [];
  ICON_LIBRARIES.forEach((lib) => {
    getLibraryIcons(lib).forEach((item) => {
      result.push({ ...item, lib });
    });
  });
  return result;
})();

interface IconPickerModalProps {
  onSelect: (iconId: string) => void;
  onClose: () => void;
  currentIcon?: string;
}

export const IconPickerModal = ({ onSelect, onClose, currentIcon = '' }: IconPickerModalProps) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');

  const filteredIcons = useMemo(() => {
    let list = ALL_ICONS;
    if (category !== 'all') {
      list = list.filter((i) => i.lib.id === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.lib.name.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 300);
  }, [search, category]);

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="p-4 border-b flex items-center justify-between bg-gray-50 rounded-t-xl">
          <h3 className="text-lg font-bold text-gray-900">Select Icon</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 border-b space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              autoFocus
              placeholder="Search icons (e.g. check, truck, user)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                category === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All
            </button>
            {ICON_LIBRARIES.map((lib) => (
              <button
                key={lib.id}
                type="button"
                onClick={() => setCategory(lib.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  category === lib.id ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {lib.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 min-h-[300px]">
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
            {filteredIcons.map(({ name, fullId, Icon }) => (
              <button
                key={fullId}
                type="button"
                onClick={() => {
                  onSelect(fullId);
                  onClose();
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-lg hover:bg-blue-50 hover:border-blue-200 border transition-all aspect-square group ${
                  currentIcon === fullId ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-500 ring-offset-2' : 'bg-white border-transparent shadow-sm'
                }`}
                title={`${name} (${fullId})`}
              >
                {React.createElement(Icon, {
                  className: `mb-2 w-6 h-6 text-gray-600 group-hover:text-blue-600 ${currentIcon === fullId ? 'text-blue-700' : ''}`,
                })}
                <span className="text-[10px] text-gray-500 truncate w-full text-center group-hover:text-blue-700">{name}</span>
              </button>
            ))}
            {filteredIcons.length === 0 && (
              <div className="col-span-full text-center py-10 text-gray-400">No icons found</div>
            )}
          </div>
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

function getIconComponent(value: string): React.ComponentType<any> | null {
  const parsed = parseIconId(value);
  if (!parsed) return null;
  const lib = ICON_LIBRARIES.find((l) => l.id === parsed.libId);
  if (!lib) return null;
  const Icon = lib.icons[parsed.iconName];
  return Icon || null;
}

const IconPicker = ({ value = '', onChange, label = 'Select Icon' }: IconPickerProps) => {
  const [showModal, setShowModal] = useState(false);
  const CurrentIcon = value ? getIconComponent(value) : null;

  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 min-w-[160px] justify-between"
        >
          {CurrentIcon ? (
            <>
              {React.createElement(CurrentIcon, { size: 20, className: 'text-gray-600 flex-shrink-0' })}
              <span className="text-sm text-gray-700 truncate">{value}</span>
            </>
          ) : (
            <span className="text-sm text-gray-500">No icon selected</span>
          )}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            title="Clear icon"
          >
            <X size={16} />
          </button>
        )}
      </div>
      {showModal && (
        <IconPickerModal
          currentIcon={value}
          onSelect={(id) => {
            onChange(id);
            setShowModal(false);
          }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
};

export default IconPicker;
export { getIconComponent, parseIconId, ICON_LIBRARIES };
