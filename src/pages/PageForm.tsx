import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaPlus, FaTrash, FaArrowUp, FaArrowDown, FaEye, FaEyeSlash } from 'react-icons/fa';
import { pagesAPI } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import BlockEditor from '../components/pages/BlockEditor';
import { HOMEPAGE_BLOCK_TYPES, homepageBlockDefault, isHomepageBlockType } from '../components/pages/HomepageBlockEditors';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

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
      let templates: any[] = [];
      if (Array.isArray(response)) {
        templates = response;
      } else if (Array.isArray(response?.data)) {
        templates = response.data;
      } else if (Array.isArray(response?.data?.data)) {
        templates = response.data.data;
      }
      setTemplates(templates);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      setTemplates([]);
    }
  };

  const fetchBlockTypes = async () => {
    try {
      const response = await pagesAPI.getBlockTypes();
      let blockTypes: any[] = [];
      if (Array.isArray(response)) {
        blockTypes = response;
      } else if (Array.isArray(response?.data)) {
        blockTypes = response.data;
      } else if (Array.isArray(response?.data?.data)) {
        blockTypes = response.data.data;
      }
      setBlockTypes(blockTypes);
    } catch (error) {
      console.error('Failed to fetch block types:', error);
      setBlockTypes([]);
    }
  };

  const fetchPage = async () => {
    try {
      setLoading(true);
      const response = await pagesAPI.getById(id!);
      const pageData = response?.data || response;
      
      if (!pageData || typeof pageData !== 'object') {
        throw new Error('Invalid page data received');
      }

      // Be resilient to shape: contentBlocks may arrive as `sections`, and
      // camelCase fields may come through as snake_case from the API.
      const blocks = Array.isArray(pageData.contentBlocks)
        ? pageData.contentBlocks
        : Array.isArray(pageData.sections)
        ? pageData.sections
        : [];
      setFormData({
        ...pageData,
        contentBlocks: blocks,
        pageType: pageData.pageType ?? pageData.type ?? 'custom',
        template: pageData.template ?? pageData.template_id ?? 'default',
        isActive: pageData.isActive ?? pageData.is_active ?? true,
        isVisible: pageData.isVisible ?? pageData.is_active ?? true,
      });
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
      case 'product-categories':
        return { title: 'Shop by Category', limit: 8, layout: 'grid' };
      case 'product-cards':
        return { title: 'Featured Products', limit: 8, sort: 'newest', categorySlug: '', layout: 'grid' };
      case 'product-selection':
        return { title: 'Handpicked for You', productSlugs: '', layout: 'grid' };
      case 'product-featured':
        return { title: 'Product of the Week', productSlug: '', ctaText: 'View Product' };
      case 'product-best-sellers':
        return { title: 'Best Sellers', limit: 8, tagSlug: 'bestseller', layout: 'grid' };
      default:
        // Storefront home-page sections carry their own starter data.
        if (isHomepageBlockType(blockType)) return homepageBlockDefault(blockType);
        return {};
    }
  };

  // The home page renders storefront-specific sections (hero-carousel, product-row,
  // brand-grid…) via app/page.tsx; every other page uses the CMS block types. Offer
  // the right palette so added sections actually render.
  const isHomePage = formData.pageType === 'homepage' || formData.slug === 'home';
  const availableBlockTypes = isHomePage ? HOMEPAGE_BLOCK_TYPES : blockTypes;

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

  const handleGenerateAI = async (blockType: string, existingData: any, customPrompt?: string): Promise<any> => {
    try {
      const response = await pagesAPI.generateBlockContent(
        blockType,
        formData.title,
        formData.description,
        customPrompt,
        existingData
      );
      const content = response?.data ?? response;
      return content;
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
    <div className="max-w-6xl mx-auto pb-12">
      <div className="mb-6">
        <button
          onClick={() => navigate('/pages')}
          className="flex items-center text-muted-foreground hover:text-foreground mb-4 text-sm font-medium transition-colors"
        >
          <FaArrowLeft className="mr-2" />
          Back to Pages
        </button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {id ? 'Edit Page' : 'Create Page'}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Configure your page with content blocks</p>
          </div>
          {id && (
            <button
              type="button"
              onClick={() => navigate(`/pages/${id}/builder`)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-lg transition-colors"
              title="Open the full-screen drag & drop visual builder (replaces classic blocks on save; they are kept as a backup)"
            >
              ✨ Visual Builder
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Title *
                </label>
                <Input
                  value={formData.title}
                  onChange={(e) => {
                    setFormData({
                      ...formData,
                      title: e.target.value,
                      slug: formData.slug || generateSlug(e.target.value),
                    });
                  }}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Slug *
                </label>
                <Input
                  value={formData.slug}
                  onChange={(e) => {
                    const slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                    setFormData({ ...formData, slug });
                  }}
                  required
                  pattern="[a-z0-9\-]+"
                />
                <p className="text-xs text-muted-foreground">URL: /{formData.slug || 'page-slug'}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Page Type *
                </label>
                <select
                  value={formData.pageType}
                  onChange={(e) => setFormData({ ...formData, pageType: e.target.value })}
                  required
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="custom">Custom</option>
                  <option value="homepage">Home Page</option>
                  <option value="about">About</option>
                  <option value="contact">Contact</option>
                  <option value="faq">FAQ</option>
                  <option value="landing">Landing Page</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Template
                </label>
                <select
                  value={formData.template}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {templates.map(template => (
                    <option key={template.name} value={template.name}>
                      {template.displayName} - {template.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Description
                </label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked as boolean })}
                  />
                  <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Active/Published</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.isVisible}
                    onCheckedChange={(checked) => setFormData({ ...formData, isVisible: checked as boolean })}
                  />
                  <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Visible in Navigation</span>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content Blocks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Content Blocks</CardTitle>
            <div className="flex items-center gap-3">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    addBlock(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="flex h-9 w-[200px] items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select block type...</option>
                {availableBlockTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <Button type="button" onClick={() => addBlock()} className="bg-red-600 hover:bg-red-700 h-9">
                <FaPlus className="w-3.5 h-3.5 mr-2" />
                Add Block
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {formData.contentBlocks.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <p className="text-muted-foreground">No content blocks. Add blocks to build your page.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {formData.contentBlocks
                  .filter((b) => b && (b.blockId || b.blockType))
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                  .map((block) => {
                    const sortedIndex = formData.contentBlocks.findIndex((b) => b === block);
                    const safeBlock = {
                      blockId: block?.blockId ?? `block-${sortedIndex}-${Math.random().toString(36).slice(2)}`,
                      blockType: block?.blockType ?? 'text',
                      enabled: block?.enabled !== false,
                      order: block?.order ?? 0,
                      data: block?.data && typeof block.data === 'object' ? block.data : {},
                    };
                    return (
                      <div key={safeBlock.blockId} className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
                        <div className="flex items-center justify-between p-4 bg-muted/50 border-b border-border">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-foreground">Block #{sortedIndex + 1}</span>
                            <span className="px-2.5 py-0.5 text-[10px] font-semibold tracking-wide rounded-full bg-blue-100 text-blue-800 uppercase">
                              {safeBlock.blockType}
                            </span>
                            {!safeBlock.enabled && (
                              <span className="px-2.5 py-0.5 text-[10px] font-semibold tracking-wide rounded-full bg-secondary text-secondary-foreground uppercase">
                                Disabled
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => updateBlock(sortedIndex, 'enabled', !safeBlock.enabled)}
                              className={`h-8 w-8 ${safeBlock.enabled ? 'text-green-600' : 'text-muted-foreground'}`}
                              title={safeBlock.enabled ? 'Disable' : 'Enable'}
                            >
                              {safeBlock.enabled ? <FaEye className="w-4 h-4" /> : <FaEyeSlash className="w-4 h-4" />}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => moveBlock(sortedIndex, 'up')}
                              disabled={sortedIndex === 0}
                              className="h-8 w-8 text-muted-foreground"
                              title="Move up"
                            >
                              <FaArrowUp className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => moveBlock(sortedIndex, 'down')}
                              disabled={sortedIndex === formData.contentBlocks.length - 1}
                              className="h-8 w-8 text-muted-foreground"
                              title="Move down"
                            >
                              <FaArrowDown className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeBlock(sortedIndex)}
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              title="Remove"
                            >
                              <FaTrash className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        <div className="p-4 space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Block Type
                              </label>
                              <select
                                value={safeBlock.blockType}
                                onChange={(e) => {
                                  updateBlock(sortedIndex, 'blockType', e.target.value);
                                  updateBlockData(sortedIndex, getDefaultBlockData(e.target.value));
                                }}
                                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {availableBlockTypes.map(type => (
                                  <option key={type} value={type}>{type}</option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Block ID
                              </label>
                              <Input
                                value={safeBlock.blockId}
                                onChange={(e) => updateBlock(sortedIndex, 'blockId', e.target.value)}
                                className="h-9"
                              />
                            </div>
                          </div>

                          <div className="pt-4 border-t border-border">
                            <BlockEditor
                              block={safeBlock}
                              onChange={(data) => updateBlockData(sortedIndex, data)}
                              onGenerateAI={handleGenerateAI}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 sticky bottom-4 p-4 bg-background/80 backdrop-blur-sm border border-border rounded-lg shadow-sm">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/pages')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="bg-red-600 hover:bg-red-700 text-white min-w-[140px]"
          >
            {saving ? (
              <LoadingSpinner className="w-4 h-4 mr-2 border-white border-t-transparent" />
            ) : (
              <FaSave className="w-4 h-4 mr-2" />
            )}
            {saving ? 'Saving...' : id ? 'Update Page' : 'Create Page'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default PageForm;

