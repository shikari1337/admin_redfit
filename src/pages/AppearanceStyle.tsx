import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaGlobe, FaImage, FaPalette, FaFont, FaInstagram } from 'react-icons/fa';
import ImageInputWithActions from '../components/common/ImageInputWithActions';
import { useSettingsSection } from '../hooks/useSettingsSection';

interface FormData {
  general: { websiteUrl: string; siteName: string; siteDescription: string; returnPeriodDays: number };
  logo: { logoUrl: string; faviconUrl: string; adminLogoUrl: string };
  colors: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    backgroundColor: string;
    textColor: string;
    linkColor: string;
  };
  fonts: {
    fontFamily: string;
    headingFontFamily: string;
    bodyFontFamily: string;
  };
  instagram: { username: string; isEnabled: boolean };
  announcementBar: { text: string; bgColor: string; textColor: string; link: string; isEnabled: boolean };
}

const DEFAULT_FORM_DATA: FormData = {
  general: { websiteUrl: '', siteName: '', siteDescription: '', returnPeriodDays: 0 },
  logo: { logoUrl: '', faviconUrl: '', adminLogoUrl: '' },
  colors: {
    primaryColor: '#0D9488',
    secondaryColor: '#F59E0B',
    accentColor: '#10B981',
    backgroundColor: '#FFFFFF',
    textColor: '#111827',
    linkColor: '#0D9488',
  },
  fonts: { fontFamily: 'Inter', headingFontFamily: '', bodyFontFamily: '' },
  instagram: { username: '', isEnabled: false },
  announcementBar: { text: 'Free Shipping on orders above ₹500', bgColor: '#f9fafb', textColor: '#111827', link: '', isEnabled: true },
};

