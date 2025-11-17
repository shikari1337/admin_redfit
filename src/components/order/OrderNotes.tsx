import React from 'react';
import { FaEdit, FaSave } from 'react-icons/fa';

interface OrderNotesProps {
  notes: string;
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onChange: (value: string) => void;
  saving: boolean;
}

const OrderNotes: React.FC<OrderNotesProps> = ({
  notes,
  editing,
  onEdit,
  onSave,
  onCancel,
  onChange,
  saving,
}) => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Order Notes</h2>
        {!editing ? (
          <button
            onClick={onEdit}
            className="text-blue-600 hover:text-blue-800"
            title="Edit notes"
          >
            <FaEdit size={16} />
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onSave}
              disabled={saving}
              className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              <FaSave size={14} />
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={onCancel}
              className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <textarea
          value={notes}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[100px]"
          placeholder="Add order notes..."
        />
      ) : (
        <p className="text-gray-700 whitespace-pre-wrap">
          {notes || 'No notes available'}
        </p>
      )}
    </div>
  );
};

export default OrderNotes;

