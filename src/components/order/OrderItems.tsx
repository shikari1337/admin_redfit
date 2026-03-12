import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
    <Card className="shadow-sm">
      <CardHeader className="pb-3 border-b">
        <CardTitle className="text-xl">Order Items</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-6">
          {items?.map((item, index) => (
            <div key={index} className="flex items-start sm:items-center space-x-4 border-b last:border-0 pb-6 last:pb-0">
              {item.image ? (
                <div className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 bg-muted rounded-md overflow-hidden border">
                  <img
                    src={item.image}
                    alt={item.productName}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 bg-muted rounded-md border flex items-center justify-center">
                  <span className="text-muted-foreground text-xs">No Image</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground line-clamp-2">{item.productName}</h3>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>Size: <span className="font-medium text-foreground">{item.size}</span></span>
                  <span>Qty: <span className="font-medium text-foreground">{item.quantity}</span></span>
                  {item.variant && (
                    <span>Color: <span className="font-medium text-foreground">{item.variant.colorName}</span></span>
                  )}
                </div>
                {item.bundleApplied && (
                  <Badge variant="secondary" className="mt-2 text-blue-700 bg-blue-100/50 border-blue-200">
                    Bundle: {item.bundleApplied.title}
                  </Badge>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-foreground">₹{(item.price * item.quantity).toLocaleString('en-IN')}</p>
                {item.originalPrice && item.originalPrice > item.price && (
                  <p className="text-sm text-muted-foreground line-through decoration-muted-foreground/50">
                    ₹{(item.originalPrice * item.quantity).toLocaleString('en-IN')}
                  </p>
                )}
                {item.originalPrice && item.originalPrice > item.price && (
                  <p className="text-xs text-green-600 font-medium mt-1">
                    Saving: ₹{((item.originalPrice - item.price) * item.quantity).toLocaleString('en-IN')}
                  </p>
                )}
              </div>
            </div>
          ))}
          {(!items || items.length === 0) && (
            <div className="text-center py-6 text-muted-foreground">
              No items in this order.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default OrderItems;
