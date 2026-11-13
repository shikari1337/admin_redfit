import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaArrowLeft, FaPlus, FaTrash, FaSave } from 'react-icons/fa';
import { specificationsAPI } from '../services/api';

/**
 * One reusable specification set. The form edits sections of label and value rows; the v2 adapter
 * (lib/v2/areas/catalog.ts specBody) stores them as the table's `items` rows, each carrying its
 * section heading. A set is linked from the product's own page (Additional specifications, Linked
 * template), so this form has no product picker: the table has no product column.
 */
interface Section {
  heading: string;
  items: Array<{ key: string; value: string }>;
}

const blankSection = (): Section => ({ heading: '', items: [{ key: '', value: '' }] });

const SpecificationForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [name, setName] = useState('');
  const [sections, setSections] = useState<Section[]>([blankSection()]);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEdit || !id) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const response = await specificationsAPI.getById(id);
        const spec = response?.data || response;
        if (!alive) return;
        setName(spec?.name || '');
        const loaded: Section[] = Array.isArray(spec?.sections) ? spec.sections : [];
        setSections(loaded.length ? loaded.map((s) => ({ heading: s.heading || '', items: s.items?.length ? s.items : [{ key: '', value: '' }] })) : [blankSection()]);
        setIsActive(spec?.isActive !== false);
      } catch (err: any) {
        if (alive) setError(err.response?.data?.message || 'Could not load this specification set.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, isEdit]);

  const patchSection = (index: number, next: Section) => setSections((prev) => prev.map((s, i) => (i === index ? next : s)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Give the set a name.'); return; }
    const cleaned = sections
      .map((s) => ({ heading: s.heading.trim(), items: s.items.map((it) => ({ key: it.key.trim(), value: it.value.trim() })).filter((it) => it.key || it.value) }))
      .filter((s) => s.items.length > 0);
    if (cleaned.length === 0) { setError('Add at least one row with a label and a value.'); return; }
    if (cleaned.some((s) => s.items.some((it) => !it.key || !it.value))) { setError('Every row needs both a label and a value.'); return; }
    if (cleaned.length > 1 && cleaned.some((s) => !s.heading)) { setError('With more than one section, give each section a heading.'); return; }

    setSaving(true);
    try {
      const payload = { name: name.trim(), sections: cleaned, isActive };
      if (isEdit && id) await specificationsAPI.update(id, payload);
      else await specificationsAPI.create(payload);
      navigate('/products/specifications');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not save the specification set.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading...</div>;
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/products/specifications')} aria-label="Back to specifications" className="text-gray-600 hover:text-gray-900">
          <FaArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit specification set' : 'New specification set'}</h1>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-4 sm:p-6 space-y-6">
        <div>
          <label htmlFor="spec-name" className="block text-sm font-medium text-gray-700 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input id="spec-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="For example: Dilution, 30 ml" required />
          <p className="text-xs text-gray-500 mt-1">Staff see this name when they link the set on a product.</p>
        </div>

        <div>
          <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
            <span className="block text-sm font-medium text-gray-700">Rows</span>
            <button type="button" onClick={() => setSections((prev) => [...prev, blankSection()])}
              className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
              <FaPlus className="mr-1" size={12} /> Add section
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-3">A heading is optional with one section; the product page shows each heading above its rows.</p>

          <div className="space-y-4">
            {sections.map((section, si) => (
              <div key={si} className="border border-gray-200 rounded-lg p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-3">
                  <input type="text" value={section.heading} onChange={(e) => patchSection(si, { ...section, heading: e.target.value })}
                    placeholder={sections.length > 1 ? 'Section heading' : 'Section heading (optional)'} aria-label="Section heading" className={`${inputCls} flex-1`} />
                  {sections.length > 1 && (
                    <button type="button" onClick={() => setSections((prev) => prev.filter((_, i) => i !== si))} aria-label="Remove section" className="p-2 text-red-600 hover:text-red-800">
                      <FaTrash />
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {section.items.map((item, ii) => (
                    <div key={ii} className="flex flex-col sm:flex-row gap-2">
                      <input type="text" value={item.key} aria-label="Label" placeholder="Label (for example: Composition)"
                        onChange={(e) => patchSection(si, { ...section, items: section.items.map((x, j) => (j === ii ? { ...x, key: e.target.value } : x)) })}
                        className={`${inputCls} sm:flex-1`} />
                      <div className="flex gap-2 sm:flex-1">
                        <input type="text" value={item.value} aria-label="Value" placeholder="Value (for example: 30 ml)"
                          onChange={(e) => patchSection(si, { ...section, items: section.items.map((x, j) => (j === ii ? { ...x, value: e.target.value } : x)) })}
                          className={`${inputCls} flex-1`} />
                        <button type="button" aria-label="Remove row" disabled={section.items.length === 1}
                          onClick={() => patchSection(si, { ...section, items: section.items.filter((_, j) => j !== ii) })}
                          className="px-3 text-red-600 hover:text-red-800 disabled:opacity-30">
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => patchSection(si, { ...section, items: [...section.items, { key: '', value: '' }] })}
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center">
                    <FaPlus className="mr-1" size={10} /> Add row
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded" />
          Active (a paused set shows nothing on the products linked to it)
        </label>

        <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
          <button type="submit" disabled={saving} className="flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-60">
            <FaSave className="mr-2" />
            {saving ? 'Saving...' : isEdit ? 'Save set' : 'Create set'}
          </button>
          <button type="button" onClick={() => navigate('/products/specifications')} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default SpecificationForm;
