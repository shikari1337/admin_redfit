import React, { useState, useMemo } from 'react';
import * as FaIcons from 'react-icons/fa';
import * as FiIcons from 'react-icons/fi';
import * as AiIcons from 'react-icons/ai';
import * as BiIcons from 'react-icons/bi';
import * as HiIcons from 'react-icons/hi';
import * as IoIcons from 'react-icons/io5';
import * as MdIcons from 'react-icons/md';
import * as TbIcons from 'react-icons/tb';
import * as BsIcons from 'react-icons/bs';
import { FaSearch, FaTimes } from 'react-icons/fa';

interface IconPickerProps {
  value?: string; // Icon name like "FaCheck", "FiSettings", etc.
  onChange: (iconName: string) => void;
  label?: string;
}

// Get all icon libraries
const iconLibraries = [
  { name: 'Font Awesome', prefix: 'Fa', icons: FaIcons },
  { name: 'Feather', prefix: 'Fi', icons: FiIcons },
  { name: 'Ant Design', prefix: 'Ai', icons: AiIcons },
  { name: 'Boxicons', prefix: 'Bi', icons: BiIcons },
  { name: 'Heroicons', prefix: 'Hi', icons: HiIcons },
  { name: 'Ionicons', prefix: 'Io', icons: IoIcons },
  { name: 'Material Design', prefix: 'Md', icons: MdIcons },
  { name: 'Tabler', prefix: 'Tb', icons: TbIcons },
  { name: 'Bootstrap', prefix: 'Bs', icons: BsIcons },
];

// Get all available icons
const getAllIcons = () => {
  const allIcons: Array<{ name: string; component: React.ComponentType<any>; library: string }> = [];
  
  iconLibraries.forEach((lib) => {
    Object.keys(lib.icons).forEach((iconName) => {
      // Only include icons that start with the library prefix
      if (iconName.startsWith(lib.prefix)) {
        const IconComponent = (lib.icons as any)[iconName];
        if (IconComponent && typeof IconComponent === 'function') {
          allIcons.push({
            name: iconName,
            component: IconComponent,
            library: lib.name,
          });
        }
      }
    });
  });
  
  return allIcons.sort((a, b) => a.name.localeCompare(b.name));
};

// Popular icons for quick access
const popularIcons = [
  'FaCheck', 'FaTimes', 'FaInfo', 'FaExclamation', 'FaShield', 'FaStar', 'FaHeart',
  'FaTruck', 'FaCreditCard', 'FaUndo', 'FaExchangeAlt', 'FaShippingFast', 'FaGift',
  'FaThumbsUp', 'FaAward', 'FaRocket', 'FaFire', 'FaLock', 'FaUnlock', 'FaUser',
  'FaHome', 'FaShoppingCart', 'FaBasketShopping', 'FaTag', 'FaPercent', 'FaBell',
  'FaEnvelope', 'FaPhone', 'FaWhatsapp', 'FaInstagram', 'FaFacebook', 'FaTwitter',
];

const IconPicker: React.FC<IconPickerProps> = ({ value, onChange, label = 'Select Icon' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLibrary, setSelectedLibrary] = useState<string>('all');

  const allIcons = useMemo(() => getAllIcons(), []);
  
  // Filter icons based on search and library
  const filteredIcons = useMemo(() => {
    let filtered = allIcons;
    
    if (selectedLibrary !== 'all') {
      const lib = iconLibraries.find(l => l.name === selectedLibrary);
      if (lib) {
        filtered = filtered.filter(icon => icon.name.startsWith(lib.prefix));
      }
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(icon => 
        icon.name.toLowerCase().includes(query) ||
        icon.library.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [allIcons, searchQuery, selectedLibrary]);

  // Get popular icons
  const popularIconsList = useMemo(() => {
    return allIcons.filter(icon => popularIcons.includes(icon.name));
  }, [allIcons]);

  // Get current icon component
  const CurrentIcon = useMemo(() => {
    if (!value) return null;
    const icon = allIcons.find(i => i.name === value);
    return icon ? icon.component : null;
  }, [value, allIcons]);

  const handleIconSelect = (iconName: string) => {
    onChange(iconName);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <div className="flex items-center gap-2">
          {CurrentIcon ? (
            <>
              <CurrentIcon className="w-5 h-5 text-gray-600" />
              <span className="text-sm text-gray-700">{value}</span>
            </>
          ) : (
            <span className="text-sm text-gray-500">No icon selected</span>
          )}
        </div>
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="text-gray-400 hover:text-red-600"
          >
            <FaTimes className="w-4 h-4" />
          </button>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Picker Modal */}
          <div className="absolute z-50 mt-1 w-full max-w-2xl bg-white border border-gray-300 rounded-lg shadow-xl max-h-96 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Select Icon</h3>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <FaTimes className="w-4 h-4" />
                </button>
              </div>
              
              {/* Search */}
              <div className="relative">
                <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search icons..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {/* Library Filter */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedLibrary('all')}
                  className={`px-2 py-1 text-xs rounded ${
                    selectedLibrary === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  All
                </button>
                {iconLibraries.map((lib) => (
                  <button
                    key={lib.name}
                    type="button"
                    onClick={() => setSelectedLibrary(lib.name)}
                    className={`px-2 py-1 text-xs rounded ${
                      selectedLibrary === lib.name
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {lib.name}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Icons Grid */}
            <div className="p-4 overflow-y-auto max-h-64">
              {popularIconsList.length > 0 && !searchQuery && selectedLibrary === 'all' && (
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-gray-700 mb-2">Popular Icons</h4>
                  <div className="grid grid-cols-8 gap-2">
                    {popularIconsList.map((icon) => {
                      const IconComponent = icon.component;
                      return (
                        <button
                          key={icon.name}
                          type="button"
                          onClick={() => handleIconSelect(icon.name)}
                          className={`p-2 border rounded hover:bg-blue-50 hover:border-blue-500 transition-colors ${
                            value === icon.name
                              ? 'bg-blue-100 border-blue-500'
                              : 'border-gray-200'
                          }`}
                          title={icon.name}
                        >
                          {React.createElement(IconComponent, { className: "w-5 h-5 text-gray-600" })}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              
              <div className="mb-2">
                <h4 className="text-xs font-semibold text-gray-700 mb-2">
                  {searchQuery ? `Search Results (${filteredIcons.length})` : `All Icons (${filteredIcons.length})`}
                </h4>
                <div className="grid grid-cols-8 gap-2">
                  {filteredIcons.slice(0, 200).map((icon) => {
                    const IconComponent = icon.component;
                    return (
                      <button
                        key={icon.name}
                        type="button"
                        onClick={() => handleIconSelect(icon.name)}
                        className={`p-2 border rounded hover:bg-blue-50 hover:border-blue-500 transition-colors ${
                          value === icon.name
                            ? 'bg-blue-100 border-blue-500'
                            : 'border-gray-200'
                        }`}
                        title={`${icon.name} (${icon.library})`}
                      >
                        {React.createElement(IconComponent, { className: "w-5 h-5 text-gray-600" })}
                      </button>
                    );
                  })}
                </div>
                {filteredIcons.length > 200 && (
                  <p className="text-xs text-gray-500 mt-2">
                    Showing first 200 icons. Use search to find specific icons.
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default IconPicker;

