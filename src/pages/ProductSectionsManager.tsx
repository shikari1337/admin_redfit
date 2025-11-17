import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { productsAPI, uploadAPI } from '../services/api';
import { FaArrowLeft, FaCheck, FaTimes, FaEdit, FaPlus, FaTrash, FaUpload, FaMagic, FaImage, FaFont } from 'react-icons/fa';
import ImageInputWithActions from '../components/common/ImageInputWithActions';

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
          productId={id || undefined}
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
  productId?: string;
}

const SectionContentEditor: React.FC<SectionContentEditorProps> = ({ section, onClose, onSave, productId }) => {
  const { id } = useParams();
  const effectiveProductId = productId || id;
  
  const [formData, setFormData] = useState<any>(() => {
    if (section.customData) {
      return section.customData;
    }
    return getDefaultContent(section.sectionId);
  });

  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateOptions, setGenerateOptions] = useState({
    generateText: true,
    generateImages: false,
    generateVideos: false,
    overrideExisting: false,
  });

  const handleSave = () => {
    onSave(formData);
  };

  const handleGenerateContent = async () => {
    if (!effectiveProductId) {
      alert('Product ID not found');
      return;
    }

    setGenerating(true);
    try {
      const response = await productsAPI.generateContent(
        effectiveProductId,
        section.sectionId,
        generateOptions
      );

      if (response.success && response.data) {
        // Merge generated content with existing form data
        let merged: any;
        if (generateOptions.overrideExisting) {
          // Completely replace with generated content
          merged = response.data;
        } else {
          // Merge: fill missing fields, keep existing ones
          merged = { ...formData };
          Object.keys(response.data).forEach(key => {
            if (Array.isArray(response.data[key])) {
              // For arrays, merge items if array is empty or add new ones
              if (!merged[key] || merged[key].length === 0) {
                merged[key] = response.data[key];
              } else {
                // Merge arrays, avoiding duplicates
                const existingIds = new Set(merged[key].map((item: any) => item.id || item.title || JSON.stringify(item)));
                const newItems = response.data[key].filter((item: any) => {
                  const itemId = item.id || item.title || JSON.stringify(item);
                  return !existingIds.has(itemId);
                });
                merged[key] = [...merged[key], ...newItems];
              }
            } else if (typeof response.data[key] === 'object' && response.data[key] !== null) {
              // For objects, recursively merge
              merged[key] = { ...merged[key], ...response.data[key] };
            } else if (!merged[key] || merged[key] === '') {
              // Fill missing fields
              merged[key] = response.data[key];
            }
          });
        }
        
        setFormData(merged);
        
        // Show success message
        if (response.errors) {
          const errors = Object.values(response.errors).filter(Boolean);
          if (errors.length > 0) {
            alert(`Content generated successfully, but some errors occurred: ${errors.join(', ')}`);
          } else {
            alert('Content generated successfully!');
          }
        } else {
          alert('Content generated successfully!');
        }
        
        setShowGenerateModal(false);
      } else {
        alert('Failed to generate content');
      }
    } catch (error: any) {
      console.error('Error generating content:', error);
      alert(error.response?.data?.message || error.message || 'Failed to generate content');
    } finally {
      setGenerating(false);
    }
  };

  const renderEditor = () => {
    switch (section.sectionId) {
      case 'features':
        return <FeaturesEditor data={formData} onChange={setFormData} />;
      case 'whySpeedster':
        return <WhySpeedsterEditor data={formData} onChange={setFormData} productId={effectiveProductId} sectionId={section.sectionId} />;
      case 'whyUs':
        return <WhyUsEditor data={formData} onChange={setFormData} />;
      case 'stylingGuide':
        return <StylingGuideEditor data={formData} onChange={setFormData} productId={effectiveProductId} sectionId={section.sectionId} />;
      case 'instagramFeed':
        return <InstagramFeedEditor data={formData} onChange={setFormData} productId={effectiveProductId} sectionId={section.sectionId} />;
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
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900">Edit {section.name}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowGenerateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                title="Generate AI Content"
              >
                <FaMagic /> Generate Content
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
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

      {/* Generate Content Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Generate AI Content</h3>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
                disabled={generating}
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4 mb-6">
              <p className="text-sm text-gray-600">
                Select what content to generate for the <strong>{section.name}</strong> section.
                Content will be generated based on the product details.
              </p>

              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={generateOptions.generateText}
                    onChange={(e) => setGenerateOptions({ ...generateOptions, generateText: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">Generate Text Content</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={generateOptions.generateImages}
                    onChange={(e) => setGenerateOptions({ ...generateOptions, generateImages: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">Generate Images</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={generateOptions.generateVideos}
                    onChange={(e) => setGenerateOptions({ ...generateOptions, generateVideos: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">Generate Videos</span>
                </label>

                <div className="pt-3 border-t border-gray-200">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={generateOptions.overrideExisting}
                      onChange={(e) => setGenerateOptions({ ...generateOptions, overrideExisting: e.target.checked })}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">Override Existing Content</span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1 ml-6">
                    If unchecked, only missing fields will be filled
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                disabled={generating}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateContent}
                disabled={generating || (!generateOptions.generateText && !generateOptions.generateImages && !generateOptions.generateVideos)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <FaMagic /> Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
        items: [
          { title: 'Casual Street Style', description: 'Pair with denim jeans and sneakers for an everyday look', image: '' },
          { title: 'Sporty Look', description: 'Team up with track pants and running shoes for a sporty vibe', image: '' },
          { title: 'Layered Outfit', description: 'Layer over a hoodie or t-shirt for added warmth and style', image: '' },
          { title: 'Racing Enthusiast', description: 'Complete the look with racing boots and a matching cap', image: '' },
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

// Reusable Field Generator Component
interface FieldGeneratorProps {
  productId: string;
  sectionId: string;
  fieldType: 'text' | 'image';
  fieldPath: string;
  currentValue: string;
  onGenerate: (value: string) => void;
  label?: string;
}

const FieldGenerator: React.FC<FieldGeneratorProps> = ({
  productId,
  sectionId,
  fieldType,
  fieldPath,
  currentValue,
  onGenerate,
  label,
}) => {
  const [showContextModal, setShowContextModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [contextProductId, setContextProductId] = useState<string>(productId);
  const [contextSectionId, setContextSectionId] = useState<string>(sectionId);
  const [customPrompt, setCustomPrompt] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    if (showContextModal) {
      loadProducts();
    }
  }, [showContextModal]);

  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const response = await productsAPI.getAll();
      setProducts(response.data || []);
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleGenerate = async (useCustomPrompt: boolean = false) => {
    setGenerating(true);
    try {
      const response = await productsAPI.generateField(
        productId,
        sectionId,
        fieldType,
        fieldPath,
        {
          contextProductId: contextProductId !== productId ? contextProductId : undefined,
          contextSectionId: contextSectionId !== sectionId ? contextSectionId : undefined,
          customPrompt: useCustomPrompt ? customPrompt : undefined,
        }
      );

      if (response.success && response.data?.value) {
        onGenerate(response.data.value);
        setShowContextModal(false);
        setCustomPrompt('');
      } else {
        alert('Failed to generate content');
      }
    } catch (error: any) {
      console.error('Error generating field:', error);
      alert(error.response?.data?.message || error.message || 'Failed to generate content');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowContextModal(true)}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
          fieldType === 'text'
            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
        }`}
        title={`Generate ${fieldType} with AI`}
      >
        {fieldType === 'text' ? <FaFont size={12} /> : <FaImage size={12} />}
        <FaMagic size={10} />
      </button>

      {showContextModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                Generate {fieldType === 'text' ? 'Text' : 'Image'}
              </h3>
              <button
                onClick={() => setShowContextModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
                disabled={generating}
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Context Product (for content generation)
                </label>
                <select
                  value={contextProductId}
                  onChange={(e) => setContextProductId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  disabled={generating || loadingProducts}
                >
                  {loadingProducts ? (
                    <option>Loading products...</option>
                  ) : (
                    products.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Context Section
                </label>
                <select
                  value={contextSectionId}
                  onChange={(e) => setContextSectionId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  disabled={generating}
                >
                  {availableSections.map((s) => (
                    <option key={s.sectionId} value={s.sectionId}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Prompt (Optional)
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows={3}
                  placeholder="Enter a custom prompt for content generation..."
                  disabled={generating}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty to use default prompt based on product and section
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowContextModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                disabled={generating}
              >
                Cancel
              </button>
              <button
                onClick={() => handleGenerate(!!customPrompt)}
                disabled={generating}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <FaMagic /> Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
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

const WhySpeedsterEditor: React.FC<{ data: any; onChange: (data: any) => void; productId?: string; sectionId?: string }> = ({ data, onChange, productId, sectionId }) => {
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
      <ImageInputWithActions
        value={data.imageUrl || ''}
        onChange={(url) => updateField('imageUrl', url)}
        label="Image"
        placeholder="Enter image URL manually (https://...)"
        productId={productId}
        sectionId={sectionId}
        fieldPath="imageUrl"
        contextData={data.heading ? { sectionHeading: data.heading, sectionSubtitle: data.subtitle } : undefined}
      />
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

const StylingGuideEditor: React.FC<{ data: any; onChange: (data: any) => void; productId?: string; sectionId?: string }> = ({ data, onChange, productId, sectionId }) => {
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [generatingImageIndex, setGeneratingImageIndex] = useState<number | null>(null);
  const [showGenerateImageModal, setShowGenerateImageModal] = useState<number | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');

  // Handle backward compatibility: convert old 'tips' structure to 'items'
  const normalizedData = React.useMemo(() => {
    if (data.tips && !data.items) {
      // Convert old structure to new structure
      return {
        ...data,
        items: data.tips.map((tip: any) => ({
          title: tip.title || '',
          description: tip.description || '',
          image: tip.imageUrl || tip.image || '',
        })),
      };
    }
    return data;
  }, [data]);

  const updateField = (field: string, value: any) => {
    onChange({ ...normalizedData, [field]: value });
  };

  const updateItem = (index: number, field: string, value: string) => {
    const items = [...(normalizedData.items || [])];
    items[index] = { ...items[index], [field]: value };
    onChange({ ...normalizedData, items });
  };

  const addItem = () => {
    onChange({
      ...normalizedData,
      items: [...(normalizedData.items || []), { title: '', description: '', image: '' }]
    });
  };

  const removeItem = (index: number) => {
    const items = [...(normalizedData.items || [])];
    items.splice(index, 1);
    onChange({ ...normalizedData, items });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadingIndex(index);
      try {
        const response = await uploadAPI.uploadSingle(file, 'products');
        // Handle different response structures
        const imageUrl = response.data?.url || response.data?.data?.url || response.url;
        if (imageUrl) {
          updateItem(index, 'image', imageUrl);
        } else {
          console.error('Upload response structure:', response);
          throw new Error('No URL in upload response. Response: ' + JSON.stringify(response));
        }
      } catch (error: any) {
        console.error('Image upload error:', error);
        const errorMessage = error.response?.data?.message || 
                           error.response?.data?.error?.message ||
                           error.message || 
                           'Failed to upload image';
        alert(errorMessage);
      } finally {
        setUploadingIndex(null);
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
          value={normalizedData.heading || ''}
          onChange={(e) => updateField('heading', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
        <textarea
          value={normalizedData.subtitle || ''}
          onChange={(e) => updateField('subtitle', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          rows={2}
        />
      </div>
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Styling Tips</h4>
        {(normalizedData.items || []).map((item: any, index: number) => (
          <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h5 className="font-medium text-gray-900">Tip {index + 1}</h5>
              <button
                onClick={() => removeItem(index)}
                className="text-red-600 hover:text-red-800"
              >
                <FaTrash />
              </button>
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
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Image</label>
                {productId && sectionId && (
                  <button
                    type="button"
                    onClick={() => setShowGenerateImageModal(index)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors"
                    disabled={generatingImageIndex === index}
                    title="Generate image with AI"
                  >
                    {generatingImageIndex === index ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-700"></div>
                        Generating...
                      </>
                    ) : (
                      <>
                        <FaImage size={12} />
                        <FaMagic size={10} />
                        Generate
                      </>
                    )}
                  </button>
                )}
              </div>
              {item.image && (item.image.startsWith('http://') || item.image.startsWith('https://')) ? (
                <div className="relative group mb-3">
                  <img
                    src={item.image}
                    alt={item.title || `Tip ${index + 1}`}
                    className="w-full h-48 object-cover rounded-lg border border-gray-300"
                    onError={(e) => {
                      console.error('Image load error:', item.image);
                      // Clear invalid image URL
                      updateItem(index, 'image', '');
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => updateItem(index, 'image', '')}
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
                    id={`styling-guide-image-upload-${index}`}
                    onChange={(e) => handleImageUpload(e, index)}
                    disabled={uploadingIndex === index}
                  />
                  <label
                    htmlFor={`styling-guide-image-upload-${index}`}
                    className={`cursor-pointer ${uploadingIndex === index ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    {uploadingIndex === index ? (
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
                value={item.image || ''}
                onChange={(e) => updateItem(index, 'image', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Or enter image URL manually (https://...)"
              />
              {item.image && !item.image.startsWith('http://') && !item.image.startsWith('https://') && (
                <p className="mt-1 text-xs text-red-500">
                  Invalid URL format. Please enter a valid URL starting with http:// or https://
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">Upload an image or enter a URL manually</p>
            </div>
          </div>
        ))}
        <button
          onClick={addItem}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          <FaPlus /> Add Tip
        </button>
      </div>

      {/* Generate Image Modal */}
      {showGenerateImageModal !== null && productId && sectionId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">Generate Image with AI</h3>
              <button
                onClick={() => {
                  setShowGenerateImageModal(null);
                  setCustomPrompt('');
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
                disabled={generatingImageIndex === showGenerateImageModal}
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  Generate an image for <strong>Tip {showGenerateImageModal + 1}</strong>
                </p>
                {normalizedData.items?.[showGenerateImageModal] && (
                  <div className="bg-gray-50 p-3 rounded-md mb-3">
                    <p className="text-xs font-medium text-gray-700">Tip Title:</p>
                    <p className="text-sm text-gray-900">{normalizedData.items[showGenerateImageModal].title || 'N/A'}</p>
                    <p className="text-xs font-medium text-gray-700 mt-2">Tip Description:</p>
                    <p className="text-sm text-gray-900">{normalizedData.items[showGenerateImageModal].description || 'N/A'}</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Prompt (Optional)
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  rows={4}
                  placeholder="Enter a custom prompt for image generation. Leave empty to use default context-based prompt."
                  disabled={generatingImageIndex === showGenerateImageModal}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Default prompt includes: Product details, actual product images, section context, and this tip's title/description
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowGenerateImageModal(null);
                  setCustomPrompt('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                disabled={generatingImageIndex === showGenerateImageModal}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!productId || !sectionId || showGenerateImageModal === null) return;
                  
                  setGeneratingImageIndex(showGenerateImageModal);
                  try {
                    const response = await productsAPI.generateField(
                      productId,
                      sectionId,
                      'image',
                      `items.${showGenerateImageModal}.image`,
                      {
                        customPrompt: customPrompt || undefined,
                      }
                    );

                    if (response.success && response.data?.value) {
                      updateItem(showGenerateImageModal, 'image', response.data.value);
                      setShowGenerateImageModal(null);
                      setCustomPrompt('');
                      alert('Image generated successfully!');
                    } else {
                      alert('Failed to generate image');
                    }
                  } catch (error: any) {
                    console.error('Error generating image:', error);
                    alert(error.response?.data?.message || error.message || 'Failed to generate image');
                  } finally {
                    setGeneratingImageIndex(null);
                  }
                }}
                disabled={generatingImageIndex === showGenerateImageModal}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {generatingImageIndex === showGenerateImageModal ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <FaMagic /> Generate Image
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InstagramFeedEditor: React.FC<{ data: any; onChange: (data: any) => void; productId?: string; sectionId?: string }> = ({ data, onChange, productId, sectionId }) => {
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
            <ImageInputWithActions
              value={post.imageUrl || ''}
              onChange={(url) => updatePost(index, 'imageUrl', url)}
              label="Image URL"
              placeholder="https://..."
              productId={productId}
              sectionId={sectionId}
              fieldPath={`posts.${index}.imageUrl`}
              contextData={post.caption ? { itemTitle: post.caption } : undefined}
            />
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

