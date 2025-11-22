import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaGlobe, FaImage, FaPalette, FaInstagram, FaFont, FaBars, FaPlus, FaTrash, FaArrowUp, FaArrowDown, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import api from '../services/api';
import ImageInputWithActions from '../components/common/ImageInputWithActions';
import MegaMenuEditor from '../components/menu/MegaMenuEditor';

const GeneralSettings: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    general: {
      websiteUrl: '',
      siteName: '',
      siteDescription: '',
    },
    logo: {
      logoUrl: '',
      faviconUrl: '',
      adminLogoUrl: '',
    },
    colors: {
      primaryColor: '#EF4444',
      secondaryColor: '#F59E0B',
      accentColor: '#10B981',
      backgroundColor: '#FFFFFF',
      textColor: '#111827',
      linkColor: '#3B82F6',
    },
    fonts: {
      fontFamily: 'Inter',
      headingFontFamily: '',
      bodyFontFamily: '',
      fontSize: {},
    },
    menu: {
      items: [],
    },
    instagram: {
      username: '',
      isEnabled: false,
    },
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/settings/admin');
      if (response.data.success && response.data.data) {
        const settings = response.data.data;
        setFormData({
          general: {
            websiteUrl: settings.general?.websiteUrl || '',
            siteName: settings.general?.siteName || '',
            siteDescription: settings.general?.siteDescription || '',
          },
          logo: {
            logoUrl: settings.logo?.logoUrl || '',
            faviconUrl: settings.logo?.faviconUrl || '',
            adminLogoUrl: settings.logo?.adminLogoUrl || '',
          },
          colors: {
            primaryColor: settings.colors?.primaryColor || '#EF4444',
            secondaryColor: settings.colors?.secondaryColor || '#F59E0B',
            accentColor: settings.colors?.accentColor || '#10B981',
            backgroundColor: settings.colors?.backgroundColor || '#FFFFFF',
            textColor: settings.colors?.textColor || '#111827',
            linkColor: settings.colors?.linkColor || '#3B82F6',
          },
          fonts: {
            fontFamily: settings.fonts?.fontFamily || 'Inter',
            headingFontFamily: settings.fonts?.headingFontFamily || '',
            bodyFontFamily: settings.fonts?.bodyFontFamily || '',
            fontSize: settings.fonts?.fontSize || {},
          },
          menu: {
            items: settings.menu?.items || [],
          },
          instagram: {
            username: settings.instagram?.username || '',
            isEnabled: settings.instagram?.isEnabled || false,
          },
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch settings:', error);
      alert('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Ensure instagram config is properly structured
      const settingsToSave = {
        general: formData.general,
        logo: formData.logo,
        colors: formData.colors,
        fonts: formData.fonts,
        menu: formData.menu,
        instagram: formData.instagram,
      };
      
      const response = await api.put('/settings', settingsToSave);
      if (response.data.success) {
        alert('Settings saved successfully!');
      } else {
        alert('Settings saved but response format unexpected');
      }
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          'Failed to save settings';
      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (section: string, field: string, value: string | boolean | any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section as keyof typeof prev],
        [field]: value,
      },
    }));
  };

  const handleMenuItemChange = (index: number, field: string, value: any) => {
    setFormData(prev => {
      const newItems = [...(prev.menu?.items || [])];
      if (newItems[index]) {
        if (field === 'megaMenu') {
          newItems[index] = {
            ...newItems[index],
            megaMenu: value,
          };
        } else {
          newItems[index] = {
            ...newItems[index],
            [field]: value,
          };
        }
      }
      return {
        ...prev,
        menu: {
          ...prev.menu,
          items: newItems,
        },
      };
    });
  };

  const addMenuItem = () => {
    setFormData(prev => {
      const currentItems = prev.menu?.items || [];
      return {
        ...prev,
        menu: {
          ...prev.menu,
          items: [
            ...currentItems,
            {
              label: '',
              type: 'link' as const,
              target: '',
              order: currentItems.length,
              isVisible: true,
              openInNewTab: false,
            },
          ],
        },
      };
    });
  };

  const removeMenuItem = (index: number) => {
    setFormData(prev => {
      const currentItems = prev.menu?.items || [];
      return {
        ...prev,
        menu: {
          ...prev.menu,
          items: currentItems.filter((_, i) => i !== index).map((item, i) => ({
            ...item,
            order: i,
          })),
        },
      };
    });
  };

  const moveMenuItem = (index: number, direction: 'up' | 'down') => {
    setFormData(prev => {
      const items = [...(prev.menu.items || [])];
      if (direction === 'up' && index > 0) {
        [items[index - 1], items[index]] = [items[index], items[index - 1]];
        items[index - 1].order = index - 1;
        items[index].order = index;
      } else if (direction === 'down' && index < items.length - 1) {
        [items[index], items[index + 1]] = [items[index + 1], items[index]];
        items[index].order = index;
        items[index + 1].order = index + 1;
      }
      return {
        ...prev,
        menu: {
          items,
        },
      };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <FaArrowLeft className="mr-2" />
          Back to Settings
        </button>
        <h1 className="text-3xl font-bold text-gray-900">General Settings</h1>
        <p className="text-sm text-gray-600 mt-2">Configure website URL, logo, and color scheme</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FaGlobe className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">General Information</h2>
              <p className="text-sm text-gray-600">Website URL and site information</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Website URL
              </label>
              <input
                type="text"
                value={formData.general.websiteUrl}
                onChange={(e) => handleChange('general', 'websiteUrl', e.target.value)}
                placeholder="https://redfit.in"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <p className="text-xs text-gray-500 mt-1">Your live website URL (e.g., https://redfit.in)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Site Name
              </label>
              <input
                type="text"
                value={formData.general.siteName}
                onChange={(e) => handleChange('general', 'siteName', e.target.value)}
                placeholder="Redfit"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Site Description
              </label>
              <textarea
                value={formData.general.siteDescription}
                onChange={(e) => handleChange('general', 'siteDescription', e.target.value)}
                placeholder="Premium apparel and fashion store"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>
        </div>

        {/* Logo Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <FaImage className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Logo & Icons</h2>
              <p className="text-sm text-gray-600">Configure logo URLs for website and admin panel</p>
            </div>
          </div>

          <div className="space-y-4">
            <ImageInputWithActions
              value={formData.logo.logoUrl}
              onChange={(url) => handleChange('logo', 'logoUrl', url)}
              label="Main Logo URL"
              placeholder="https://cdn.redfit.in/logo.png"
            />

            <ImageInputWithActions
              value={formData.logo.faviconUrl}
              onChange={(url) => handleChange('logo', 'faviconUrl', url)}
              label="Favicon URL"
              placeholder="https://cdn.redfit.in/favicon.ico"
            />

            <ImageInputWithActions
              value={formData.logo.adminLogoUrl}
              onChange={(url) => handleChange('logo', 'adminLogoUrl', url)}
              label="Admin Logo URL"
              placeholder="https://cdn.redfit.in/admin-logo.png"
            />
          </div>
        </div>

        {/* Color Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-shrink-0 w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
              <FaPalette className="w-6 h-6 text-pink-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Color Scheme</h2>
              <p className="text-sm text-gray-600">Configure brand colors for your website</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Primary Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.colors.primaryColor}
                  onChange={(e) => handleChange('colors', 'primaryColor', e.target.value)}
                  className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.colors.primaryColor}
                  onChange={(e) => handleChange('colors', 'primaryColor', e.target.value)}
                  placeholder="#EF4444"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Secondary Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.colors.secondaryColor}
                  onChange={(e) => handleChange('colors', 'secondaryColor', e.target.value)}
                  className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.colors.secondaryColor}
                  onChange={(e) => handleChange('colors', 'secondaryColor', e.target.value)}
                  placeholder="#F59E0B"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Accent Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.colors.accentColor}
                  onChange={(e) => handleChange('colors', 'accentColor', e.target.value)}
                  className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.colors.accentColor}
                  onChange={(e) => handleChange('colors', 'accentColor', e.target.value)}
                  placeholder="#10B981"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Background Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.colors.backgroundColor}
                  onChange={(e) => handleChange('colors', 'backgroundColor', e.target.value)}
                  className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.colors.backgroundColor}
                  onChange={(e) => handleChange('colors', 'backgroundColor', e.target.value)}
                  placeholder="#FFFFFF"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Text Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.colors.textColor}
                  onChange={(e) => handleChange('colors', 'textColor', e.target.value)}
                  className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.colors.textColor}
                  onChange={(e) => handleChange('colors', 'textColor', e.target.value)}
                  placeholder="#111827"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Link Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.colors.linkColor}
                  onChange={(e) => handleChange('colors', 'linkColor', e.target.value)}
                  className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.colors.linkColor}
                  onChange={(e) => handleChange('colors', 'linkColor', e.target.value)}
                  placeholder="#3B82F6"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Font Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-shrink-0 w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <FaFont className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Font Configuration</h2>
              <p className="text-sm text-gray-600">Configure fonts for your website</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Primary Font Family
              </label>
              <input
                type="text"
                value={formData.fonts.fontFamily}
                onChange={(e) => handleChange('fonts', 'fontFamily', e.target.value)}
                placeholder="Inter, sans-serif"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <p className="text-xs text-gray-500 mt-1">Default font family for the entire site (e.g., Inter, Roboto, Poppins)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Heading Font Family (Optional)
              </label>
              <input
                type="text"
                value={formData.fonts.headingFontFamily}
                onChange={(e) => handleChange('fonts', 'headingFontFamily', e.target.value)}
                placeholder="Leave empty to use primary font"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <p className="text-xs text-gray-500 mt-1">Font family for headings. Leave empty to use primary font.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Body Font Family (Optional)
              </label>
              <input
                type="text"
                value={formData.fonts.bodyFontFamily}
                onChange={(e) => handleChange('fonts', 'bodyFontFamily', e.target.value)}
                placeholder="Leave empty to use primary font"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <p className="text-xs text-gray-500 mt-1">Font family for body text. Leave empty to use primary font.</p>
            </div>
          </div>
        </div>

        {/* Menu Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <FaBars className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Menu Configuration</h2>
              <p className="text-sm text-gray-600">Configure navigation menu items</p>
            </div>
          </div>

          <div className="space-y-4">
            {formData.menu.items.map((item, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">Menu Item #{index + 1}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => moveMenuItem(index, 'up')}
                      disabled={index === 0}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      title="Move up"
                    >
                      <FaArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMenuItem(index, 'down')}
                      disabled={index === formData.menu.items.length - 1}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      title="Move down"
                    >
                      <FaArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeMenuItem(index)}
                      className="p-1 text-red-400 hover:text-red-600"
                      title="Remove"
                    >
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
                      onChange={(e) => handleMenuItemChange(index, 'label', e.target.value)}
                      placeholder="Home"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={item.type}
                      onChange={(e) => handleMenuItemChange(index, 'type', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="link">Link (External)</option>
                      <option value="page">Page (Internal)</option>
                      <option value="category">Category</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Target {item.type === 'link' ? '(URL)' : item.type === 'category' ? '(Category Slug)' : '(Page Name)'}
                    </label>
                    <input
                      type="text"
                      value={item.target || ''}
                      onChange={(e) => handleMenuItemChange(index, 'target', e.target.value)}
                      placeholder={item.type === 'link' ? 'https://example.com' : item.type === 'category' ? 'category-slug' : 'home'}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Order</label>
                      <input
                        type="number"
                        value={item.order}
                        onChange={(e) => handleMenuItemChange(index, 'order', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={item.isVisible}
                      onChange={(e) => handleMenuItemChange(index, 'isVisible', e.target.checked)}
                      className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                    />
                    Visible
                  </label>
                  {item.type === 'link' && (
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={item.openInNewTab || false}
                        onChange={(e) => handleMenuItemChange(index, 'openInNewTab', e.target.checked)}
                        className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                      />
                      Open in New Tab
                    </label>
                  )}
                </div>

                {/* Mega Menu Configuration */}
                <MegaMenuEditor
                  megaMenu={item.megaMenu}
                  onChange={(megaMenu) => handleMenuItemChange(index, 'megaMenu', megaMenu)}
                  menuItemIndex={index}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={addMenuItem}
              className="w-full py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-red-500 hover:text-red-600 transition-colors flex items-center justify-center gap-2"
            >
              <FaPlus className="w-4 h-4" />
              Add Menu Item
            </button>
            {formData.menu.items.length === 0 && (
              <p className="text-sm text-gray-500 text-center">No menu items configured. Add items above or use default menu.</p>
            )}
          </div>
        </div>

        {/* Instagram Settings */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <FaInstagram className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Instagram Feed</h2>
              <p className="text-sm text-gray-600">Configure Instagram account for dynamic feed</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="instagramEnabled"
                checked={formData.instagram.isEnabled}
                onChange={(e) => handleChange('instagram', 'isEnabled', e.target.checked)}
                className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
              />
              <label htmlFor="instagramEnabled" className="text-sm font-medium text-gray-700">
                Enable Instagram Feed
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Instagram Username
              </label>
              <input
                type="text"
                value={formData.instagram.username}
                onChange={(e) => handleChange('instagram', 'username', e.target.value)}
                placeholder="thestreetwear_clothings"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                disabled={!formData.instagram.isEnabled}
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter Instagram username without @ (e.g., thestreetwear_clothings)
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400 font-medium flex items-center gap-2"
          >
            <FaSave className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default GeneralSettings;

