import React from 'react';
import { FaCreditCard, FaImage, FaCheckCircle, FaClock, FaTimesCircle, FaMoneyCheckAlt } from 'react-icons/fa';
import StatusBadge from './StatusBadge';
import { formatDate } from '../../utils/date';

interface PaymentInformationProps {
  paymentMethod: 'cod' | 'prepaid';
  paymentStatus: string;
  paymentGateway?: 'razorpay' | 'upi' | 'manual';
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  upiPaymentId?: string;
  upiPaymentLink?: string;
  upiVerificationStatus?: string;
  upiPaymentScreenshot?: string;
  upiVerificationNotes?: string;
  /** Set once staff use "Mark as Paid" for a payment settled outside any
   *  gateway (bank transfer, cash, cheque) — migration 137. Independent of
   *  `paymentGateway`: an order whose customer attempted Razorpay can still
   *  end up marked paid manually, so this renders whenever present rather
   *  than only when paymentGateway === 'manual'. */
  manualPaymentMethod?: string;
  manualPaymentReference?: string;
  manualPaymentNotes?: string;
  manualPaymentMarkedBy?: string;
  manualPaymentMarkedAt?: string;
}

const MANUAL_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer / NEFT / IMPS',
  upi: 'UPI (outside the store link)',
  cash: 'Cash',
  cheque: 'Cheque',
  other: 'Other',
};

const PaymentInformation: React.FC<PaymentInformationProps> = ({
  paymentMethod,
  paymentStatus,
  paymentGateway,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  upiPaymentId,
  upiPaymentLink,
  upiVerificationStatus,
  upiPaymentScreenshot,
  upiVerificationNotes,
  manualPaymentMethod,
  manualPaymentReference,
  manualPaymentNotes,
  manualPaymentMarkedBy,
  manualPaymentMarkedAt,
}) => {
  const hasManualPaymentDetails = !!(manualPaymentMethod || manualPaymentReference || manualPaymentNotes || manualPaymentMarkedAt);
  const getVerificationStatusIcon = (status?: string) => {
    switch (status) {
      case 'verified':
        return <FaCheckCircle className="text-green-500" size={16} />;
      case 'pending':
        return <FaClock className="text-yellow-500" size={16} />;
      case 'rejected':
        return <FaTimesCircle className="text-red-500" size={16} />;
      default:
        return <FaClock className="text-gray-400" size={16} />;
    }
  };

  const getVerificationStatusText = (status?: string) => {
    switch (status) {
      case 'verified':
        return 'Verified';
      case 'pending':
        return 'Pending Verification';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Pending Verification';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <FaCreditCard />
        Payment Information
      </h2>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Payment Method</p>
            <p className="font-medium">
              {paymentMethod === 'cod' ? 'Cash on Delivery (COD)' : 'Prepaid'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Payment Status</p>
            <StatusBadge status={paymentStatus} type="payment" />
          </div>
        </div>

        {paymentGateway && (
          <div className="border-t pt-4">
            <p className="text-sm text-gray-500 mb-2">Payment Gateway</p>
            <p className="font-semibold text-lg mb-4">
              {paymentGateway === 'razorpay' ? 'Razorpay' : paymentGateway === 'upi' ? 'UPI' : 'Manual'}
            </p>

            {paymentGateway === 'razorpay' && (
              <div className="space-y-3 bg-blue-50 p-4 rounded">
                <div>
                  <p className="text-sm text-gray-600">Razorpay Order ID</p>
                  <p className="font-mono text-sm">{razorpayOrderId || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Razorpay Payment ID</p>
                  <p className="font-mono text-sm">{razorpayPaymentId || 'N/A'}</p>
                </div>
                {razorpaySignature && (
                  <div>
                    <p className="text-sm text-gray-600">Payment Signature</p>
                    <p className="font-mono text-xs break-all">{razorpaySignature}</p>
                  </div>
                )}
              </div>
            )}

            {paymentGateway === 'upi' && (
              <div className="space-y-3 bg-purple-50 p-4 rounded">
                <div>
                  <p className="text-sm text-gray-600">UPI Transaction ID</p>
                  <p className="font-mono text-sm">{upiPaymentId || 'Not provided'}</p>
                </div>
                {upiPaymentLink && (
                  <div>
                    <p className="text-sm text-gray-600">UPI Payment Link</p>
                    <a
                      href={upiPaymentLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm break-all"
                    >
                      {upiPaymentLink}
                    </a>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-600 mb-2">Verification Status</p>
                  <div className="flex items-center gap-2">
                    {getVerificationStatusIcon(upiVerificationStatus)}
                    <span className="font-medium">{getVerificationStatusText(upiVerificationStatus)}</span>
                  </div>
                </div>
                {upiPaymentScreenshot && (
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Payment Screenshot</p>
                    <a
                      href={upiPaymentScreenshot}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-600 hover:underline"
                    >
                      <FaImage />
                      View Screenshot
                    </a>
                    <div className="mt-2">
                      <img
                        src={upiPaymentScreenshot}
                        alt="Payment screenshot"
                        className="max-w-xs rounded border border-gray-300"
                      />
                    </div>
                  </div>
                )}
                {upiVerificationNotes && (
                  <div>
                    <p className="text-sm text-gray-600">Verification Notes</p>
                    <p className="text-sm text-gray-700 bg-white p-2 rounded border">
                      {upiVerificationNotes}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Independent of paymentGateway — an order whose customer attempted
            Razorpay/UPI can still be marked paid manually afterward, so this
            shows whenever the record exists rather than only when
            paymentGateway === 'manual'. */}
        {hasManualPaymentDetails && (
          <div className="border-t pt-4">
            <p className="text-sm text-gray-500 mb-2 flex items-center gap-2">
              <FaMoneyCheckAlt className="text-emerald-600" />
              Marked Paid Manually
            </p>
            <div className="space-y-3 bg-emerald-50 p-4 rounded">
              <div>
                <p className="text-sm text-gray-600">How it was paid</p>
                <p className="font-medium text-sm">
                  {manualPaymentMethod ? (MANUAL_METHOD_LABELS[manualPaymentMethod] ?? manualPaymentMethod) : 'Not specified'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Transaction / Reference ID</p>
                <p className="font-mono text-sm">{manualPaymentReference || 'Not provided'}</p>
              </div>
              {manualPaymentNotes && (
                <div>
                  <p className="text-sm text-gray-600">Description</p>
                  <p className="text-sm text-gray-700 bg-white p-2 rounded border">{manualPaymentNotes}</p>
                </div>
              )}
              {(manualPaymentMarkedBy || manualPaymentMarkedAt) && (
                <div>
                  <p className="text-sm text-gray-600">Marked paid by</p>
                  <p className="text-sm">
                    {manualPaymentMarkedBy || 'Staff'}
                    {manualPaymentMarkedAt && ` — ${formatDate(manualPaymentMarkedAt)}`}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentInformation;

