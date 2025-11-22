import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaPlus, FaTrash, FaArrowUp, FaArrowDown, FaEye, FaEyeSlash } from 'react-icons/fa';
import { pagesAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import BlockEditor from '../components/pages/BlockEditor';

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
      const response = await pagesAPI.getTemplates();
      setTemplates(response.data || []);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  };

  const fetchBlockTypes = async () => {
    try {
      const response = await pagesAPI.getBlockTypes();
      setBlockTypes(response.data || []);
    } catch (error) {
      console.error('Failed to fetch block types:', error);
    }
  };

  const fetchPage = async () => {
    try {
      setLoading(true);
      const response = await pagesAPI.getById(id!);
      setFormData(response.data);
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
        await pagesAPI.update(id, formData);
        alert('Page updated successfully!');
      } else {
        await pagesAPI.create(formData);
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

  const getDefaultBlockData = (blockType: string): any => {
    switch (blockType) {
      case 'hero':
        return {
          title: 'Welcome to Our Store',
          subtitle: 'Discover amazing products',
          imageUrl: '',
          callToActionText: 'Shop Now',
          callToActionLink: '/products',
        };
      case 'text':
        return {
          title: 'Section Title',
          content: '<p>Add your content here...</p>',
        };
      case 'image':
        return {
          image: '',
          alt: 'Image description',
        };
      case 'text-image':
        return {
          title: 'Section Title',
          content: '<p>Add your content here...</p>',
          image: '',
          alt: 'Image description',
          imagePosition: 'left',
        };
      case 'features':
        return {
          title: 'Our Features',
          items: [
            { icon: '✨', title: 'Feature 1', description: 'Description of feature 1' },
            { icon: '🚀', title: 'Feature 2', description: 'Description of feature 2' },
            { icon: '💎', title: 'Feature 3', description: 'Description of feature 3' },
          ],
        };
      case 'cta':
        return {
          title: 'Ready to Get Started?',
          subtitle: 'Join thousands of happy customers',
          buttonText: 'Shop Now',
          buttonLink: '/products',
        };
      case 'faq-accordion':
        return {
          title: 'Frequently Asked Questions',
          items: [
            { question: 'What is your return policy?', answer: '<p>We offer a 30-day return policy on all products.</p>' },
            { question: 'How long does shipping take?', answer: '<p>Standard shipping takes 5-7 business days.</p>' },
          ],
        };
      default:
        return {};
    }
  };

  const addBlock = (blockType: string = 'text') => {
    const newBlock: ContentBlock = {
      blockId: `block-${Date.now()}`,
      blockType,
      enabled: true,
      order: formData.contentBlocks.length,
      data: getDefaultBlockData(blockType),
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
      data,
    };
    setFormData({
      ...formData,
      contentBlocks: blocks,
    });
  };

  const handleGenerateAI = async (blockType: string, existingData: any): Promise<any> => {
    try {
      const response = await pagesAPI.generateBlockContent(
        blockType,
        formData.title,
        formData.description,
        undefined, // customPrompt - can be added later
        existingData
      );
      return response.data;
    } catch (error: any) {
      console.error('Failed to generate content:', error);
      throw error;
    }
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
            <div className="flex items-center gap-2">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    addBlock(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">Select block type...</option>
                {blockTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => addBlock()}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <FaPlus className="w-4 h-4" />
                Add Block
              </button>
            </div>
          </div>

          {formData.contentBlocks.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No content blocks. Add blocks to build your page.</p>
          ) : (
            <div className="space-y-4">
              {formData.contentBlocks
                .sort((a, b) => a.order - b.order)
                .map((block, index) => {
                  const sortedIndex = formData.contentBlocks.findIndex(b => b.blockId === block.blockId);
                  return (
                    <div key={block.blockId} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700">Block #{sortedIndex + 1}</span>
                          <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800 capitalize">
                            {block.blockType}
                          </span>
                          {!block.enabled && (
                            <span className="px-2 py-1 text-xs font-medium rounded bg-gray-200 text-gray-600">
                              Disabled
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateBlock(sortedIndex, 'enabled', !block.enabled)}
                            className={`p-1 ${block.enabled ? 'text-green-600' : 'text-gray-400'} hover:text-gray-600`}
                            title={block.enabled ? 'Disable' : 'Enable'}
                          >
                            {block.enabled ? <FaEye className="w-4 h-4" /> : <FaEyeSlash className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => moveBlock(sortedIndex, 'up')}
                            disabled={sortedIndex === 0}
                            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                            title="Move up"
                          >
                            <FaArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveBlock(sortedIndex, 'down')}
                            disabled={sortedIndex === formData.contentBlocks.length - 1}
                            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                            title="Move down"
                          >
                            <FaArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeBlock(sortedIndex)}
                            className="p-1 text-red-400 hover:text-red-600"
                            title="Remove"
                          >
                            <FaTrash className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Block Type
                          </label>
                          <select
                            value={block.blockType}
                            onChange={(e) => {
                              updateBlock(sortedIndex, 'blockType', e.target.value);
                              // Reset data to default for new block type
                              updateBlockData(sortedIndex, getDefaultBlockData(e.target.value));
                            }}
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
                            onChange={(e) => updateBlock(sortedIndex, 'blockId', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                          />
                        </div>
                      </div>

                      {/* Block Editor */}
                      <div className="mt-4 pt-4 border-t border-gray-200 bg-white rounded-lg p-4">
                        <BlockEditor
                          block={block}
                          onChange={(data) => updateBlockData(sortedIndex, data)}
                          onGenerateAI={handleGenerateAI}
                        />
                      </div>
                    </div>
                  );
                })}
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

