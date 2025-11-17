import React from 'react';

interface GstInfo {
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxType: 'CGST+SGST' | 'IGST';
  storeName?: string;
  storeGstin?: string;
  storeState?: string;
  orderState?: string;
}

interface OrderSummaryProps {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  gst?: GstInfo;
}

const OrderSummary: React.FC<OrderSummaryProps> = ({
  subtotal,
  shipping,
  discount,
  total,
  gst,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>₹{subtotal?.toLocaleString('en-IN')}</span>
      </div>
      {shipping > 0 && (
        <div className="flex justify-between">
          <span>Shipping</span>
          <span>₹{shipping?.toLocaleString('en-IN')}</span>
        </div>
      )}
      {discount > 0 && (
        <div className="flex justify-between text-green-600">
          <span>Discount</span>
          <span>-₹{discount?.toLocaleString('en-IN')}</span>
        </div>
      )}
      {gst && (
        <>
          {gst.taxType === 'CGST+SGST' ? (
            <>
              <div className="flex justify-between">
                <span>CGST ({gst.gstRate / 2}%)</span>
                <span>₹{gst.cgst?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span>SGST ({gst.gstRate / 2}%)</span>
                <span>₹{gst.sgst?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span>IGST ({gst.gstRate}%)</span>
              <span>₹{gst.igst?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="text-xs text-gray-500 pt-1 border-t">
            <div>GST Type: {gst.taxType}</div>
            {gst.storeName && <div>GST Store: {gst.storeName}</div>}
            {gst.storeGstin && <div>GSTIN: {gst.storeGstin}</div>}
            {gst.storeState && gst.orderState && (
              <div>
                Store State: {gst.storeState} | Order State: {gst.orderState}
              </div>
            )}
          </div>
        </>
      )}
      <div className="flex justify-between font-bold text-lg pt-2 border-t">
        <span>Total</span>
        <span>₹{total?.toLocaleString('en-IN')}</span>
      </div>
    </div>
  );
};

export default OrderSummary;

