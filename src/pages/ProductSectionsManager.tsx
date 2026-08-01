import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { productsAPI, uploadAPI } from '../services/api';
import { FaArrowLeft, FaCheck, FaTimes, FaEdit, FaPlus, FaTrash, FaUpload, FaMagic, FaImage } from 'react-icons/fa';
import ImageInputWithActions from '../components/common/ImageInputWithActions';
import IconPicker from '../components/IconPicker';
import RichTextEditor from '../components/common/RichTextEditor';
import { useAuth } from '../contexts/AuthContext';

interface ProductPageSection {
  sectionId: string;
  name: string;
  description: string;
  enabled: boolean;
  order: number;
  customData?: any;
}

/**
 * Sections read by the LIVE Next.js storefront (storefront/src/app/product/[slug]/page.tsx).
 * These are built-ins: toggleable + orderable, never deletable. With empty customData the
 * storefront renders nothing for them (or falls back to the product's own fields), so
 * defaulting them to enabled is safe.
 */
const storefrontSections: Omit<ProductPageSection, 'order' | 'customData'>[] = [
  { sectionId: 'short-description', name: 'Short Description Override', description: 'Overrides the product short description on the live storefront product page', enabled: true },
  { sectionId: 'description', name: 'Description', description: 'Rich HTML description — overrides the product description on the live storefront', enabled: true },
  { sectionId: 'dosage', name: 'Dosage', description: 'Dosage instructions block on the live storefront product page', enabled: true },
  { sectionId: 'important-info', name: 'Important Information', description: 'Important information block on the live storefront product page', enabled: true },
  { sectionId: 'faqs', name: 'FAQs', description: 'Question & answer list rendered on the live storefront product page', enabled: true },
  { sectionId: 'form-content', name: 'Per-Form Content', description: 'Different description/dosage per product form — Dilution, Mother Tincture…', enabled: true },
];

/** Sections rendered ONLY by the legacy ecom/ single-product theme — the main storefront ignores them. */
const availableSections: Omit<ProductPageSection, 'order' | 'customData'>[] = [
  { sectionId: 'features', name: 'Features Box', description: 'Top Quality, Easy Exchange, Free Shipping', enabled: true },
  { sectionId: 'whySpeedster', name: 'Why Speedster', description: 'Why choose this product', enabled: true },
  { sectionId: 'videos', name: 'Product Videos', description: 'Video feed section', enabled: true },
  { sectionId: 'testimonials', name: 'Testimonials', description: 'Customer reviews and testimonials', enabled: true },
  { sectionId: 'washCare', name: 'Wash Care Instructions', description: 'Care instructions with icons', enabled: true },
  { sectionId: 'customerOrderGallery', name: 'Customer Order Gallery', description: 'Screenshots of customer orders', enabled: true },
  { sectionId: 'stylingGuide', name: 'Styling Guide', description: 'How to style the product', enabled: true },
  { sectionId: 'instagramFeed', name: 'Instagram Feed', description: 'Instagram posts grid', enabled: true },
  { sectionId: 'faq', name: 'FAQ', description: "Frequently asked questions (legacy theme FAQ — the main storefront uses the 'FAQs' section in the live group above)", enabled: true },
  { sectionId: 'whyUs', name: 'Why Us', description: 'Benefits and advantages', enabled: true },
];

/**
 * A+ Content as a LAYOUT entry: the blocks themselves live in
 * products.aplus_content and are edited in the product editor — this row only
 * controls WHERE the block renders (single-product template order) and WHETHER
 * it renders at all. Disabling hides it on BOTH storefronts without deleting a
 * single block, so it can be turned back on later intact.
 */
const APLUS_SECTION: Omit<ProductPageSection, 'order' | 'customData'> = {
  sectionId: 'aplusContent',
  name: 'A+ Content (Product Highlights)',
  description: 'Rich content blocks from the product editor — toggle off to hide WITHOUT deleting; blocks stay saved.',
  enabled: true,
};

// ─── Custom Section Modal ─────────────────────────────────────────────────────

