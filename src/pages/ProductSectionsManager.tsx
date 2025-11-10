import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { productsAPI, uploadAPI } from '../services/api';
import { FaArrowLeft, FaCheck, FaTimes, FaEdit, FaPlus, FaTrash, FaUpload } from 'react-icons/fa';

interface ProductPageSection {
  sectionId: string;
  name: string;
  description: string;
  enabled: boolean;
  order: number;
  customData?: any;
}

const availableSections: Omit<ProductPageSection, 'order' | 'customData'>[] = [
  { sectionId: 'features', name: 'Features Box', description: 'Top Quality, Easy Exchange, Free Shipping', enabled: true },
  { sectionId: 'whySpeedster', name: 'Why Speedster', description: 'Why choose this product', enabled: true },
  { sectionId: 'videos', name: 'Product Videos', description: 'Video feed section', enabled: true },
  { sectionId: 'testimonials', name: 'Testimonials', description: 'Customer reviews and testimonials', enabled: true },
  { sectionId: 'washCare', name: 'Wash Care Instructions', description: 'Care instructions with icons', enabled: true },
  { sectionId: 'customerOrderGallery', name: 'Customer Order Gallery', description: 'Screenshots of customer orders', enabled: true },
  { sectionId: 'stylingGuide', name: 'Styling Guide', description: 'How to style the product', enabled: true },
  { sectionId: 'instagramFeed', name: 'Instagram Feed', description: 'Instagram posts grid', enabled: true },
  { sectionId: 'faq', name: 'FAQ', description: 'Frequently asked questions', enabled: true },
  { sectionId: 'whyUs', name: 'Why Us', description: 'Benefits and advantages', enabled: true },
];

