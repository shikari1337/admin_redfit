import React, { useState } from 'react';
import { FaSearchDollar } from 'react-icons/fa';
import Modal from './Modal';
import { paymentsAPI } from '../../services/api';

interface RecoverPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRecovered: () => void;
}

/**
 * Recovers a payment Razorpay shows as captured but that never turned into
 * an order — the customer's browser closed/dropped after paying, so the
 * usual redirect-callback verify never ran, and (until it's registered on
 * the Razorpay Dashboard) the webhook safety net hasn't either. The payment
 * is sitting in `cart_checkout_attempts`, invisible to every order-scoped
 * screen, so this is reached from the Orders list rather than an order page.
 */
const RecoverPaymentModal: React.FC<RecoverPaymentModalProps> = ({ isOpen, onClose, onRecovered }) => {
  const [identifier, setIdentifier] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const reset = () => {
    setIdentifier(''); setTransactionId(''); setNotes(''); setError(null); setResult(null);
  };
  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!identifier.trim() || !transactionId.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await paymentsAPI.markPaid(identifier.trim(), transactionId.trim(), notes.trim() || undefined);
      setResult(`${res.message} — order ${res.data?.orderId ?? res.data?.order_id ?? ''}`);
      onRecovered();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not recover this payment.');
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <>
      <button type="button" onClick={handleClose}
        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition-colors">
        {result ? 'Close' : 'Cancel'}
      </button>
      {!result && (
        <button type="button" onClick={handleSubmit} disabled={loading || !identifier.trim() || !transactionId.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          <FaSearchDollar size={14} />
          {loading ? 'Verifying…' : 'Verify & Recover'}
        </button>
      )}
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Recover Stuck Payment" footer={footer} maxWidth="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          For a payment Razorpay shows as paid that never turned into an order (the customer's
          browser dropped before the confirmation redirect finished). This verifies the payment
          against Razorpay directly and creates the order — it will not touch an order that
          already exists and is already paid.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Order / Razorpay order ID *</label>
          <input
            type="text"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            placeholder="order_xxxxxxxxxxxxx, or the order number/id"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Paste the Razorpay order id straight from the Razorpay Dashboard, or an order number if one exists.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Razorpay Payment ID (transaction ID) *</label>
          <input
            type="text"
            value={transactionId}
            onChange={e => setTransactionId(e.target.value)}
            placeholder="pay_xxxxxxxxxxxxx"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Why this needed manual recovery…"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">{error}</div>}
        {result && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md p-3">{result}</div>}
      </div>
    </Modal>
  );
};

export default RecoverPaymentModal;
