import React from 'react';
import { FaCreditCard } from 'react-icons/fa';
import Modal from './Modal';

interface PaymentVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
  paymentGateway: 'razorpay' | 'upi' | 'manual' | undefined;
  razorpayPaymentId: string;
  upiPaymentId: string;
  paymentVerificationNotes: string;
  upiPaymentScreenshot?: string;
  onRazorpayPaymentIdChange: (value: string) => void;
  onUpiPaymentIdChange: (value: string) => void;
  onPaymentVerificationNotesChange: (value: string) => void;
}

const PaymentVerificationModal: React.FC<PaymentVerificationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  loading,
  paymentGateway,
  razorpayPaymentId,
  upiPaymentId,
  paymentVerificationNotes,
  upiPaymentScreenshot,
  onRazorpayPaymentIdChange,
  onUpiPaymentIdChange,
  onPaymentVerificationNotesChange,
}) => {
  const handleClose = () => {
    onRazorpayPaymentIdChange('');
    onUpiPaymentIdChange('');
    onPaymentVerificationNotesChange('');
    onClose();
  };

  const isSubmitDisabled =
    loading ||
    (paymentGateway === 'razorpay' && !razorpayPaymentId) ||
    (paymentGateway === 'upi' && !upiPaymentId) ||
    (paymentGateway === 'manual' && !paymentVerificationNotes);

  const footer = (
    <>
      <button
        type="button"
        onClick={handleClose}
        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitDisabled}
        className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <FaCreditCard size={14} />
        {loading ? 'Verifying...' : 'Verify Payment'}
      </button>
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Verify Payment" footer={footer} maxWidth="md">
      <div className="space-y-4">
        {paymentGateway === 'razorpay' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Razorpay Payment ID (Transaction ID) *
            </label>
            <input
              type="text"
              value={razorpayPaymentId}
              onChange={(e) => onRazorpayPaymentIdChange(e.target.value)}
              placeholder="pay_xxxxxxxxxxxxx"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              System will verify with Razorpay API and check amount, order ID, and status.
            </p>
          </div>
        )}

        {paymentGateway === 'upi' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                UPI Transaction ID *
              </label>
              <input
                type="text"
                value={upiPaymentId}
                onChange={(e) => onUpiPaymentIdChange(e.target.value)}
                placeholder="UPI Transaction ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter the UPI transaction ID from the payment screenshot or receipt.
              </p>
            </div>
            {upiPaymentScreenshot && (
              <div>
                <p className="text-sm text-gray-700 mb-2">Payment Screenshot:</p>
                <img
                  src={upiPaymentScreenshot}
                  alt="Payment screenshot"
                  className="max-w-full rounded border border-gray-300"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Verification Notes (Optional)
              </label>
              <textarea
                value={paymentVerificationNotes}
                onChange={(e) => onPaymentVerificationNotesChange(e.target.value)}
                placeholder="Add any verification notes..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </>
        )}

        {paymentGateway === 'manual' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Verification Notes *
            </label>
            <textarea
              value={paymentVerificationNotes}
              onChange={(e) => onPaymentVerificationNotesChange(e.target.value)}
              placeholder="Enter payment verification details (e.g., Bank transfer reference, Cash received, etc.)"
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
              required
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default PaymentVerificationModal;

