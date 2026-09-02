import React, { useState } from 'react';
import { FaPaperPlane } from 'react-icons/fa';
import { formatDate } from '../../utils/date';

interface NoteEntry {
  text: string;
  created_at?: string | Date;
  createdAt?: string | Date;
  author_email?: string;
  authorEmail?: string;
}

interface OrderNotesProps {
  notes: NoteEntry[];
  onAdd: (text: string) => Promise<void> | void;
  saving: boolean;
}

const OrderNotes: React.FC<OrderNotesProps> = ({ notes, onAdd, saving }) => {
  const [draft, setDraft] = useState('');

  const handleAdd = async () => {
    if (!draft.trim()) return;
    await onAdd(draft.trim());
    setDraft('');
  };

  const sorted = [...(notes || [])].sort((a, b) => {
    const da = new Date(a.created_at ?? a.createdAt ?? 0).getTime();
    const db = new Date(b.created_at ?? b.createdAt ?? 0).getTime();
    return db - da;
  });

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-base font-bold mb-2.5">Order Notes</h2>

      <div className="flex gap-2 mb-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd(); }}
          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[44px] text-sm"
          placeholder="Add an internal note… (⌘/Ctrl + Enter to send)"
        />
        <button
          onClick={handleAdd}
          disabled={saving || !draft.trim()}
          className="flex items-center gap-2 px-3 h-fit py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 text-sm"
        >
          <FaPaperPlane size={12} />
          {saving ? 'Saving…' : 'Add'}
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500">No notes yet.</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {sorted.map((n, i) => (
            <div key={i} className="border-l-2 border-gray-200 pl-3 py-0.5">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{n.text}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {n.author_email || n.authorEmail || 'System'} · {formatDate(n.created_at ?? n.createdAt, 'MMM dd, yyyy HH:mm', '')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OrderNotes;
