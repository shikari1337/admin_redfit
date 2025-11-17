import React from 'react';
import { FaWhatsapp, FaWarehouse } from 'react-icons/fa';

interface Address {
  fullName: string;
  address: string;
  addressLine2?: string;
  district?: string;
  state?: string;
  pincode: string;
  mobileNumber: string;
  email?: string;
}

interface Warehouse {
  _id: string;
  name: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
  };
  gstin?: string;
}

interface GstInfo {
  storeId?: string;
  storeName?: string;
  storeGstin?: string;
  storeState?: string;
}

interface ShippingInformationProps {
  shippingAddress: Address;
  warehouseId?: Warehouse | string;
  gst?: GstInfo;
  onWhatsAppClick: (phoneNumber: string) => void;
}

const ShippingInformation: React.FC<ShippingInformationProps> = ({
  shippingAddress,
  warehouseId,
  gst,
  onWhatsAppClick,
}) => {
  const warehouse = typeof warehouseId === 'object' ? warehouseId : null;

  return (
    <>
      {/* Shipping Address */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Shipping Address</h2>
        <div className="space-y-2 text-gray-700">
          <p className="font-medium">{shippingAddress.fullName}</p>
          <p>{shippingAddress.address}</p>
          {shippingAddress.addressLine2 && (
            <p>{shippingAddress.addressLine2}</p>
          )}
          <p>
            {shippingAddress.district}, {shippingAddress.state} {shippingAddress.pincode}
          </p>
          <div className="flex items-center gap-2">
            <span>Phone:</span>
            <button
              onClick={() => onWhatsAppClick(shippingAddress.mobileNumber)}
              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
              title="Open WhatsApp"
            >
              <FaWhatsapp size={16} />
              {shippingAddress.mobileNumber}
            </button>
          </div>
          {shippingAddress.email && (
            <p>
              <span>Email:</span> {shippingAddress.email}
            </p>
          )}
        </div>
      </div>

      {/* Warehouse Information */}
      {(warehouse || gst?.storeId) && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <FaWarehouse />
            Warehouse / Invoice Information
          </h2>
          <div className="space-y-3">
            {warehouse && (
              <div>
                <p className="text-sm text-gray-500">Warehouse (Fulfillment)</p>
                <p className="font-medium">{warehouse.name || 'N/A'}</p>
                {warehouse.address && (
                  <div className="text-sm text-gray-600 mt-1">
                    <p>{warehouse.address.line1}</p>
                    {warehouse.address.line2 && (
                      <p>{warehouse.address.line2}</p>
                    )}
                    <p>
                      {warehouse.address.city}, {warehouse.address.state} - {warehouse.address.pincode}
                    </p>
                    {warehouse.gstin && (
                      <p className="mt-1 font-semibold">GSTIN: {warehouse.gstin}</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {gst && gst.storeId && (
              <div className="border-t pt-3">
                <p className="text-sm text-gray-500">GST Store (Invoice)</p>
                <p className="font-medium">{gst.storeName || 'N/A'}</p>
                {gst.storeGstin && (
                  <p className="text-sm text-gray-600 mt-1">GSTIN: {gst.storeGstin}</p>
                )}
                {gst.storeState && (
                  <p className="text-sm text-gray-600">State: {gst.storeState}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ShippingInformation;