const AppearanceStyle: React.FC = () => {
  const navigate = useNavigate();

  const { formData, setFormData, loading, saving, handleSubmit } = useSettingsSection<FormData>({
    defaults: DEFAULT_FORM_DATA,
    parse: (settings) => ({
      general: {
        websiteUrl: settings.general?.websiteUrl || '',
        siteName: settings.general?.siteName || '',
        siteDescription: settings.general?.siteDescription || '',
        returnPeriodDays: settings.general?.returnPeriodDays || 0,
      },
      logo: {
        logoUrl: settings.logo?.logoUrl || '',
        faviconUrl: settings.logo?.faviconUrl || '',
        adminLogoUrl: settings.logo?.adminLogoUrl || '',
      },
      colors: {
        primaryColor: settings.colors?.primaryColor || '#0D9488',
        secondaryColor: settings.colors?.secondaryColor || '#F59E0B',
        accentColor: settings.colors?.accentColor || '#10B981',
        backgroundColor: settings.colors?.backgroundColor || '#FFFFFF',
        textColor: settings.colors?.textColor || '#111827',
        linkColor: settings.colors?.linkColor || '#0D9488',
      },
      fonts: {
        fontFamily: settings.fonts?.fontFamily || 'Inter',
        headingFontFamily: settings.fonts?.headingFontFamily || '',
        bodyFontFamily: settings.fonts?.bodyFontFamily || '',
      },
      instagram: {
        username: settings.instagram?.username || '',
        isEnabled: settings.instagram?.isEnabled || false,
      },
      announcementBar: {
        text: settings.announcementBar?.text || 'Free Shipping on orders above ₹500',
        bgColor: settings.announcementBar?.bgColor || '#f9fafb',
        textColor: settings.announcementBar?.textColor || '#111827',
        link: settings.announcementBar?.link || '',
        isEnabled: settings.announcementBar?.isEnabled !== false,
      },
    }),
    successMessage: 'Style settings saved! Your storefront will reflect these changes.',
    onError: (error: any) => alert(error?.response?.data?.message || 'Failed to save'),
  });

  const handleChange = (section: keyof FormData, field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
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
        <h1 className="text-3xl font-bold text-gray-900">Style Settings</h1>
        <p className="text-sm text-gray-600 mt-2">Colors, fonts, logos – everything that defines your storefront look</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FaGlobe className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">General</h2>
              <p className="text-sm text-gray-600">Site name and description</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Website URL</label>
              <input type="text" value={formData.general.websiteUrl} onChange={(e) => handleChange('general', 'websiteUrl', e.target.value)} placeholder="https://yourstore.com" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Site Name</label>
              <input type="text" value={formData.general.siteName} onChange={(e) => handleChange('general', 'siteName', e.target.value)} placeholder="Your Store" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Site Description</label>
              <textarea value={formData.general.siteDescription} onChange={(e) => handleChange('general', 'siteDescription', e.target.value)} placeholder="Premium apparel" rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Return Period (days)</label>
              <input type="number" min="0" value={formData.general.returnPeriodDays} onChange={(e) => handleChange('general', 'returnPeriodDays', parseInt(e.target.value) || 0)} placeholder="7" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500" />
              <p className="text-xs text-gray-500 mt-1">Days after delivery before order is marked completed. 0 = no return policy.</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <FaImage className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Logo & Icons</h2>
              <p className="text-sm text-gray-600">Logo, favicon, admin logo</p>
            </div>
          </div>
          <div className="space-y-4">
            <ImageInputWithActions value={formData.logo.logoUrl} onChange={(url) => handleChange('logo', 'logoUrl', url)} label="Main Logo" placeholder="https://..." />
            <ImageInputWithActions value={formData.logo.faviconUrl} onChange={(url) => handleChange('logo', 'faviconUrl', url)} label="Favicon" placeholder="https://..." />
            <ImageInputWithActions value={formData.logo.adminLogoUrl} onChange={(url) => handleChange('logo', 'adminLogoUrl', url)} label="Admin Logo" placeholder="https://..." />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
              <FaPalette className="w-6 h-6 text-pink-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Colors</h2>
              <p className="text-sm text-gray-600">Applied across the storefront</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor', 'textColor', 'linkColor'] as const).map((key) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-2">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}</label>
                <div className="flex gap-3">
                  <input type="color" value={formData.colors[key]} onChange={(e) => handleChange('colors', key, e.target.value)} className="w-16 h-10 border border-gray-300 rounded cursor-pointer" />
                  <input type="text" value={formData.colors[key]} onChange={(e) => handleChange('colors', key, e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <FaFont className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Fonts</h2>
              <p className="text-sm text-gray-600">Primary, heading, body fonts</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Primary Font</label>
              <input type="text" value={formData.fonts.fontFamily} onChange={(e) => handleChange('fonts', 'fontFamily', e.target.value)} placeholder="Inter, sans-serif" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Heading Font (optional)</label>
              <input type="text" value={formData.fonts.headingFontFamily} onChange={(e) => handleChange('fonts', 'headingFontFamily', e.target.value)} placeholder="Same as primary if empty" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Body Font (optional)</label>
              <input type="text" value={formData.fonts.bodyFontFamily} onChange={(e) => handleChange('fonts', 'bodyFontFamily', e.target.value)} placeholder="Same as primary if empty" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <FaInstagram className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Instagram Feed</h2>
              <p className="text-sm text-gray-600">Enable and configure Instagram username</p>
            </div>
          </div>
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={formData.instagram.isEnabled} onChange={(e) => handleChange('instagram', 'isEnabled', e.target.checked)} className="w-4 h-4 text-red-600 rounded focus:ring-red-500" />
              Enable Instagram Feed
            </label>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Instagram Username</label>
              <input type="text" value={formData.instagram.username} onChange={(e) => handleChange('instagram', 'username', e.target.value)} placeholder="thestreetwear_clothings" disabled={!formData.instagram.isEnabled} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
              <FaGlobe className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Announcement Bar</h2>
              <p className="text-sm text-gray-600">Banner shown at the top of every page (desktop header)</p>
            </div>
          </div>
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={formData.announcementBar.isEnabled} onChange={(e) => handleChange('announcementBar', 'isEnabled', e.target.checked)} className="w-4 h-4 text-red-600 rounded focus:ring-red-500" />
              <span className="text-sm font-medium text-gray-700">Show announcement bar</span>
            </label>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Announcement Text</label>
              <input type="text" value={formData.announcementBar.text} onChange={(e) => handleChange('announcementBar', 'text', e.target.value)} placeholder="Free Shipping on orders above ₹500" disabled={!formData.announcementBar.isEnabled} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Background Color</label>
                <div className="flex gap-2">
                  <input type="color" value={formData.announcementBar.bgColor} onChange={(e) => handleChange('announcementBar', 'bgColor', e.target.value)} disabled={!formData.announcementBar.isEnabled} className="w-12 h-10 border border-gray-300 rounded cursor-pointer" />
                  <input type="text" value={formData.announcementBar.bgColor} onChange={(e) => handleChange('announcementBar', 'bgColor', e.target.value)} disabled={!formData.announcementBar.isEnabled} className="flex-1 px-3 py-2 border border-gray-300 rounded-md" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Text Color</label>
                <div className="flex gap-2">
                  <input type="color" value={formData.announcementBar.textColor} onChange={(e) => handleChange('announcementBar', 'textColor', e.target.value)} disabled={!formData.announcementBar.isEnabled} className="w-12 h-10 border border-gray-300 rounded cursor-pointer" />
                  <input type="text" value={formData.announcementBar.textColor} onChange={(e) => handleChange('announcementBar', 'textColor', e.target.value)} disabled={!formData.announcementBar.isEnabled} className="flex-1 px-3 py-2 border border-gray-300 rounded-md" />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Link URL (optional)</label>
              <input type="text" value={formData.announcementBar.link} onChange={(e) => handleChange('announcementBar', 'link', e.target.value)} placeholder="/products or https://..." disabled={!formData.announcementBar.isEnabled} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50" />
              <p className="text-xs text-gray-500 mt-1">Leave blank for non-clickable bar</p>
            </div>
            {formData.announcementBar.isEnabled && formData.announcementBar.text && (
              <div className="rounded-md px-4 py-2 text-sm font-semibold border border-gray-200" style={{ backgroundColor: formData.announcementBar.bgColor, color: formData.announcementBar.textColor }}>
                Preview: {formData.announcementBar.text}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/appearance/pages')} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-400 font-medium flex items-center gap-2">
            <FaSave className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AppearanceStyle;