const ProductSectionsManager: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sections, setSections] = useState<ProductPageSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchProduct();
    }
  }, [id]);

  const fetchProduct = async () => {
    try {
      setLoading(true);
      const response = await productsAPI.getById(id!);
      const product = response.data;
      
      // Initialize sections from product or use defaults
      if (product.pageSections && product.pageSections.length > 0) {
        // Merge with available sections to get full info
        const mergedSections = availableSections.map(availSection => {
          const productSection = product.pageSections.find((ps: any) => ps.sectionId === availSection.sectionId);
          return {
            ...availSection,
            enabled: productSection?.enabled !== false,
            order: productSection?.order ?? availableSections.indexOf(availSection),
            customData: productSection?.customData,
          };
        });
        // Add any sections that exist in product but not in availableSections
        product.pageSections.forEach((ps: any) => {
          if (!mergedSections.find(s => s.sectionId === ps.sectionId)) {
            mergedSections.push({
              sectionId: ps.sectionId,
              name: ps.sectionId,
              description: '',
              enabled: ps.enabled !== false,
              order: ps.order ?? mergedSections.length,
              customData: ps.customData,
            });
          }
        });
        setSections(mergedSections.sort((a, b) => a.order - b.order));
      } else {
        // Use defaults
        setSections(availableSections.map((section, index) => ({
          ...section,
          enabled: section.enabled,
          order: index,
        })));
      }
    } catch (error) {
      alert('Failed to load product');
      navigate('/products');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSection = (sectionId: string) => {
    setSections(sections.map(section =>
      section.sectionId === sectionId
        ? { ...section, enabled: !section.enabled }
        : section
    ));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const items = [...sections];
    [items[index - 1], items[index]] = [items[index], items[index - 1]];
    const updatedItems = items.map((item, i) => ({
      ...item,
      order: i,
    }));
    setSections(updatedItems);
  };

  const handleMoveDown = (index: number) => {
    if (index === sections.length - 1) return;
    const items = [...sections];
    [items[index], items[index + 1]] = [items[index + 1], items[index]];
    const updatedItems = items.map((item, i) => ({
      ...item,
      order: i,
    }));
    setSections(updatedItems);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const pageSections = sections.map(section => ({
        sectionId: section.sectionId,
        enabled: section.enabled,
        order: section.order,
        customData: section.customData,
      }));

      await productsAPI.update(id!, { pageSections });
      alert('Sections updated successfully!');
      navigate('/products');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to save sections');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(`/products/${id}/edit`)}
          className="text-gray-600 hover:text-gray-800"
        >
          <FaArrowLeft />
        </button>
        <h1 className="text-2xl font-bold text-gray-800">Manage Product Page Sections</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <p className="text-sm text-gray-600 mb-4">
          Enable/disable and reorder sections on the product page. Drag and drop to change order.
        </p>

        <div className="space-y-3">
          {sections.map((section, index) => (
            <div
              key={section.sectionId}
              className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg bg-white"
            >
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === sections.length - 1}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ↓
                </button>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{section.name}</h3>
                <p className="text-sm text-gray-500">{section.description}</p>
                <span className="text-xs text-gray-400">Order: {section.order}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSection(section.sectionId)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200"
                  title="Edit Content"
                >
                  <FaEdit /> Edit Content
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleSection(section.sectionId)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                    section.enabled
                      ? 'bg-green-100 text-green-800 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {section.enabled ? (
                    <>
                      <FaCheck /> Enabled
                    </>
                  ) : (
                    <>
                      <FaTimes /> Disabled
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-4">
        <button
          type="button"
          onClick={() => navigate(`/products/${id}/edit`)}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Sections'}
        </button>
      </div>

      {/* Section Content Editor Modal */}
      {editingSection && (
        <SectionContentEditor
          section={sections.find(s => s.sectionId === editingSection)!}
          onClose={() => setEditingSection(null)}
          onSave={(customData) => {
            setSections(sections.map(s =>
              s.sectionId === editingSection
                ? { ...s, customData }
                : s
            ));
            setEditingSection(null);
          }}
        />
      )}
    </div>
  );
};

// Section Content Editor Component
interface SectionContentEditorProps {
  section: ProductPageSection;
  onClose: () => void;
  onSave: (customData: any) => void;
}

const SectionContentEditor: React.FC<SectionContentEditorProps> = ({ section, onClose, onSave }) => {
  const [formData, setFormData] = useState<any>(() => {
    if (section.customData) {
      return section.customData;
    }
    return getDefaultContent(section.sectionId);
  });

  const handleSave = () => {
    onSave(formData);
  };

  const renderEditor = () => {
    switch (section.sectionId) {
      case 'features':
        return <FeaturesEditor data={formData} onChange={setFormData} />;
      case 'whySpeedster':
        return <WhySpeedsterEditor data={formData} onChange={setFormData} />;
      case 'whyUs':
        return <WhyUsEditor data={formData} onChange={setFormData} />;
      case 'stylingGuide':
        return <StylingGuideEditor data={formData} onChange={setFormData} />;
      case 'instagramFeed':
        return <InstagramFeedEditor data={formData} onChange={setFormData} />;
      case 'faq':
        return <FAQEditor data={formData} onChange={setFormData} />;
      case 'testimonials':
        return <TestimonialsEditor data={formData} onChange={setFormData} />;
      case 'washCare':
        return <WashCareEditor data={formData} onChange={setFormData} />;
      case 'customerOrderGallery':
        return <CustomerOrderGalleryEditor data={formData} onChange={setFormData} />;
      case 'videos':
        return <VideosEditor data={formData} onChange={setFormData} />;
      default:
        return <div className="text-gray-600">Content editing not available for this section.</div>;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Edit {section.name}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>
        <div className="p-6">
          {renderEditor()}
        </div>
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 flex justify-end gap-4">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Save Content
          </button>
        </div>
      </div>
    </div>
  );
};

// Default content generators
const getDefaultContent = (sectionId: string): any => {
  switch (sectionId) {
    case 'features':
      return {
        items: [
          { title: 'Top Quality Products', description: 'Premium materials and craftsmanship for lasting durability', iconType: 'check' },
          { title: 'Easy Exchange', description: 'Hassle-free returns and exchanges within 7 days', iconType: 'exchange' },
          { title: 'Free Shipping In Prepaid Orders', description: 'Enjoy free delivery on all prepaid orders across India', iconType: 'shipping' },
        ]
      };
    case 'whySpeedster':
      return {
        heading: 'OWN THE LEGEND. FEEL THE SPEED.',
        subtitle: 'The F1 Speedster isn\'t just a jacket—it\'s an experience. We\'ve poured passion into every stitch to create a piece of apparel that connects you to the heart-pounding world of Formula 1.',
        imageUrl: '',
        items: [
          { title: 'Race-Ready Authenticity', description: 'Feel the grid\'s energy with meticulously embroidered sponsor logos and an official Ferrari prancing horse emblem.', iconType: 'shield' },
          { title: 'Unmatched Comfort & Quality', description: 'Built with premium, all-weather fabric and a plush inner lining, the Speedster provides warmth without the bulk.', iconType: 'star' },
          { title: 'Stand Out From The Crowd', description: 'The bold, iconic red, white, and black color-blocking is instantly recognizable.', iconType: 'bolt' },
        ]
      };
    case 'whyUs':
      return {
        heading: 'Why Choose Us?',
        subtitle: 'Experience the difference with our premium quality and exceptional service',
        benefits: [
          { title: 'Premium Quality', description: 'Crafted with high-grade materials and attention to detail', iconType: 'check' },
          { title: 'Fast Delivery', description: 'Same day dispatch for orders placed before 7 PM', iconType: 'clock' },
          { title: 'Easy Returns', description: 'Hassle-free 7-day return and exchange policy', iconType: 'return' },
          { title: 'Secure Payment', description: 'Multiple payment options with 100% secure transactions', iconType: 'shield' },
          { title: 'Trusted by Thousands', description: 'Over 2,400+ happy customers across India', iconType: 'star' },
          { title: 'Best Prices', description: 'Competitive pricing with exclusive bundle offers', iconType: 'tag' },
        ]
      };
    case 'stylingGuide':
      return {
        heading: 'Styling & Pairing Guide',
        subtitle: 'Discover how to style your premium racing jacket for different occasions',
        tips: [
          { title: 'Casual Street Style', description: 'Pair with denim jeans and sneakers for an everyday look', imageUrl: '' },
          { title: 'Sporty Look', description: 'Team up with track pants and running shoes for a sporty vibe', imageUrl: '' },
          { title: 'Layered Outfit', description: 'Layer over a hoodie or t-shirt for added warmth and style', imageUrl: '' },
          { title: 'Racing Enthusiast', description: 'Complete the look with racing boots and a matching cap', imageUrl: '' },
        ]
      };
    case 'instagramFeed':
      return {
        username: 'thestreetwear_clothings',
        heading: 'Follow Us on Instagram',
        posts: [
          { id: '1', imageUrl: '', caption: 'New arrivals! Check out our latest collection', link: '' },
          { id: '2', imageUrl: '', caption: 'Customer styling our racing jacket', link: '' },
          { id: '3', imageUrl: '', caption: 'Behind the scenes of our photoshoot', link: '' },
          { id: '4', imageUrl: '', caption: 'Limited edition drop!', link: '' },
          { id: '5', imageUrl: '', caption: 'Customer reviews and testimonials', link: '' },
          { id: '6', imageUrl: '', caption: 'New colorways available now', link: '' },
        ]
      };
    case 'faq':
      return {
        mode: 'category', // 'category' or 'random'
        selectedCategories: ['general'], // Array of category names
        randomCount: 5, // Number of random questions
        heading: 'Frequently Asked Questions',
        subtitle: 'Find answers to common questions about our products, shipping, and policies.',
      };
    case 'testimonials':
      return {
        heading: "DON'T JUST TAKE OUR WORD FOR IT",
        subtitle: 'Over 2,400+ happy customers across India!',
        showRatingFilters: true,
      };
    case 'washCare':
      return {
        heading: 'Wash Care Instructions',
        instructions: [], // Will use product.washCareInstructions if empty
      };
    case 'customerOrderGallery':
      return {
        heading: 'Customer Orders',
        subtitle: 'See what our customers are ordering',
        images: [], // Will use product.customerOrderImages if empty
      };
    case 'videos':
      return {
        heading: 'SEE IT IN ACTION',
        subtitle: 'Watch how our customers style their premium racing jackets',
        videos: [], // Will use product.videos if empty
      };
    default:
      return {};
  }
};

// Individual Section Editors
const FeaturesEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  const updateItem = (index: number, field: string, value: string) => {
    const items = [...(data.items || [])];
    items[index] = { ...items[index], [field]: value };
    onChange({ ...data, items });
  };

  const addItem = () => {
    onChange({
      ...data,
      items: [...(data.items || []), { title: '', description: '', iconType: 'check' }]
    });
  };

  const removeItem = (index: number) => {
    const items = [...(data.items || [])];
    items.splice(index, 1);
    onChange({ ...data, items });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900 mb-4">Features</h3>
      {(data.items || []).map((item: any, index: number) => (
        <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="font-medium text-gray-900">Feature {index + 1}</h4>
            <button
              onClick={() => removeItem(index)}
              className="text-red-600 hover:text-red-800"
            >
              <FaTrash />
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Icon Type</label>
            <select
              value={item.iconType || 'check'}
              onChange={(e) => updateItem(index, 'iconType', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="check">Check (Green)</option>
              <option value="exchange">Exchange (Blue)</option>
              <option value="shipping">Shipping (Purple)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={item.title || ''}
              onChange={(e) => updateItem(index, 'title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="Feature title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={item.description || ''}
              onChange={(e) => updateItem(index, 'description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              rows={2}
              placeholder="Feature description"
            />
          </div>
        </div>
      ))}
      <button
        onClick={addItem}
        className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
      >
        <FaPlus /> Add Feature
      </button>
    </div>
  );
};

const WhySpeedsterEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  const [uploading, setUploading] = useState(false);

  const updateField = (field: string, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const updateItem = (index: number, field: string, value: string) => {
    const items = [...(data.items || [])];
    items[index] = { ...items[index], [field]: value };
    onChange({ ...data, items });
  };

  const addItem = () => {
    onChange({
      ...data,
      items: [...(data.items || []), { title: '', description: '', iconType: 'shield' }]
    });
  };

  const removeItem = (index: number) => {
    const items = [...(data.items || [])];
    items.splice(index, 1);
    onChange({ ...data, items });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      try {
        const response = await uploadAPI.uploadSingle(file, 'products');
        // Handle different response structures
        const imageUrl = response.data?.url || response.data?.data?.url || response.url;
        if (imageUrl) {
          updateField('imageUrl', imageUrl);
        } else {
          throw new Error('No URL in upload response');
        }
      } catch (error: any) {
        console.error('Image upload error:', error);
        alert(error.response?.data?.message || error.message || 'Failed to upload image');
      } finally {
        setUploading(false);
        if (e.target) {
          e.target.value = '';
        }
      }
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Heading</label>
        <input
          type="text"
          value={data.heading || ''}
          onChange={(e) => updateField('heading', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
        <textarea
          value={data.subtitle || ''}
          onChange={(e) => updateField('subtitle', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          rows={3}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Image</label>
        {data.imageUrl ? (
          <div className="relative group mb-3">
            <img
              src={data.imageUrl}
              alt="Why Speedster"
              className="w-full h-48 object-cover rounded-lg border border-gray-300"
            />
            <button
              type="button"
              onClick={() => updateField('imageUrl', '')}
              className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <FaTimes size={14} />
            </button>
          </div>
        ) : (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center mb-3">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              id="why-speedster-image-upload"
              onChange={handleImageUpload}
              disabled={uploading}
            />
            <label
              htmlFor="why-speedster-image-upload"
              className={`cursor-pointer ${uploading ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600">Uploading...</p>
                </>
              ) : (
                <>
                  <FaUpload className="mx-auto text-4xl text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">
                    Click to upload image or drag and drop
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Supports JPG, PNG, GIF up to 10MB</p>
                </>
              )}
            </label>
          </div>
        )}
        <input
          type="text"
          value={data.imageUrl || ''}
          onChange={(e) => updateField('imageUrl', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Or enter image URL manually (https://...)"
        />
        <p className="mt-1 text-xs text-gray-500">Upload an image or enter a URL manually</p>
      </div>
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Items</h4>
        {(data.items || []).map((item: any, index: number) => (
          <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h5 className="font-medium text-gray-900">Item {index + 1}</h5>
              <button
                onClick={() => removeItem(index)}
                className="text-red-600 hover:text-red-800"
              >
                <FaTrash />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Icon Type</label>
              <select
                value={item.iconType || 'shield'}
                onChange={(e) => updateItem(index, 'iconType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="shield">Shield</option>
                <option value="star">Star</option>
                <option value="bolt">Bolt</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={item.title || ''}
                onChange={(e) => updateItem(index, 'title', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={item.description || ''}
                onChange={(e) => updateItem(index, 'description', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={2}
              />
            </div>
          </div>
        ))}
        <button
          onClick={addItem}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          <FaPlus /> Add Item
        </button>
      </div>
    </div>
  );
};

const WhyUsEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  const updateField = (field: string, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const updateBenefit = (index: number, field: string, value: string) => {
    const benefits = [...(data.benefits || [])];
    benefits[index] = { ...benefits[index], [field]: value };
    onChange({ ...data, benefits });
  };

  const addBenefit = () => {
    onChange({
      ...data,
      benefits: [...(data.benefits || []), { title: '', description: '', iconType: 'check' }]
    });
  };

  const removeBenefit = (index: number) => {
    const benefits = [...(data.benefits || [])];
    benefits.splice(index, 1);
    onChange({ ...data, benefits });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Heading</label>
        <input
          type="text"
          value={data.heading || ''}
          onChange={(e) => updateField('heading', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
        <textarea
          value={data.subtitle || ''}
          onChange={(e) => updateField('subtitle', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          rows={2}
        />
      </div>
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Benefits</h4>
        {(data.benefits || []).map((benefit: any, index: number) => (
          <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h5 className="font-medium text-gray-900">Benefit {index + 1}</h5>
              <button
                onClick={() => removeBenefit(index)}
                className="text-red-600 hover:text-red-800"
              >
                <FaTrash />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Icon Type</label>
              <select
                value={benefit.iconType || 'check'}
                onChange={(e) => updateBenefit(index, 'iconType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="check">Check</option>
                <option value="clock">Clock</option>
                <option value="return">Return</option>
                <option value="shield">Shield</option>
                <option value="star">Star</option>
                <option value="tag">Tag</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={benefit.title || ''}
                onChange={(e) => updateBenefit(index, 'title', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={benefit.description || ''}
                onChange={(e) => updateBenefit(index, 'description', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={2}
              />
            </div>
          </div>
        ))}
        <button
          onClick={addBenefit}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          <FaPlus /> Add Benefit
        </button>
      </div>
    </div>
  );
};

const StylingGuideEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  const updateField = (field: string, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const updateTip = (index: number, field: string, value: string) => {
    const tips = [...(data.tips || [])];
    tips[index] = { ...tips[index], [field]: value };
    onChange({ ...data, tips });
  };

  const addTip = () => {
    onChange({
      ...data,
      tips: [...(data.tips || []), { title: '', description: '', imageUrl: '' }]
    });
  };

  const removeTip = (index: number) => {
    const tips = [...(data.tips || [])];
    tips.splice(index, 1);
    onChange({ ...data, tips });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Heading</label>
        <input
          type="text"
          value={data.heading || ''}
          onChange={(e) => updateField('heading', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
        <textarea
          value={data.subtitle || ''}
          onChange={(e) => updateField('subtitle', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          rows={2}
        />
      </div>
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Styling Tips</h4>
        {(data.tips || []).map((tip: any, index: number) => (
          <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h5 className="font-medium text-gray-900">Tip {index + 1}</h5>
              <button
                onClick={() => removeTip(index)}
                className="text-red-600 hover:text-red-800"
              >
                <FaTrash />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={tip.title || ''}
                onChange={(e) => updateTip(index, 'title', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={tip.description || ''}
                onChange={(e) => updateTip(index, 'description', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
              <input
                type="text"
                value={tip.imageUrl || ''}
                onChange={(e) => updateTip(index, 'imageUrl', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="https://..."
              />
            </div>
          </div>
        ))}
        <button
          onClick={addTip}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          <FaPlus /> Add Tip
        </button>
      </div>
    </div>
  );
};

const InstagramFeedEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  const updateField = (field: string, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const updatePost = (index: number, field: string, value: string) => {
    const posts = [...(data.posts || [])];
    posts[index] = { ...posts[index], [field]: value };
    onChange({ ...data, posts });
  };

  const addPost = () => {
    onChange({
      ...data,
      posts: [...(data.posts || []), { id: Date.now().toString(), imageUrl: '', caption: '', link: '' }]
    });
  };

  const removePost = (index: number) => {
    const posts = [...(data.posts || [])];
    posts.splice(index, 1);
    onChange({ ...data, posts });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Instagram Username</label>
        <input
          type="text"
          value={data.username || ''}
          onChange={(e) => updateField('username', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="thestreetwear_clothings"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Heading</label>
        <input
          type="text"
          value={data.heading || ''}
          onChange={(e) => updateField('heading', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Posts</h4>
        {(data.posts || []).map((post: any, index: number) => (
          <div key={post.id || index} className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h5 className="font-medium text-gray-900">Post {index + 1}</h5>
              <button
                onClick={() => removePost(index)}
                className="text-red-600 hover:text-red-800"
              >
                <FaTrash />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
              <input
                type="text"
                value={post.imageUrl || ''}
                onChange={(e) => updatePost(index, 'imageUrl', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="https://..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Caption</label>
              <textarea
                value={post.caption || ''}
                onChange={(e) => updatePost(index, 'caption', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Link</label>
              <input
                type="text"
                value={post.link || ''}
                onChange={(e) => updatePost(index, 'link', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="https://instagram.com/..."
              />
            </div>
          </div>
        ))}
        <button
          onClick={addPost}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          <FaPlus /> Add Post
        </button>
      </div>
    </div>
  );
};

// FAQ Editor Component
const FAQEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  const updateField = (field: string, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const faqCategories = [
    { value: 'general', label: 'General' },
    { value: 'delivery', label: 'Delivery & Shipping' },
    { value: 'quality', label: 'Product Quality' },
    { value: 'bulk-order', label: 'Bulk Orders' },
    { value: 'store-address', label: 'Store Address' },
    { value: 'payment', label: 'Payment' },
    { value: 'return', label: 'Returns & Exchanges' },
  ];

  const toggleCategory = (category: string) => {
    const categories = [...(data.selectedCategories || [])];
    const index = categories.indexOf(category);
    if (index > -1) {
      categories.splice(index, 1);
    } else {
      categories.push(category);
    }
    onChange({ ...data, selectedCategories: categories });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Heading</label>
        <input
          type="text"
          value={data.heading || ''}
          onChange={(e) => updateField('heading', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
        <textarea
          value={data.subtitle || ''}
          onChange={(e) => updateField('subtitle', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          rows={2}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Display Mode</label>
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="radio"
              name="faqMode"
              value="category"
              checked={data.mode === 'category'}
              onChange={() => updateField('mode', 'category')}
              className="mr-2"
            />
            Show questions from selected categories
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="faqMode"
              value="random"
              checked={data.mode === 'random'}
              onChange={() => updateField('mode', 'random')}
              className="mr-2"
            />
            Show random questions from any category
          </label>
        </div>
      </div>
      {data.mode === 'category' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Categories</label>
          <div className="grid grid-cols-2 gap-2">
            {faqCategories.map((cat) => (
              <label key={cat.value} className="flex items-center">
                <input
                  type="checkbox"
                  checked={(data.selectedCategories || []).includes(cat.value)}
                  onChange={() => toggleCategory(cat.value)}
                  className="mr-2"
                />
                {cat.label}
              </label>
            ))}
          </div>
        </div>
      )}
      {data.mode === 'random' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Number of Questions</label>
          <input
            type="number"
            min="1"
            max="20"
            value={data.randomCount || 5}
            onChange={(e) => updateField('randomCount', parseInt(e.target.value) || 5)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
          <p className="text-xs text-gray-500 mt-1">Select how many random questions to display (1-20)</p>
        </div>
      )}
    </div>
  );
};

// Testimonials Editor Component
const TestimonialsEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  const updateField = (field: string, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Heading</label>
        <input
          type="text"
          value={data.heading || ''}
          onChange={(e) => updateField('heading', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
        <textarea
          value={data.subtitle || ''}
          onChange={(e) => updateField('subtitle', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          rows={2}
        />
      </div>
      <div>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={data.showRatingFilters !== false}
            onChange={(e) => updateField('showRatingFilters', e.target.checked)}
            className="mr-2"
          />
          Show Rating Filters (5 stars, 4 stars, etc.)
        </label>
      </div>
      <p className="text-sm text-gray-500">
        Note: Testimonials are fetched from reviews. You can customize the heading and subtitle here.
      </p>
    </div>
  );
};

// Wash Care Editor Component
const WashCareEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  const updateField = (field: string, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Heading</label>
        <input
          type="text"
          value={data.heading || ''}
          onChange={(e) => updateField('heading', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <p className="text-sm text-gray-500">
        Note: Wash care instructions are managed in the product edit page. This only allows customizing the heading.
      </p>
    </div>
  );
};

// Customer Order Gallery Editor Component
const CustomerOrderGalleryEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  const updateField = (field: string, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Heading</label>
        <input
          type="text"
          value={data.heading || ''}
          onChange={(e) => updateField('heading', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
        <textarea
          value={data.subtitle || ''}
          onChange={(e) => updateField('subtitle', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          rows={2}
        />
      </div>
      <p className="text-sm text-gray-500">
        Note: Customer order images are managed in the product edit page. This only allows customizing the heading and subtitle.
      </p>
    </div>
  );
};

// Videos Editor Component
const VideosEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  const updateField = (field: string, value: any) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Heading</label>
        <input
          type="text"
          value={data.heading || ''}
          onChange={(e) => updateField('heading', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
        <textarea
          value={data.subtitle || ''}
          onChange={(e) => updateField('subtitle', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          rows={2}
        />
      </div>
      <p className="text-sm text-gray-500">
        Note: Videos are managed in the product edit page. This only allows customizing the heading and subtitle.
      </p>
    </div>
  );
};

export default ProductSectionsManager;

