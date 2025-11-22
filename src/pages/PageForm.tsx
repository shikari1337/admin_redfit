import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaPlus, FaTrash, FaArrowUp, FaArrowDown } from 'react-icons/fa';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

interface PageTemplate {
  name: string;
  displayName: string;
  description: string;
  defaultBlocks: any[];
}

interface ContentBlock {
  blockId: string;
  blockType: string;
  enabled: boolean;
  order: number;
  data: any;
}

interface Page {
  _id?: string;
  title: string;
  slug: string;
  pageType: string;
  template: string;
  description?: string;
  isActive: boolean;
  isVisible: boolean;
  contentBlocks: ContentBlock[];
  seo?: any;
}

const PageForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<PageTemplate[]>([]);
  const [blockTypes, setBlockTypes] = useState<string[]>([]);
  
  const [formData, setFormData] = useState<Page>({
    title: '',
    slug: '',
    pageType: 'custom',
    template: 'default',
    description: '',
    isActive: true,
    isVisible: true,
    contentBlocks: [],
  });

  useEffect(() => {
    fetchTemplates();
    fetchBlockTypes();
    if (id) {
      fetchPage();
    }
  }, [id]);

  const fetchTemplates = async () => {
    try {
      const response = await api.get('/pages/templates');
      setTemplates(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  };

  const fetchBlockTypes = async () => {
    try {
      const response = await api.get('/pages/block-types');
      setBlockTypes(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch block types:', error);
    }
  };

  const fetchPage = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/pages/admin/${id}`);
      setFormData(response.data.data);
    } catch (error: any) {
      console.error('Failed to fetch page:', error);
      alert(error.response?.data?.message || 'Failed to load page');
      navigate('/pages');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (id) {
        await api.put(`/pages/${id}`, formData);
        alert('Page updated successfully!');
      } else {
        await api.post('/pages', formData);
        alert('Page created successfully!');
      }
      navigate('/pages');
    } catch (error: any) {
      console.error('Failed to save page:', error);
      alert(error.response?.data?.message || 'Failed to save page');
    } finally {
      setSaving(false);
    }
  };

  const handleTemplateChange = (templateName: string) => {
    const template = templates.find(t => t.name === templateName);
    if (template && template.defaultBlocks) {
      setFormData({
        ...formData,
        template: templateName,
        contentBlocks: template.defaultBlocks.map((block, index) => ({
          ...block,
          order: block.order !== undefined ? block.order : index,
        })),
      });
    } else {
      setFormData({
        ...formData,
        template: templateName,
      });
    }
  };

  const addBlock = () => {
    const newBlock: ContentBlock = {
      blockId: `block-${Date.now()}`,
      blockType: 'text',
      enabled: true,
      order: formData.contentBlocks.length,
      data: {},
    };
    setFormData({
      ...formData,
      contentBlocks: [...formData.contentBlocks, newBlock],
    });
  };

  const removeBlock = (index: number) => {
    setFormData({
      ...formData,
      contentBlocks: formData.contentBlocks.filter((_, i) => i !== index).map((block, i) => ({
        ...block,
        order: i,
      })),
    });
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const blocks = [...formData.contentBlocks];
    if (direction === 'up' && index > 0) {
      [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]];
      blocks[index - 1].order = index - 1;
      blocks[index].order = index;
    } else if (direction === 'down' && index < blocks.length - 1) {
      [blocks[index], blocks[index + 1]] = [blocks[index + 1], blocks[index]];
      blocks[index].order = index;
      blocks[index + 1].order = index + 1;
    }
    setFormData({
      ...formData,
      contentBlocks: blocks,
    });
  };

  const updateBlock = (index: number, field: string, value: any) => {
    const blocks = [...formData.contentBlocks];
    blocks[index] = {
      ...blocks[index],
      [field]: value,
    };
    setFormData({
      ...formData,
      contentBlocks: blocks,
    });
  };

  const updateBlockData = (index: number, data: any) => {
    const blocks = [...formData.contentBlocks];
    blocks[index] = {
      ...blocks[index],
      data: { ...blocks[index].data, ...data },
    };
    setFormData({
      ...formData,
      contentBlocks: blocks,
    });
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/pages')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <FaArrowLeft className="mr-2" />
          Back to Pages
        </button>
        <h1 className="text-3xl font-bold text-gray-900">
          {id ? 'Edit Page' : 'Create Page'}
        </h1>
        <p className="text-sm text-gray-600 mt-2">Configure your page with content blocks</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    title: e.target.value,
                    slug: formData.slug || generateSlug(e.target.value),
                  });
                }}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Slug *
              </label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => {
                  const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                  setFormData({ ...formData, slug });
                }}
                required
                pattern="[a-z0-9-]+"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <p className="text-xs text-gray-500 mt-1">URL: /{formData.slug || 'page-slug'}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Page Type *
              </label>
              <select
                value={formData.pageType}
                onChange={(e) => setFormData({ ...formData, pageType: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="custom">Custom</option>
                <option value="about">About</option>
                <option value="contact">Contact</option>
                <option value="faq">FAQ</option>
                <option value="landing">Landing Page</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Template
              </label>
              <select
                value={formData.template}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                {templates.map(template => (
                  <option key={template.name} value={template.name}>
                    {template.displayName} - {template.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                />
                <span className="text-sm font-medium text-gray-700">Active/Published</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isVisible}
                  onChange={(e) => setFormData({ ...formData, isVisible: e.target.checked })}
                  className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                />
                <span className="text-sm font-medium text-gray-700">Visible in Navigation</span>
              </label>
            </div>
          </div>
        </div>

        {/* Content Blocks */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Content Blocks</h2>
            <button
              type="button"
              onClick={addBlock}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <FaPlus className="w-4 h-4" />
              Add Block
            </button>
          </div>

          {formData.contentBlocks.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No content blocks. Add blocks to build your page.</p>
          ) : (
            <div className="space-y-4">
              {formData.contentBlocks.map((block, index) => (
                <div key={block.blockId} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">Block #{index + 1}</span>
                      <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800">
                        {block.blockType}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => moveBlock(index, 'up')}
                        disabled={index === 0}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        title="Move up"
                      >
                        <FaArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBlock(index, 'down')}
                        disabled={index === formData.contentBlocks.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        title="Move down"
                      >
                        <FaArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBlock(index)}
                        className="p-1 text-red-400 hover:text-red-600"
                        title="Remove"
                      >
                        <FaTrash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Block Type
                      </label>
                      <select
                        value={block.blockType}
                        onChange={(e) => updateBlock(index, 'blockType', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        {blockTypes.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Block ID
                      </label>
                      <input
                        type="text"
                        value={block.blockId}
                        onChange={(e) => updateBlock(index, 'blockId', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={block.enabled}
                          onChange={(e) => updateBlock(index, 'enabled', e.target.checked)}
                          className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Enabled</span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Order
                      </label>
                      <input
                        type="number"
                        value={block.order}
                        onChange={(e) => updateBlock(index, 'order', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  </div>

                  {/* Block-specific data editor */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Block Data (JSON)
                    </label>
                    <textarea
                      value={JSON.stringify(block.data, null, 2)}
                      onChange={(e) => {
                        try {
                          const data = JSON.parse(e.target.value);
                          updateBlockData(index, data);
                        } catch {
                          // Invalid JSON, ignore
                        }
                      }}
                      rows={6}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Enter valid JSON. Data structure depends on block type.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/pages')}
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
            {saving ? 'Saving...' : id ? 'Update Page' : 'Create Page'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PageForm;

