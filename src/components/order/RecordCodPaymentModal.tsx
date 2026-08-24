import React, { useState, useEffect } from 'react';
import { FaMoneyBillWave } from 'react-icons/fa';
import Modal from './Modal';
import { ordersAPI } from '../../services/api';

interface RecordCodPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  total: number;
  amountReceived: number;
  onRecorded: () => void;
}

const METHODS: Array<{ value: 'upi' | 'bank_transfer' | 'cash' | 'other'; label: string }> = [
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

/**
 * For a COD order the customer settled outside the gateway — UPI, a direct
 * bank transfer, cash handed over — before the courier ever collects
 * anything. Amount defaults to the full remaining balance but is editable,
 * since it's often a partial advance rather than the whole order.
 */
const RecordCodPaymentModal: React.FC<RecordCodPaymentModalProps> = ({
  isOpen, onClose, orderId, total, amountReceived, onRecorded,
}) => {
  const remaining = Math.max(0, Number(total || 0) - Number(amountReceived || 0));
  const [amount, setAmount] = useState(String(remaining.toFixed(2)));
  const [method, setMethod] = useState<'upi' | 'bank_transfer' | 'cash' | 'other'>('upi');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAmount(String(remaining.toFixed(2)));
      setMethod('upi'); setReference(''); setNotes(''); setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, orderId]);

  const handleClose = () => { if (!loading) onClose(); };

  const amountNum = parseFloat(amount);
  const isValid = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= remaining + 1;

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true); setError(null);
    try {
      await ordersAPI.recordPayment(orderId, { amount: amountNum, method, reference: reference.trim() || undefined, notes: notes.trim() || undefined });
      onRecorded();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not record this payment.');
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <>
      <button type="button" onClick={handleClose} disabled={loading}
        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50">
        Cancel
      </button>
      <button type="button" onClick={handleSubmit} disabled={loading || !isValid}
        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        <FaMoneyBillWave size={14} />
        {loading ? 'Recording…' : 'Record Payment'}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Record Payment" footer={footer} maxWidth="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          For a COD order the customer already settled directly — UPI, bank transfer, or cash —
          before delivery. Full payment marks the order paid and tells the courier to collect
          nothing; a partial amount reduces what's collected on delivery.
        </p>
        <div className="text-sm bg-gray-50 border border-gray-200 rounded-md p-3 flex justify-between">
          <span className="text-gray-600">Remaining balance</span>
          <span className="font-semibold text-gray-900">₹{remaining.toFixed(2)}</span>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Amount Received *</label>
          <input
            type="number" step="0.01" min="0.01" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          {amountNum > remaining + 1 && (
            <p className="text-xs text-red-600 mt-1">That's more than the ₹{remaining.toFixed(2)} still owed.</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method *</label>
          <select value={method} onChange={(e) => setMethod(e.target.value as any)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500">
            {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Reference (optional)</label>
          <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
            placeholder="UPI transaction ID, bank reference…"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">{error}</div>}
      </div>
    </Modal>
  );
};

export default RecordCodPaymentModal;