interface CustomField { key: string; value: string; }

const CustomSectionModal: React.FC<{
  onClose: () => void;
  onAdd: (section: ProductPageSection) => void;
}> = ({ onClose, onAdd }) => {
  const [name, setName]         = useState('');
  const [sectionId, setSectionId] = useState('');
  const [fields, setFields]     = useState<CustomField[]>([{ key: '', value: '' }]);
  const [error, setError]       = useState('');

  // Auto-generate a sectionId slug from the name
  function handleNameChange(v: string) {
    setName(v);
    setSectionId(v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  }

  function setField(idx: number, part: 'key' | 'value', v: string) {
    setFields(prev => prev.map((f, i) => i === idx ? { ...f, [part]: v } : f));
  }

  function addField() { setFields(prev => [...prev, { key: '', value: '' }]); }

  function removeField(idx: number) { setFields(prev => prev.filter((_, i) => i !== idx)); }

  function handleAdd() {
    if (!name.trim())      { setError('Section name is required'); return; }
    if (!sectionId.trim()) { setError('Section ID is required'); return; }
    const customData: Record<string, any> = {};
    for (const f of fields) {
      if (!f.key.trim()) continue;
      // Try to parse JSON values (arrays, objects, numbers, booleans)
      let val: any = f.value;
      if (val.startsWith('[') || val.startsWith('{')) {
        try { val = JSON.parse(val); } catch { /* keep as string */ }
      } else if (val === 'true') { val = true; }
      else if (val === 'false')  { val = false; }
      else if (val !== '' && !isNaN(Number(val))) { val = Number(val); }
      customData[f.key.trim()] = val;
    }
    onAdd({
      sectionId: sectionId.trim(),
      name: name.trim(),
      description: 'Custom section',
      enabled: true,
      order: 999,
      customData,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Create Custom Section</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><FaTimes /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Section Name</label>
            <input
              type="text" value={name} onChange={e => handleNameChange(e.target.value)}
              placeholder="e.g. Dosage Instructions"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Section ID <span className="text-xs text-gray-400">(used as column prefix in CSV export)</span>
            </label>
            <input
              type="text" value={sectionId} onChange={e => setSectionId(e.target.value)}
              placeholder="dosage_instructions"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {sectionId && (
              <p className="text-xs text-gray-400 mt-1">
                Exported as: <code className="bg-gray-100 px-1 rounded">section_{sectionId}_key</code>
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Fields (key → value)</label>
              <button type="button" onClick={addField} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <FaPlus size={10} /> Add field
              </button>
            </div>
            <div className="space-y-2">
              {fields.map((f, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text" value={f.key} onChange={e => setField(i, 'key', e.target.value)}
                    placeholder="key (e.g. text)"
                    className="w-1/3 border border-gray-300 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-blue-400"
                  />
                  <input
                    type="text" value={f.value} onChange={e => setField(i, 'value', e.target.value)}
                    placeholder="value (text, number, or JSON array/object)"
                    className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-400"
                  />
                  <button type="button" onClick={() => removeField(i)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                    <FaTrash size={11} />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Tip: use JSON for arrays/objects — e.g. <code className="bg-gray-100 px-1 rounded">[{"{\"q\":\"...\",\"a\":\"...\"}"}]</code>
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-gray-200">
          <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm">Cancel</button>
          <button type="button" onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Add Section</button>
        </div>
      </div>
    </div>
  );
};

// ─── ProductSectionsManager ───────────────────────────────────────────────────

const ProductSectionsManager: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canAccess } = useAuth();
  const [sections, setSections] = useState<ProductPageSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);
  /** Unsaved LAYOUT changes (toggle/reorder/custom add/delete). Content edits
   *  persist immediately from the modal, so they never set this. */
  const [dirty, setDirty] = useState(false);
  // Store the resolved product ID for updates (may differ from URL param which can be a slug)
  const [productId, setProductId] = useState<string>('');

  useEffect(() => {
    if (id) {
      fetchProduct();
    }
  }, [id]);

  const fetchProduct = async () => {
    try {
      setLoading(true);
      // MongoDB ObjectId (24 hex) or PostgreSQL UUID (36 chars) → fetch by ID; anything else is a slug
      const isId = id && (
        /^[0-9a-fA-F]{24}$/.test(id) ||
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(id)
      );
      let rawProduct: any;
      if (!isId) {
        rawProduct = await productsAPI.getBySlug(id!);
      } else {
        const response = await productsAPI.getById(id!);
        rawProduct = (response && response.success && response.data)
          ? response.data
          : (response && response.data)
          ? response.data
          : response;
      }
      const product = rawProduct;

      if (!product || typeof product !== 'object') {
        throw new Error('Invalid product data received');
      }

      // Store the resolved product ID (UUID or ObjectId) for use in handleSave
      setProductId(product._id || product.id || id || '');

      // Initialize sections from product or use defaults
      // PG returns snake_case page_sections; MongoDB returned camelCase pageSections
      const existingPageSections: any[] = product.page_sections || product.pageSections || [];
      // Built-ins = live-storefront sections FIRST, then legacy ecom-theme
      // sections, then A+ Content LAST — section content renders before the A+
      // blocks by default.
      const builtInSections = [...storefrontSections, ...availableSections, APLUS_SECTION];
      if (existingPageSections.length > 0) {
        // Merge with built-in sections to get full info (enabled/order/customData preserved)
        const mergedSections = builtInSections.map(builtIn => {
          const productSection = existingPageSections.find((ps: any) => ps.sectionId === builtIn.sectionId);
          return {
            ...builtIn,
            enabled: productSection?.enabled !== false,
            order: productSection?.order ?? builtInSections.indexOf(builtIn),
            customData: productSection?.customData,
          };
        });
        // Add any sections that exist in product but not in the built-in catalogs (custom)
        existingPageSections.forEach((ps: any) => {
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
        setSections(builtInSections.map((section, index) => ({
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

  const handleAddCustomSection = (section: ProductPageSection) => {
    // Prevent duplicate sectionId
    if (sections.some(s => s.sectionId === section.sectionId)) {
      alert(`A section with ID "${section.sectionId}" already exists.`);
      return;
    }
    setSections(prev => [...prev, { ...section, order: prev.length }]);
    setDirty(true);
  };

  const handleDeleteSection = (sectionId: string) => {
    // Only allow deleting custom (non-built-in) sections
    const isBuiltIn =
      sectionId === APLUS_SECTION.sectionId ||
      storefrontSections.some(s => s.sectionId === sectionId) ||
      availableSections.some(s => s.sectionId === sectionId);
    if (isBuiltIn) return;
    if (!confirm('Remove this custom section?')) return;
    setSections(prev => prev.filter(s => s.sectionId !== sectionId));
    setDirty(true);
  };

  const handleToggleSection = (sectionId: string) => {
    setSections(sections.map(section =>
      section.sectionId === sectionId
        ? { ...section, enabled: !section.enabled }
        : section
    ));
    setDirty(true);
  };

  /** Swap a section with its neighbour WITHIN its display group, re-numbering
   *  global `order` by array index (sections list stays a single ordered array). */
  const moveWithinGroup = (group: ProductPageSection[], groupIndex: number, dir: -1 | 1) => {
    const current = group[groupIndex];
    const neighbour = group[groupIndex + dir];
    if (!current || !neighbour) return;
    const a = sections.findIndex(s => s.sectionId === current.sectionId);
    const b = sections.findIndex(s => s.sectionId === neighbour.sectionId);
    if (a === -1 || b === -1) return;
    const items = [...sections];
    [items[a], items[b]] = [items[b], items[a]];
    setSections(items.map((item, i) => ({ ...item, order: i })));
    setDirty(true);
  };

  /**
   * Persist a sections array RIGHT NOW. The old flow was a two-step trap: the
   * content modal's "Save" only updated local state, and nothing reached the
   * backend until a second "Save Sections" click — so edits were routinely
   * typed, "saved", and lost. Content edits now persist from the modal itself;
   * layout changes (toggle/reorder) stage here and flag `dirty`.
   */
  const persistSections = async (next: ProductPageSection[]): Promise<boolean> => {
    try {
      setSaving(true);
      const page_sections = next.map(section => ({
        sectionId: section.sectionId,
        enabled: section.enabled,
        order: section.order,
        customData: section.customData,
      }));
      // Send as page_sections (snake_case) to match the PostgreSQL column name
      await productsAPI.update(productId || id!, { page_sections });
      setDirty(false);
      return true;
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to save sections');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const ok = await persistSections(sections);
    if (ok) {
      alert('Sections updated successfully!');
      navigate('/products');
    }
  };

  // Module gate — the backend field guard strips page_sections when the A+ Content
  // module is off, so the editor would silently lie. Show a notice instead.
  if (!canAccess('aplus_content')) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 max-w-md text-center">
          <h1 className="text-lg font-bold text-gray-900 mb-2">Content sections are disabled for this store</h1>
          <p className="text-sm text-gray-600 mb-6">
            The A+ Content / Content Blocks module is turned off. Ask your platform admin to
            enable it — saves are ignored while it is off.
          </p>
          <button
            type="button"
            onClick={() => navigate('/products')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <FaArrowLeft size={12} /> Back to Products
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
      </div>
    );
  }

  // Partition into display groups (each keeps its relative order from `sections`)
  const storefrontIds = new Set(storefrontSections.map(s => s.sectionId));
  const legacyIds = new Set(availableSections.map(s => s.sectionId));
  const storefrontGroup = sections.filter(s => storefrontIds.has(s.sectionId));
  const legacyGroup = sections.filter(s => legacyIds.has(s.sectionId));
  const aplusGroup = sections.filter(s => s.sectionId === APLUS_SECTION.sectionId);
  const customGroup = sections.filter(s =>
    !storefrontIds.has(s.sectionId) && !legacyIds.has(s.sectionId) && s.sectionId !== APLUS_SECTION.sectionId);

  const renderSectionRow = (section: ProductPageSection, group: ProductPageSection[], groupIndex: number) => {
    const isAplus = section.sectionId === APLUS_SECTION.sectionId;
    const isCustom = !isAplus && !storefrontIds.has(section.sectionId) && !legacyIds.has(section.sectionId);
    return (
      <div
        key={section.sectionId}
        className={`flex items-center gap-4 p-4 border rounded-lg bg-white ${isCustom ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-200'}`}
      >
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => moveWithinGroup(group, groupIndex, -1)}
            disabled={groupIndex === 0}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => moveWithinGroup(group, groupIndex, 1)}
            disabled={groupIndex === group.length - 1}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ↓
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">{section.name}</h3>
            {isCustom && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded">Custom</span>
            )}
          </div>
          <p className="text-sm text-gray-500">{section.description}</p>
          <span className="text-xs text-gray-400 font-mono">id: {section.sectionId} · export: section_{section.sectionId}_*</span>
        </div>
        <div className="flex items-center gap-2">
          {isAplus ? (
            // A+ blocks are authored in the product editor — this row only
            // positions/toggles them.
            <button
              type="button"
              onClick={() => navigate(`/products/${id}/edit`)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200"
              title="Edit A+ blocks in the product editor"
            >
              <FaEdit /> Edit in Product Editor
            </button>
          ) : (
          <button
            type="button"
            onClick={() => setEditingSection(section.sectionId)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200"
            title="Edit Content"
          >
            <FaEdit /> Edit Content
          </button>
          )}
          <button
            type="button"
            onClick={() => handleToggleSection(section.sectionId)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
              section.enabled
                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {section.enabled ? <><FaCheck /> Enabled</> : <><FaTimes /> Disabled</>}
          </button>
          {isCustom && (
            <button
              type="button"
              onClick={() => handleDeleteSection(section.sectionId)}
              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md"
              title="Remove custom section"
            >
              <FaTrash size={13} />
            </button>
          )}
        </div>
      </div>
    );
  };

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

      {/* The #1 confusion on this page: the hero/highlight blocks people SEE on
          their product page (image+text bands, icon strips, comparison tables)
          are A+ CONTENT — a different column, edited in the product form. This
          page controls section LAYOUT + text overrides only. Say so up front. */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 mb-4 text-sm text-amber-900">
        <span className="font-semibold">Looking for the image/icon “highlight” blocks you see on the product page?</span>{' '}
        Those are <span className="font-semibold">A+ Content</span>, not page sections — edit them in{' '}
        <button type="button" onClick={() => navigate(`/products/${id}/edit`)}
          className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700">
          the product editor → Product Content (A+ Sections)
        </button>. This page controls which sections show, their order, and their text content.
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-600">
            Enable/disable and reorder sections on the product page. Which group applies depends on
            the storefront your store runs — both are saved on the product either way.
          </p>
          <button
            type="button"
            onClick={() => setShowCustomModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 font-medium"
          >
            <FaPlus size={11} /> Custom Section
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-1">Multi-product storefront sections</h2>
            <p className="text-xs text-gray-500 mb-3">Rendered by the multi-product storefront (catalog stores, e.g. homeomead.com). Stores on the single-product template ignore these.</p>
            <div className="space-y-3">
              {storefrontGroup.map((section, i) => renderSectionRow(section, storefrontGroup, i))}
            </div>
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-1">Single-product template sections</h2>
            <p className="text-xs text-gray-500 mb-3">Rendered by the single-product storefront template (e.g. ziptronbags.com). Sections with no content edited here fall back to the template's built-in copy.</p>
            <div className="space-y-3">
              {legacyGroup.map((section, i) => renderSectionRow(section, legacyGroup, i))}
            </div>
          </div>
          {customGroup.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-1">Custom sections</h2>
              <div className="space-y-3">
                {customGroup.map((section, i) => renderSectionRow(section, customGroup, i))}
              </div>
            </div>
          )}
          {aplusGroup.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-1">A+ Content</h2>
              <p className="text-xs text-gray-500 mb-3">
                Renders on BOTH storefronts, AFTER all the sections above. Toggling it off hides the
                blocks without deleting anything — they stay saved on the product and come back the
                moment you re-enable.
              </p>
              <div className="space-y-3">
                {aplusGroup.map((section, i) => renderSectionRow(section, aplusGroup, i))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-4">
        {dirty && (
          <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
            Unsaved layout changes — click "Save Sections"
          </span>
        )}
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

      {/* Custom Section Creator Modal */}
      {showCustomModal && (
        <CustomSectionModal
          onClose={() => setShowCustomModal(false)}
          onAdd={handleAddCustomSection}
        />
      )}

      {/* Section Content Editor Modal — its Save PERSISTS immediately (no
          second "Save Sections" click needed for content). */}
      {editingSection && (
        <SectionContentEditor
          section={sections.find(s => s.sectionId === editingSection)!}
          productId={productId || id || undefined}
          onClose={() => setEditingSection(null)}
          onSave={async (customData) => {
            const next = sections.map(s =>
              s.sectionId === editingSection
                ? { ...s, customData }
                : s
            );
            setSections(next);
            const ok = await persistSections(next);
            if (ok) setEditingSection(null);
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
  /** Persists immediately (async) — the modal awaits it and shows progress. */
  onSave: (customData: any) => void | Promise<void>;
  productId?: string;
}

const SectionContentEditor: React.FC<SectionContentEditorProps> = ({ section, onClose, onSave, productId }) => {
  const { id } = useParams();
  const effectiveProductId = productId || id;
  
  /** Has this section ever been saved? Drives the "storefront is showing its
   *  own default" notice — an empty object counts as unsaved. */
  const hasSavedContent = !!section.customData && Object.keys(section.customData).length > 0;

  const [formData, setFormData] = useState<any>(() => {
    if (hasSavedContent) {
      return section.customData;
    }
    return getDefaultContent(section.sectionId);
  });

  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [savingContent, setSavingContent] = useState(false);

  const handleSave = async () => {
    setSavingContent(true);
    try { await onSave(formData); } finally { setSavingContent(false); }
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
        generatePrompt || undefined
      );

      // Response is already normalized by API service
      if (response) {
        // Replace form data with generated content
        const merged = { ...formData, ...response };
        setFormData(merged);
        alert('Content generated successfully!');
        setShowGenerateModal(false);
        setGeneratePrompt('');
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
      // ── Live storefront sections ──
      case 'short-description':
      case 'description':
      case 'dosage':
      case 'important-info':
        return <HtmlContentEditor data={formData} onChange={setFormData} />;
      case 'faqs':
        return <FaqItemsEditor data={formData} onChange={setFormData} />;
      case 'form-content':
        return <FormContentEditor data={formData} onChange={setFormData} />;
      // ── Legacy ecom-theme sections ──
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
        // Generic key-value editor for custom sections
        return <CustomSectionDataEditor data={formData} onChange={setFormData} />;
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
            {/* Until a section is saved the storefront renders ITS OWN built-in
                content, which is why the page can show copy that appears
                nowhere here. Say so plainly instead of letting the two silently
                disagree. */}
            {!hasSavedContent && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <span className="mt-0.5 shrink-0">ⓘ</span>
                <span>
                  Nothing is saved for this section yet, so your storefront is showing its
                  <b> built-in default content</b> — that is the text you see on the live page.
                  Fill this in and save to take control of it; whatever you save replaces the default.
                </span>
              </div>
            )}
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
              disabled={savingContent}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {savingContent ? 'Saving…' : 'Save Content'}
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
                Generate AI content for the <strong>{section.name}</strong> section.
                Content will be generated based on the product details.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Prompt (Optional)
                </label>
                <textarea
                  value={generatePrompt}
                  onChange={(e) => setGeneratePrompt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  rows={3}
                  placeholder="e.g., Generate product features highlighting quality and durability"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave blank to use default prompt for this section
                </p>
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

// Default content generators
const getDefaultContent = (sectionId: string): any => {
  switch (sectionId) {
    // Live storefront sections — deliberately empty: with no content the
    // storefront renders nothing / falls back to the product's own fields.
    case 'short-description':
    case 'description':
    case 'dosage':
    case 'important-info':
      return { content: '' };
    case 'faqs':
      return { items: [] };
    case 'form-content':
      return { forms: {} };
    case 'features':
      return {
        items: [
          { title: 'Top Quality Products', description: 'Premium materials and craftsmanship for lasting durability', iconType: 'check' },
          { title: 'Easy Exchange', description: 'Hassle-free returns and exchanges within 7 days', iconType: 'exchange' },
          { title: 'Free Shipping In Prepaid Orders', description: 'Enjoy free delivery on all prepaid orders across India', iconType: 'shipping' },
        ]
      };
    case 'whySpeedster':
      // Deliberately BLANK. This used to ship demo copy for a Formula 1 jacket
      // (a different store's template). Because the storefront renders its own
      // built-in content until something is saved here, that demo text made the
      // editor disagree with the live page — and saving it would have replaced
      // the real product copy with Ferrari jacket text.
      return {
        heading: '',
        subtitle: '',
        imageUrl: '',
        items: [
          { title: '', description: '', iconType: 'shield' },
          { title: '', description: '', iconType: 'star' },
          { title: '', description: '', iconType: 'bolt' },
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
        subtitle: 'Discover how to style this product for different occasions',
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
          { id: '2', imageUrl: '', caption: 'Customer photo', link: '' },
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
        subtitle: 'Watch this product in action',
        videos: [], // Will use product.videos if empty
      };
    default:
      return {};
  }
};

// ─── Generic editor for custom sections ──────────────────────────────────────

const CustomSectionDataEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  // Represent each top-level key as an editable row; arrays/objects as JSON strings
  const entries: Array<{ key: string; raw: string }> = Object.entries(data || {}).map(([k, v]) => ({
    key: k,
    raw: typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v),
  }));

  function setRow(idx: number, part: 'key' | 'raw', val: string) {
    const next = [...entries];
    next[idx] = { ...next[idx], [part]: val };
    rebuildData(next);
  }

  function addRow() {
    rebuildData([...entries, { key: '', raw: '' }]);
  }

  function removeRow(idx: number) {
    rebuildData(entries.filter((_, i) => i !== idx));
  }

  function rebuildData(rows: Array<{ key: string; raw: string }>) {
    const obj: Record<string, any> = {};
    for (const { key, raw } of rows) {
      if (!key.trim()) continue;
      let val: any = raw;
      if (raw.startsWith('[') || raw.startsWith('{')) {
        try { val = JSON.parse(raw); } catch { /* keep string */ }
      } else if (raw === 'true')  { val = true; }
      else if (raw === 'false')   { val = false; }
      else if (raw !== '' && !isNaN(Number(raw))) { val = Number(raw); }
      obj[key.trim()] = val;
    }
    onChange(obj);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Edit fields below. Values are exported as <code className="bg-gray-100 px-1 rounded">section_[id]_[key]</code> columns.
        Use JSON arrays/objects for complex values.
      </p>
      <div className="space-y-2">
        {entries.map((row, i) => (
          <div key={i} className="flex gap-2 items-start">
            <input
              type="text" value={row.key}
              onChange={e => setRow(i, 'key', e.target.value)}
              placeholder="key"
              className="w-1/4 border border-gray-300 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-blue-400"
            />
            <textarea
              value={row.raw}
              onChange={e => setRow(i, 'raw', e.target.value)}
              placeholder="value (text, number, true/false, or JSON)"
              rows={row.raw.includes('\n') ? 3 : 1}
              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs resize-y focus:outline-none focus:border-blue-400"
            />
            <button type="button" onClick={() => removeRow(i)} className="mt-1 text-red-400 hover:text-red-600 flex-shrink-0">
              <FaTrash size={11} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-medium"
      >
        <FaPlus size={10} /> Add field
      </button>
    </div>
  );
};

// ─── Live storefront section editors ──────────────────────────────────────────

/** short-description / description / dosage / important-info → customData.content.
 *  Rich-text (same editor as product descriptions) with an optional raw-HTML
 *  view for people pasting markup — never a bare "paste HTML" box. */
const HtmlContentEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  const [rawMode, setRawMode] = React.useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">Content</label>
        <button type="button" onClick={() => setRawMode(m => !m)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          {rawMode ? 'Visual editor' : 'Edit HTML'}
        </button>
      </div>
      {rawMode ? (
        <textarea
          value={data?.content || ''}
          onChange={(e) => onChange({ ...data, content: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={14}
          placeholder="<p>Your content…</p>"
        />
      ) : (
        <RichTextEditor
          value={data?.content || ''}
          onChange={(html: string) => onChange({ ...data, content: html })}
          placeholder="Section content — use the toolbar to format headings, lists, links…"
          minHeight={220}
        />
      )}
      <p className="text-xs text-gray-500">
        Overrides the product's own text on the multi-product storefront. Leave empty to keep the product default.
        Scripts and inline event handlers are stripped on save.
      </p>
    </div>
  );
};

/** faqs → customData.items = [{ question, answer }] */
const FaqItemsEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  const items: Array<{ question?: string; answer?: string }> = data?.items || [];

  const updateItem = (index: number, field: 'question' | 'answer', value: string) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    onChange({ ...data, items: next });
  };

  const addItem = () => {
    onChange({ ...data, items: [...items, { question: '', answer: '' }] });
  };

  const removeItem = (index: number) => {
    onChange({ ...data, items: items.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900">Questions & Answers</h3>
      {items.map((item, index) => (
        <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="font-medium text-gray-900">FAQ {index + 1}</h4>
            <button
              type="button"
              onClick={() => removeItem(index)}
              className="text-red-600 hover:text-red-800"
              title="Remove question"
            >
              <FaTrash />
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
            <input
              type="text"
              value={item.question || ''}
              onChange={(e) => updateItem(index, 'question', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="e.g. How should I store this medicine?"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Answer</label>
            <textarea
              value={item.answer || ''}
              onChange={(e) => updateItem(index, 'answer', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              rows={3}
              placeholder="Answer shown when the question is expanded"
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
      >
        <FaPlus /> Add Question
      </button>
    </div>
  );
};

/** form-content → customData.forms = { [formName]: { description?, dosage?, importantInfo?, faqs? } } */
const FormContentEditor: React.FC<{ data: any; onChange: (data: any) => void }> = ({ data, onChange }) => {
  const [newFormName, setNewFormName] = useState('');
  const forms: Record<string, any> = data?.forms || {};
  const formKeys = Object.keys(forms);

  const updateForm = (key: string, field: 'description' | 'dosage' | 'importantInfo', value: string) => {
    onChange({ ...data, forms: { ...forms, [key]: { ...forms[key], [field]: value } } });
  };

  const addForm = () => {
    const key = newFormName.trim();
    if (!key) return;
    if (forms[key]) {
      alert(`A form named "${key}" already exists.`);
      return;
    }
    onChange({ ...data, forms: { ...forms, [key]: { description: '', dosage: '', importantInfo: '' } } });
    setNewFormName('');
  };

  const removeForm = (key: string) => {
    if (!confirm(`Remove content for form "${key}"?`)) return;
    const next = { ...forms };
    delete next[key];
    onChange({ ...data, forms: next });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Per-form content for products whose variations span multiple forms (e.g. Dilution and
        Mother Tincture). The storefront shows the block matching the selected variation's form.
      </p>
      {formKeys.length === 0 && (
        <p className="text-sm text-gray-400 italic">No forms yet — add one below (e.g. "Dilution", "Mother Tincture").</p>
      )}
      {formKeys.map((key) => (
        <div key={key} className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="font-medium text-gray-900">{key}</h4>
            <button
              type="button"
              onClick={() => removeForm(key)}
              className="text-red-600 hover:text-red-800"
              title="Remove this form"
            >
              <FaTrash />
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (HTML allowed)</label>
            <textarea
              value={forms[key]?.description || ''}
              onChange={(e) => updateForm(key, 'description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-y"
              rows={4}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dosage (HTML allowed)</label>
            <textarea
              value={forms[key]?.dosage || ''}
              onChange={(e) => updateForm(key, 'dosage', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-y"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Important info (HTML allowed)</label>
            <textarea
              value={forms[key]?.importantInfo || ''}
              onChange={(e) => updateForm(key, 'importantInfo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-y"
              rows={3}
            />
          </div>
        </div>
      ))}
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={newFormName}
          onChange={(e) => setNewFormName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addForm(); } }}
          placeholder='Add form (e.g. "Dilution")'
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={addForm}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          <FaPlus /> Add form
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Per-form FAQs can be added via JSON in a custom field (a <code className="bg-gray-100 px-1 rounded">faqs</code> array
        of {'{'}question, answer{'}'} inside the form object is preserved if present).
      </p>
    </div>
  );
};

// ─── Individual Section Editors ───────────────────────────────────────────────

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
            <IconPicker
              label="Icon"
              value={item.iconName || ''}
              onChange={(name) => updateItem(index, 'iconName', name)}
            />
            {!item.iconName && (
              <p className="text-xs text-gray-500 mt-1">Or use legacy: <select value={item.iconType || 'check'} onChange={(e) => updateItem(index, 'iconType', e.target.value)} className="text-xs border rounded px-1">
                <option value="check">check</option>
                <option value="exchange">exchange</option>
                <option value="shipping">shipping</option>
              </select></p>
            )}
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
              <IconPicker
                label="Icon"
                value={item.iconName || ''}
                onChange={(name) => updateItem(index, 'iconName', name)}
              />
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
              <IconPicker
                label="Icon"
                value={benefit.iconName || ''}
                onChange={(name) => updateBenefit(index, 'iconName', name)}
              />
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
                    onError={() => {
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

