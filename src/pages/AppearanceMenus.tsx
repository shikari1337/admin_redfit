import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaBars, FaPlus, FaTrash, FaArrowUp, FaArrowDown } from 'react-icons/fa';
import api from '../services/api';
import { categoriesAPI, pagesAPI } from '../services/api';
import MegaMenuEditor from '../components/menu/MegaMenuEditor';

interface MenuItem {
  label: string;
  type: 'link' | 'category' | 'page';
  target?: string;
  order: number;
  isVisible: boolean;
  openInNewTab?: boolean;
  megaMenu?: {
    isMegaMenu?: boolean;
    layout?: 'columns' | 'grid' | 'tabs';
    columns?: Array<{
      title?: string;
      links: Array<{
        label: string;
        type: 'link' | 'category' | 'page';
        target?: string;
        openInNewTab?: boolean;
      }>;
    }>;
    featuredImage?: string;
    featuredImageLink?: string;
    featuredImageAlt?: string;
  };
}

const AppearanceMenus: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<Array<{ _id: string; name: string; slug: string }>>([]);
  const [availablePages, setAvailablePages] = useState<Array<{ _id: string; title: string; slug: string }>>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  useEffect(() => {
    fetchSettings();
    fetchLookups();
  }, []);

  const fetchLookups = async () => {
    setLoadingLookups(true);
    try {
      const [catResponse, pagesResponse] = await Promise.all([
        categoriesAPI.list().catch(() => ({ data: [] })),
        pagesAPI.getAll().catch(() => ({ data: { data: [] } })),
      ]);
      let categories: any[] = Array.isArray(catResponse) ? catResponse : catResponse?.data ?? catResponse?.data?.data ?? [];
      let pages: any[] = Array.isArray(pagesResponse) ? pagesResponse : pagesResponse?.data ?? pagesResponse?.data?.data ?? [];
      setAvailableCategories((categories as any[]).map((c: any) => ({ _id: String(c._id || ''), slug: c.slug || '', name: c.name || '' })));
      setAvailablePages((pages as any[]).map((p: any) => ({ _id: String(p._id || ''), slug: p.slug || '', title: p.title || '' })));
    } catch {
      setAvailableCategories([]);
      setAvailablePages([]);
    } finally {
      setLoadingLookups(false);
    }
  };

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/settings/admin');
      const settings = response.data?.success && response.data?.data ? response.data.data : response.data?.data ?? response.data;
      setMenuItems((settings?.menu?.items ?? []) as MenuItem[]);
    } catch {
      setMenuItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings', { menu: { items: menuItems } });
      alert('Menu saved successfully!');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to save menu');
    } finally {
      setSaving(false);
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    setMenuItems((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = field === 'megaMenu' ? { ...next[index], megaMenu: value } : { ...next[index], [field]: value };
      }
      return next;
    });
  };

  const addItem = () => {
    setMenuItems((prev) => [
      ...prev,
      { label: '', type: 'link', target: '', order: prev.length, isVisible: true, openInNewTab: false },
    ]);
  };

  const removeItem = (index: number) => {
    setMenuItems((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, order: i })));
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    setMenuItems((prev) => {
      const items = [...prev];
      if (direction === 'up' && index > 0) {
        [items[index - 1], items[index]] = [items[index], items[index - 1]];
      } else if (direction === 'down' && index < items.length - 1) {
        [items[index], items[index + 1]] = [items[index + 1], items[index]];
      }
      return items.map((item, i) => ({ ...item, order: i }));
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center h-64 items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <button onClick={() => navigate('/appearance/pages')} className="flex items-center text-gray-600 hover:text-gray-900 mb-4">
          <FaArrowLeft className="mr-2" />
          Back to Appearance
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Menus</h1>
        <p className="text-sm text-gray-600 mt-2">Configure navigation menu items for your storefront</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <FaBars className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Menu Configuration</h2>
              <p className="text-sm text-gray-600">Add and reorder menu items. Link to pages, categories, or external URLs.</p>
            </div>
          </div>

          <div className="space-y-4">
            {menuItems.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">Menu Item #{index + 1}</span>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => moveItem(index, 'up')} disabled={index === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30" title="Move up">
                      <FaArrowUp className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => moveItem(index, 'down')} disabled={index === menuItems.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30" title="Move down">
                      <FaArrowDown className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => removeItem(index)} className="p-1 text-red-400 hover:text-red-600" title="Remove">
                      <FaTrash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Label</label>
                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) => updateItem(index, 'label', e.target.value)}
                      placeholder="Home"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={item.type}
                      onChange={(e) => updateItem(index, 'type', e.target.value as any)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="link">Link (External)</option>
                      <option value="page">Page (Internal)</option>
                      <option value="category">Category</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Target {item.type === 'link' ? '(URL)' : item.type === 'category' ? '(Select Category)' : '(Select Page)'}
                    </label>
                    {item.type === 'category' ? (
                      <select
                        value={item.target || ''}
                        onChange={(e) => updateItem(index, 'target', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                        disabled={loadingLookups}
                      >
                        <option value="">Select Category</option>
                        {availableCategories.map((cat) => (
                          <option key={cat._id} value={cat.slug}>
                            {cat.name} {cat.slug && `(${cat.slug})`}
                          </option>
                        ))}
                      </select>
                    ) : item.type === 'page' ? (
                      <select
                        value={item.target || ''}
                        onChange={(e) => updateItem(index, 'target', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                        disabled={loadingLookups}
                      >
                        <option value="">Select Page</option>
                        {availablePages.map((page) => (
                          <option key={page._id} value={page.slug}>
                            {page.title} {page.slug && `(${page.slug})`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={item.target || ''}
                        onChange={(e) => updateItem(index, 'target', e.target.value)}
                        placeholder="https://example.com"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    )}
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={item.isVisible}
                        onChange={(e) => updateItem(index, 'isVisible', e.target.checked)}
                        className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                      />
                      Visible
                    </label>
                    {item.type === 'link' && (
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={item.openInNewTab || false}
                          onChange={(e) => updateItem(index, 'openInNewTab', e.target.checked)}
                          className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                        />
                        Open in New Tab
                      </label>
                    )}
                  </div>
                </div>
                <MegaMenuEditor megaMenu={item.megaMenu} onChange={(megaMenu) => updateItem(index, 'megaMenu', megaMenu)} menuItemIndex={index} />
              </div>
            ))}
            <button
              type="button"
              onClick={addItem}
              className="w-full py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-red-500 hover:text-red-600 transition-colors flex items-center justify-center gap-2"
            >
              <FaPlus className="w-4 h-4" /> Add Menu Item
            </button>
            {menuItems.length === 0 && (
              <p className="text-sm text-gray-500 text-center">No menu items configured. Add items above.</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/appearance/pages')} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400 font-medium flex items-center gap-2">
            <FaSave className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Menu'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AppearanceMenus;
