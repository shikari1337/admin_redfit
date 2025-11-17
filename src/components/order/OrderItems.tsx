import React from 'react';

interface OrderItem {
  productName: string;
  size: string;
  quantity: number;
  price: number;
  originalPrice?: number;
  image?: string;
  variant?: {
    colorName: string;
  };
  bundleApplied?: {
    title: string;
  };
}

interface OrderItemsProps {
  items: OrderItem[];
}

const OrderItems: React.FC<OrderItemsProps> = ({ items }) => {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">Order Items</h2>
      <div className="space-y-4">
        {items?.map((item, index) => (
          <div key={index} className="flex items-center space-x-4 border-b pb-4">
            {item.image && (
              <img
                src={item.image}
                alt={item.productName}
                className="w-20 h-20 object-cover rounded"
              />
            )}
            <div className="flex-1">
              <h3 className="font-medium">{item.productName}</h3>
              <p className="text-sm text-gray-500">
                Size: {item.size} | Qty: {item.quantity}
              </p>
              {item.variant && (
                <p className="text-sm text-gray-500">
                  Color: {item.variant.colorName}
                </p>
              )}
              {item.bundleApplied && (
                <p className="text-sm text-blue-600 font-semibold">
                  Bundle: {item.bundleApplied.title}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="font-medium">₹{(item.price * item.quantity).toLocaleString('en-IN')}</p>
              {item.originalPrice && item.originalPrice > item.price && (
                <p className="text-sm text-gray-500 line-through">
                  ₹{(item.originalPrice * item.quantity).toLocaleString('en-IN')}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrderItems;

