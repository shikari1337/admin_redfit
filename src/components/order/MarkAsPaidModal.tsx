import React, { useState, useEffect } from 'react';
import { FaMoneyCheckAlt } from 'react-icons/fa';
import Modal from './Modal';
import { paymentsAPI } from '../../services/api';

interface MarkAsPaidModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  total: number;
  onMarked: () => void;
}

const METHODS: Array<{ value: string; label: string }> = [
  { value: 'bank_transfer', label: 'Bank Transfer / NEFT / IMPS' },
  { value: 'upi', label: 'UPI (paid outside the store link)' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];

/**
 * Mark a prepaid order paid when the money settled OUTSIDE anything this
 * system can verify against — a direct bank transfer to the store's own
 * account, cash, a cheque. The regular "Verify Payment" button assumes a
 * REAL Razorpay/UPI transaction id exists to check; this one doesn't try —
 * `orders.manage` staff asserting it happened IS the record, same as the
 * existing COD "Record Payment" flow does for cash-on-delivery orders.
 * Backend: POST /payments/manual/verify (services/paymentCompletion-adjacent
 * route in routes/payments.ts) — decrements stock, posts GL, and appends a
 * signed note (who marked it, with what reference) to the order's audit trail.
 */
const MarkAsPaidModal: React.FC<MarkAsPaidModalProps> = ({
  isOpen, onClose, orderId, total, onMarked,
}) => {
  const [method, setMethod] = useState('bank_transfer');
  const [transactionId, setTransactionId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMethod('bank_transfer'); setTransactionId(''); setNotes(''); setError(null);
    }
  }, [isOpen, orderId]);

  const handleClose = () => { if (!loading) onClose(); };

  const isValid = notes.trim().length > 0 || transactionId.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid) { setError('Add a reference or a short description of how this was paid.'); return; }
    setLoading(true); setError(null);
    try {
      await paymentsAPI.verifyManual(orderId, notes.trim() || undefined, transactionId.trim() || undefined, method);
      onMarked();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not mark this order paid.');
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
        <FaMoneyCheckAlt size={14} />
        {loading ? 'Marking as paid…' : 'Mark as Paid'}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Mark as Paid" footer={footer} maxWidth="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Use this when the customer paid you directly — a bank transfer, UPI outside the store's
          own link, cash, or a cheque — instead of through the payment gateway. There is nothing
          to verify automatically here; entering this records that <b>you</b> confirmed the money
          arrived. Order total: <b>₹{Number(total || 0).toFixed(2)}</b>.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">How was it paid? *</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500">
            {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Transaction / Reference ID <span className="text-gray-400 font-normal">(bank UTR, UPI ref, cheque no. — optional)</span>
          </label>
          <input type="text" value={transactionId} onChange={(e) => setTransactionId(e.target.value)}
            placeholder="e.g. UTR1234567890"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Description *</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            placeholder="e.g. Received via bank transfer, confirmed with customer over call"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500" />
          <p className="text-xs text-gray-500 mt-1">
            A reference ID or a description is required — at least one, ideally both.
          </p>
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">{error}</div>}
      </div>
    </Modal>
  );
};

export default MarkAsPaidModal;
