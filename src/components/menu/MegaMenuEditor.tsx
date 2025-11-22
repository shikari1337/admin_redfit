import React, { useState } from 'react';
import { FaPlus, FaTrash, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import ImageInputWithActions from '../common/ImageInputWithActions';

interface MegaMenuEditorProps {
  megaMenu: any;
  onChange: (megaMenu: any) => void;
  menuItemIndex: number;
}

const MegaMenuEditor: React.FC<MegaMenuEditorProps> = ({ megaMenu, onChange, menuItemIndex }) => {
  const [isOpen, setIsOpen] = useState(false);
  const megaMenuData = megaMenu || {
    isMegaMenu: false,
    columns: [],
    featuredImage: '',
    featuredImageLink: '',
    featuredImageAlt: '',
    layout: 'columns',
  };

  const handleColumnChange = (columnIndex: number, field: string, value: any) => {
    const columns = [...(megaMenuData.columns || [])];
    columns[columnIndex] = {
      ...columns[columnIndex],
      [field]: value,
    };
    onChange({ ...megaMenuData, columns });
  };

  const handleLinkChange = (columnIndex: number, linkIndex: number, field: string, value: any) => {
    const columns = [...(megaMenuData.columns || [])];
    const links = [...(columns[columnIndex].links || [])];
    links[linkIndex] = {
      ...links[linkIndex],
      [field]: value,
    };
    columns[columnIndex] = {
      ...columns[columnIndex],
      links,
    };
    onChange({ ...megaMenuData, columns });
  };

  const addColumn = () => {
    const columns = [...(megaMenuData.columns || []), { title: '', links: [] }];
    onChange({ ...megaMenuData, columns });
  };

  const removeColumn = (columnIndex: number) => {
    const columns = (megaMenuData.columns || []).filter((_: any, i: number) => i !== columnIndex);
    onChange({ ...megaMenuData, columns });
  };

  const addLink = (columnIndex: number) => {
    const columns = [...(megaMenuData.columns || [])];
    const links = [...(columns[columnIndex].links || []), { label: '', type: 'link', target: '', openInNewTab: false }];
    columns[columnIndex] = {
      ...columns[columnIndex],
      links,
    };
    onChange({ ...megaMenuData, columns });
  };

  const removeLink = (columnIndex: number, linkIndex: number) => {
    const columns = [...(megaMenuData.columns || [])];
    const links = (columns[columnIndex].links || []).filter((_: any, i: number) => i !== linkIndex);
    columns[columnIndex] = {
      ...columns[columnIndex],
      links,
    };
    onChange({ ...megaMenuData, columns });
  };

  if (!megaMenuData.isMegaMenu) {
    return (
      <div className="mt-3 pt-3 border-t border-gray-200">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={megaMenuData.isMegaMenu}
            onChange={(e) => onChange({ ...megaMenuData, isMegaMenu: e.target.checked })}
            className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
          />
          Enable Mega Menu
        </label>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={megaMenuData.isMegaMenu}
            onChange={(e) => onChange({ ...megaMenuData, isMegaMenu: e.target.checked })}
            className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
          />
          Enable Mega Menu
        </label>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="text-gray-600 hover:text-gray-900"
        >
          {isOpen ? <FaChevronUp /> : <FaChevronDown />}
        </button>
      </div>

      {isOpen && (
        <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
          {/* Layout Selection */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Layout</label>
            <select
              value={megaMenuData.layout || 'columns'}
              onChange={(e) => onChange({ ...megaMenuData, layout: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="columns">Columns</option>
              <option value="grid">Grid</option>
              <option value="tabs">Tabs</option>
            </select>
          </div>

          {/* Featured Image */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Featured Image (Optional)</label>
            <ImageInputWithActions
              value={megaMenuData.featuredImage || ''}
              onChange={(url) => onChange({ ...megaMenuData, featuredImage: url })}
              label=""
              placeholder="Enter image URL or upload"
              productId={`menu-${menuItemIndex}`}
              sectionId="mega-menu"
              fieldPath="featuredImage"
            />
            <input
              type="text"
              value={megaMenuData.featuredImageLink || ''}
              onChange={(e) => onChange({ ...megaMenuData, featuredImageLink: e.target.value })}
              placeholder="Image Link (Optional)"
              className="w-full mt-2 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <input
              type="text"
              value={megaMenuData.featuredImageAlt || ''}
              onChange={(e) => onChange({ ...megaMenuData, featuredImageAlt: e.target.value })}
              placeholder="Image Alt Text (Optional)"
              className="w-full mt-2 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* Columns */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-gray-700">Columns</label>
              <button
                type="button"
                onClick={addColumn}
                className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
              >
                <FaPlus className="w-3 h-3" /> Add Column
              </button>
            </div>
            {(megaMenuData.columns || []).map((column: any, columnIndex: number) => (
              <div key={columnIndex} className="border border-gray-300 rounded-lg p-3 mb-3 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <input
                    type="text"
                    value={column.title || ''}
                    onChange={(e) => handleColumnChange(columnIndex, 'title', e.target.value)}
                    placeholder="Column Title (Optional)"
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <button
                    type="button"
                    onClick={() => removeColumn(columnIndex)}
                    className="ml-2 text-red-500 hover:text-red-700"
                  >
                    <FaTrash className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {(column.links || []).map((link: any, linkIndex: number) => (
                    <div key={linkIndex} className="flex gap-2 items-start bg-gray-50 p-2 rounded">
                      <input
                        type="text"
                        value={link.label || ''}
                        onChange={(e) => handleLinkChange(columnIndex, linkIndex, 'label', e.target.value)}
                        placeholder="Link Label"
                        className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <select
                        value={link.type || 'link'}
                        onChange={(e) => handleLinkChange(columnIndex, linkIndex, 'type', e.target.value)}
                        className="w-24 px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        <option value="link">Link</option>
                        <option value="category">Category</option>
                        <option value="page">Page</option>
                      </select>
                      <input
                        type="text"
                        value={link.target || ''}
                        onChange={(e) => handleLinkChange(columnIndex, linkIndex, 'target', e.target.value)}
                        placeholder="Target"
                        className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeLink(columnIndex, linkIndex)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <FaTrash className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addLink(columnIndex)}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <FaPlus className="w-3 h-3" /> Add Link
                  </button>
                </div>
              </div>
            ))}
            {(!megaMenuData.columns || megaMenuData.columns.length === 0) && (
              <p className="text-xs text-gray-500 text-center py-2">No columns added. Click "Add Column" to get started.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MegaMenuEditor;

