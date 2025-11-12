import React from 'react';
import { FaPlus, FaTrash } from 'react-icons/fa';
import { SizeChartEntry, SizeChartOption, emptySizeChartEntry } from '../../types/productForm';

interface ProductSizeChartProps {
  mode: 'none' | 'reference' | 'custom';
  selectedSizeChartId: string;
  sizeChart: SizeChartEntry[];
  availableSizeCharts: SizeChartOption[];
  selectedSizeChart?: SizeChartOption;
  onModeChange: (mode: 'none' | 'reference' | 'custom') => void;
  onSelectedSizeChartIdChange: (id: string) => void;
  onSizeChartChange: (entries: SizeChartEntry[]) => void;
  onRefresh: () => void;
  loading: boolean;
  error?: string;
}

const ProductSizeChart: React.FC<ProductSizeChartProps> = ({
  mode,
  selectedSizeChartId,
  sizeChart,
  availableSizeCharts,
  selectedSizeChart,
  onModeChange,
  onSelectedSizeChartIdChange,
  onSizeChartChange,
  onRefresh,
  loading,
  error,
}) => {
  const addEntry = () => {
    onSizeChartChange([...sizeChart, { ...emptySizeChartEntry }]);
  };

  const removeEntry = (index: number) => {
    const newEntries = sizeChart.filter((_, i) => i !== index);
    onSizeChartChange(newEntries.length > 0 ? newEntries : [{ ...emptySizeChartEntry }]);
  };

  const updateEntry = (index: number, field: string, value: string) => {
    const newEntries = [...sizeChart];
    newEntries[index] = { ...newEntries[index], [field]: value };
    onSizeChartChange(newEntries);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Size Chart</h2>
        <button
          type="button"
          onClick={onRefresh}
          className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Size Chart Mode</label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="sizeChartMode"
                value="none"
                checked={mode === 'none'}
                onChange={() => onModeChange('none')}
                className="mr-2 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm text-gray-700">None</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="sizeChartMode"
                value="reference"
                checked={mode === 'reference'}
                onChange={() => onModeChange('reference')}
                className="mr-2 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm text-gray-700">Reference (Reusable)</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="sizeChartMode"
                value="custom"
                checked={mode === 'custom'}
                onChange={() => onModeChange('custom')}
                className="mr-2 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm text-gray-700">Custom</span>
            </label>
          </div>
        </div>

        {mode === 'reference' && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Select size chart <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedSizeChartId}
                onChange={(e) => onSelectedSizeChartIdChange(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                <option value="">Choose size chart…</option>
                {availableSizeCharts.map((chart, index) => (
                  <option key={`chart-${chart._id}-${index}`} value={chart._id}>
                    {chart.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedSizeChart ? (
              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <p className="text-xs text-gray-500 mb-2">
                  Previewing {selectedSizeChart.entries?.length || 0} entries
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs text-gray-600">
                    <thead className="text-gray-500">
                      <tr>
                        <th className="text-left font-medium pr-3 py-1">Size</th>
                        <th className="text-left font-medium pr-3 py-1">Chest</th>
                        <th className="text-left font-medium pr-3 py-1">Waist</th>
                        <th className="text-left font-medium pr-3 py-1">Length</th>
                        <th className="text-left font-medium pr-3 py-1 hidden md:table-cell">Shoulder</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedSizeChart.entries || []).slice(0, 6).map((entry, idx) => (
                        <tr key={`${selectedSizeChart._id}-${idx}`}>
                          <td className="pr-3 py-1">{entry.size || '-'}</td>
                          <td className="pr-3 py-1">{entry.chest || '-'}</td>
                          <td className="pr-3 py-1">{entry.waist || '-'}</td>
                          <td className="pr-3 py-1">{entry.length || '-'}</td>
                          <td className="pr-3 py-1 hidden md:table-cell">{entry.shoulder || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {selectedSizeChart.entries && selectedSizeChart.entries.length > 6 && (
                  <p className="text-[11px] text-gray-400 mt-2">
                    +{selectedSizeChart.entries.length - 6} more entries
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                {availableSizeCharts.length === 0
                  ? 'No reusable size charts created yet.'
                  : 'Select a size chart to preview its measurements.'}
              </p>
            )}
          </div>
        )}

        {mode === 'custom' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-600">
                Define custom measurements or import entries from an existing chart.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {availableSizeCharts.length > 0 && (
                  <select
                    value={selectedSizeChartId}
                    onChange={(e) => onSelectedSizeChartIdChange(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  >
                    <option value="">Import from existing chart…</option>
                    {availableSizeCharts.map((chart, index) => (
                      <option key={`chart-${chart._id}-${index}`} value={chart._id}>
                        {chart.name}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={addEntry}
                  className="flex items-center px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                >
                  <FaPlus className="mr-1" size={12} />
                  Add Entry
                </button>
              </div>
            </div>

            {sizeChart.length === 0 ? (
              <p className="text-sm text-gray-500">
                No size chart entries yet. Use "Add Entry" or import from an existing chart.
              </p>
            ) : (
              <div className="space-y-4">
                {sizeChart.map((entry, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="text-sm font-medium text-gray-700">Entry {index + 1}</h3>
                      <button
                        type="button"
                        onClick={() => removeEntry(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <FaTrash size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Size <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                          placeholder="S, M, L, XL"
                          value={entry.size}
                          onChange={(e) => updateEntry(index, 'size', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Chest</label>
                        <input
                          type="text"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                          placeholder="e.g., 38 inches"
                          value={entry.chest || ''}
                          onChange={(e) => updateEntry(index, 'chest', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Waist</label>
                        <input
                          type="text"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                          placeholder="e.g., 32 inches"
                          value={entry.waist || ''}
                          onChange={(e) => updateEntry(index, 'waist', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Length</label>
                        <input
                          type="text"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                          placeholder="e.g., 28 inches"
                          value={entry.length || ''}
                          onChange={(e) => updateEntry(index, 'length', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Shoulder</label>
                        <input
                          type="text"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                          placeholder="e.g., 16 inches"
                          value={entry.shoulder || ''}
                          onChange={(e) => updateEntry(index, 'shoulder', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Sleeve</label>
                        <input
                          type="text"
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                          placeholder="e.g., 24 inches"
                          value={entry.sleeve || ''}
                          onChange={(e) => updateEntry(index, 'sleeve', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Size Chart Image URL (Optional)
                      </label>
                      <input
                        type="text"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                        placeholder="https://example.com/size-chart.png"
                        value={entry.imageUrl || ''}
                        onChange={(e) => updateEntry(index, 'imageUrl', e.target.value)}
                      />
                      <p className="mt-1 text-xs text-gray-500">Optional image for this size row.</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === 'none' && (
          <p className="text-sm text-gray-500">This product will not display any size chart.</p>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
};

export default ProductSizeChart;

