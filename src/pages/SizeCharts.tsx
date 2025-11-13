import React, { useEffect, useMemo, useState } from 'react';
import { FaPlus, FaSave, FaTrash, FaUndo, FaEdit } from 'react-icons/fa';
import { sizeChartsAPI } from '../services/api';

interface SizeChartEntry {
  size: string;
  chest?: string;
  waist?: string;
  length?: string;
  shoulder?: string;
  sleeve?: string;
  imageUrl?: string;
  [key: string]: string | undefined;
}

interface SizeChart {
  _id: string;
  name: string;
  description?: string;
  defaultImageUrl?: string;
  entries: SizeChartEntry[];
  measurementKeys?: string[];
  createdAt?: string;
  updatedAt?: string;
}

// Default measurement keys for backward compatibility
const DEFAULT_MEASUREMENT_KEYS = ['chest', 'waist', 'length', 'shoulder', 'sleeve'];

const createEmptyEntry = (measurementKeys: string[]): SizeChartEntry => {
  const entry: SizeChartEntry = { size: '' };
  measurementKeys.forEach(key => {
    entry[key] = '';
  });
  return entry;
};

const SizeCharts: React.FC = () => {
  const [charts, setCharts] = useState<SizeChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [measurementKeys, setMeasurementKeys] = useState<string[]>(DEFAULT_MEASUREMENT_KEYS);
  const [editingKeyIndex, setEditingKeyIndex] = useState<number | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [formState, setFormState] = useState({
    name: '',
    description: '',
    defaultImageUrl: '',
    entries: [createEmptyEntry(DEFAULT_MEASUREMENT_KEYS)] as SizeChartEntry[],
  });
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCharts();
  }, []);

  const fetchCharts = async (params?: { search?: string }) => {
    setLoading(true);
    try {
      const response = await sizeChartsAPI.list(params);
      const data = response.data || response;
      setCharts(Array.isArray(data) ? data : data?.data || []);
    } catch (err: any) {
      console.error('Failed to fetch size charts', err);
      setError(err.response?.data?.message || 'Failed to fetch size charts');
    } finally {
      setLoading(false);
    }
  };

  const filteredCharts = useMemo(() => {
    if (!search.trim()) return charts;
    const query = search.trim().toLowerCase();
    return charts.filter(chart => chart.name.toLowerCase().includes(query));
  }, [charts, search]);

  const resetForm = () => {
    setSelectedId(null);
    setMeasurementKeys([...DEFAULT_MEASUREMENT_KEYS]);
    setEditingKeyIndex(null);
    setNewKeyName('');
    setFormState({
      name: '',
      description: '',
      defaultImageUrl: '',
      entries: [createEmptyEntry(DEFAULT_MEASUREMENT_KEYS)],
    });
    setError(null);
  };

  const handleEdit = (chart: SizeChart) => {
    setSelectedId(chart._id);
    const keys = chart.measurementKeys && chart.measurementKeys.length > 0 
      ? chart.measurementKeys 
      : DEFAULT_MEASUREMENT_KEYS;
    setMeasurementKeys([...keys]);
    setEditingKeyIndex(null);
    setNewKeyName('');
    
    // Ensure all entries have all measurement keys
    const normalizedEntries = chart.entries && chart.entries.length > 0
      ? chart.entries.map(entry => {
          const normalized: SizeChartEntry = { size: entry.size || '' };
          keys.forEach(key => {
            normalized[key] = entry[key] || '';
          });
          if (entry.imageUrl) normalized.imageUrl = entry.imageUrl;
          return normalized;
        })
      : [createEmptyEntry(keys)];
    
    setFormState({
      name: chart.name || '',
      description: chart.description || '',
      defaultImageUrl: chart.defaultImageUrl || '',
      entries: normalizedEntries,
    });
    setError(null);
  };

  const handleEntryChange = (index: number, field: string, value: string) => {
    setFormState(prev => {
      const entries = [...prev.entries];
      entries[index] = { ...entries[index], [field]: value };
      return { ...prev, entries };
    });
  };

  const addEntry = () => {
    setFormState(prev => ({
      ...prev,
      entries: [...prev.entries, createEmptyEntry(measurementKeys)],
    }));
  };

  const addMeasurementKey = () => {
    const trimmed = newKeyName.trim().toLowerCase();
    if (!trimmed || measurementKeys.includes(trimmed)) {
      setError('Key name must be unique and not empty');
      return;
    }
    if (trimmed === 'size' || trimmed === 'imageurl') {
      setError('Key name cannot be "size" or "imageUrl"');
      return;
    }
    
    const newKeys = [...measurementKeys, trimmed];
    setMeasurementKeys(newKeys);
    
    // Add the new key to all existing entries
    setFormState(prev => ({
      ...prev,
      entries: prev.entries.map(entry => ({
        ...entry,
        [trimmed]: '',
      })),
    }));
    
    setNewKeyName('');
    setError(null);
  };

  const removeMeasurementKey = (keyToRemove: string) => {
    if (measurementKeys.length <= 1) {
      setError('At least one measurement key is required');
      return;
    }
    
    const newKeys = measurementKeys.filter(k => k !== keyToRemove);
    setMeasurementKeys(newKeys);
    
    // Remove the key from all existing entries
    setFormState(prev => ({
      ...prev,
      entries: prev.entries.map(entry => {
        const newEntry = { ...entry };
        delete newEntry[keyToRemove];
        return newEntry;
      }),
    }));
    
    setError(null);
  };

  const updateMeasurementKey = (oldKey: string, newKey: string) => {
    const trimmed = newKey.trim().toLowerCase();
    if (!trimmed || (trimmed !== oldKey && measurementKeys.includes(trimmed))) {
      setError('Key name must be unique and not empty');
      return;
    }
    if (trimmed === 'size' || trimmed === 'imageurl') {
      setError('Key name cannot be "size" or "imageUrl"');
      return;
    }
    
    const newKeys = measurementKeys.map(k => k === oldKey ? trimmed : k);
    setMeasurementKeys(newKeys);
    
    // Update the key in all existing entries
    setFormState(prev => ({
      ...prev,
      entries: prev.entries.map(entry => {
        const newEntry = { ...entry };
        if (oldKey !== trimmed) {
          newEntry[trimmed] = entry[oldKey] || '';
          delete newEntry[oldKey];
        }
        return newEntry;
      }),
    }));
    
    setEditingKeyIndex(null);
    setError(null);
  };

  const removeEntry = (index: number) => {
    setFormState(prev => ({
      ...prev,
      entries: prev.entries.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formState.name.trim()) {
      setError('Size chart name is required');
      return;
    }

    const normalizedEntries = formState.entries
      .map(entry => ({
        ...entry,
        size: entry.size?.trim() || '',
      }))
      .filter(entry => entry.size);

    if (normalizedEntries.length === 0) {
      setError('Add at least one size entry');
      return;
    }

    const payload = {
      name: formState.name.trim(),
      description: formState.description?.trim() || undefined,
      defaultImageUrl: formState.defaultImageUrl?.trim() || undefined,
      measurementKeys: measurementKeys.length > 0 ? measurementKeys : undefined,
      entries: normalizedEntries,
    };

    setSaving(true);
    setError(null);

    try {
      if (selectedId) {
        await sizeChartsAPI.update(selectedId, payload);
      } else {
        await sizeChartsAPI.create(payload);
      }

      await fetchCharts(search ? { search } : undefined);
      resetForm();
    } catch (err: any) {
      console.error('Failed to save size chart', err);
      setError(err.response?.data?.message || 'Failed to save size chart');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (chart: SizeChart) => {
    if (!confirm(`Delete size chart "${chart.name}"?`)) return;
    setError(null);
    try {
      await sizeChartsAPI.delete(chart._id);
      await fetchCharts(search ? { search } : undefined);
      if (selectedId === chart._id) {
        resetForm();
      }
    } catch (err: any) {
      console.error('Failed to delete size chart', err);
      setError(err.response?.data?.message || 'Failed to delete size chart');
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Size Charts</h1>
          <p className="text-sm text-gray-500">
            Manage reusable size charts and measurements to link with products.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search charts..."
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
          />
          <button
            onClick={() => fetchCharts(search ? { search } : undefined)}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Refresh
          </button>
          <button
            onClick={resetForm}
            className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <FaPlus className="mr-2" />
            New Size Chart
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 border border-red-200 bg-red-50 text-sm text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Existing Charts</h2>
            <span className="text-sm text-gray-500">{filteredCharts.length} total</span>
          </div>
          <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500"></div>
              </div>
            ) : filteredCharts.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                No size charts found.
              </div>
            ) : (
              filteredCharts.map(chart => (
                <div
                  key={chart._id}
                  className={`px-6 py-4 flex items-start justify-between ${
                    selectedId === chart._id ? 'bg-red-50' : ''
                  }`}
                >
                  <div className="flex-1 pr-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{chart.name}</h3>
                      <span className="text-xs text-gray-500">
                        {chart.entries?.length || 0} entries
                      </span>
                    </div>
                    {chart.description && (
                      <p className="text-xs text-gray-600 mt-1">{chart.description}</p>
                    )}
                    {chart.defaultImageUrl && (
                      <a
                        href={chart.defaultImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                      >
                        View default image
                      </a>
                    )}
                    <div className="mt-3 bg-gray-50 border border-gray-200 rounded-md p-3">
                      <table className="w-full text-xs text-gray-600">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left font-medium">Size</th>
                            {(chart.measurementKeys && chart.measurementKeys.length > 0
                              ? chart.measurementKeys
                              : DEFAULT_MEASUREMENT_KEYS
                            ).slice(0, 4).map((key) => (
                              <th key={key} className="text-left font-medium capitalize">
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(chart.entries || []).slice(0, 4).map((entry, idx) => {
                            const keys = chart.measurementKeys && chart.measurementKeys.length > 0
                              ? chart.measurementKeys
                              : DEFAULT_MEASUREMENT_KEYS;
                            return (
                              <tr key={idx}>
                                <td className="py-1">{entry.size}</td>
                                {keys.slice(0, 4).map((key) => (
                                  <td key={key}>{entry[key] || '-'}</td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {chart.entries && chart.entries.length > 4 && (
                        <p className="text-[11px] text-gray-400 mt-1">
                          +{chart.entries.length - 4} more entries
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleEdit(chart)}
                      className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(chart)}
                      className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      <FaTrash className="inline mr-1" />
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {selectedId ? 'Edit Size Chart' : 'Create Size Chart'}
            </h2>
            {selectedId && (
              <button
                onClick={resetForm}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
              >
                <FaUndo className="mr-1" /> Reset
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formState.name}
                onChange={e => setFormState({ ...formState, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="e.g., Men - T-Shirts"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                rows={3}
                value={formState.description}
                onChange={e => setFormState({ ...formState, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500"
                placeholder="Optional description"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Image URL
              </label>
              <input
                type="text"
                value={formState.defaultImageUrl}
                onChange={e => setFormState({ ...formState, defaultImageUrl: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="https://example.com/size-chart.png"
              />
            </div>

            <div className="border border-gray-200 rounded-lg">
              <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">Measurement Keys</h3>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={e => setNewKeyName(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addMeasurementKey())}
                    placeholder="Add key (e.g., ankles)"
                    className="px-2 py-1 text-xs border border-gray-300 rounded-md focus:ring-1 focus:ring-red-500"
                  />
                  <button
                    type="button"
                    onClick={addMeasurementKey}
                    className="flex items-center px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    <FaPlus size={10} />
                  </button>
                </div>
              </div>
              <div className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  {measurementKeys.map((key, idx) => (
                    <div
                      key={key}
                      className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-md text-xs"
                    >
                      {editingKeyIndex === idx ? (
                        <>
                          <input
                            type="text"
                            value={newKeyName}
                            onChange={e => setNewKeyName(e.target.value)}
                            onKeyPress={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                updateMeasurementKey(key, newKeyName);
                              } else if (e.key === 'Escape') {
                                setEditingKeyIndex(null);
                                setNewKeyName('');
                              }
                            }}
                            autoFocus
                            className="w-20 px-1 py-0.5 text-xs border border-gray-300 rounded"
                          />
                          <button
                            type="button"
                            onClick={() => updateMeasurementKey(key, newKeyName)}
                            className="text-green-600 hover:text-green-800"
                          >
                            <FaSave size={10} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingKeyIndex(null);
                              setNewKeyName('');
                            }}
                            className="text-gray-600 hover:text-gray-800"
                          >
                            <FaUndo size={10} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="font-medium capitalize">{key}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingKeyIndex(idx);
                              setNewKeyName(key);
                            }}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <FaEdit size={10} />
                          </button>
                          {measurementKeys.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeMeasurementKey(key)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <FaTrash size={10} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Customize measurement keys for this size chart (e.g., ankles, inseam for pants)
                </p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg">
              <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">Size Entries</h3>
                <button
                  type="button"
                  onClick={addEntry}
                  className="flex items-center text-xs text-blue-600 hover:text-blue-800"
                >
                  <FaPlus className="mr-1" size={10} />
                  Add Entry
                </button>
              </div>

              <div className="max-h-[320px] overflow-y-auto divide-y divide-gray-200">
                {formState.entries.map((entry, index) => (
                  <div key={index} className="px-4 py-3 space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-semibold text-gray-500">
                        Entry {index + 1}
                      </span>
                      {formState.entries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEntry(index)}
                          className="text-xs text-red-600 hover:text-red-800 flex items-center"
                        >
                          <FaTrash className="mr-1" size={10} />
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-700 mb-1">
                          Size <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={entry.size}
                          onChange={e => handleEntryChange(index, 'size', e.target.value)}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                          placeholder="S, M, L..."
                          required
                        />
                      </div>
                      {measurementKeys.map((key) => (
                        <div key={key}>
                          <label className="block text-[11px] font-medium text-gray-700 mb-1 capitalize">
                            {key}
                          </label>
                          <input
                            type="text"
                            value={entry[key] || ''}
                            onChange={e => handleEntryChange(index, key, e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                            placeholder={`e.g., 38 in`}
                          />
                        </div>
                      ))}
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-gray-700 mb-1">
                        Image URL (Optional)
                      </label>
                      <input
                        type="text"
                        value={entry.imageUrl || ''}
                        onChange={e => handleEntryChange(index, 'imageUrl', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                        placeholder="Image URL for this size"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-gray-200 flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-60"
              >
                <FaSave className="mr-2" />
                {saving ? 'Saving...' : selectedId ? 'Update Size Chart' : 'Create Size Chart'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                <FaUndo className="mr-2" />
                Clear
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SizeCharts;


