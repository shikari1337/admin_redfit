import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Phone, 
  CreditCard, 
  ArrowLeft, 
  MessageSquare, 
  Settings as SettingsIcon, 
  Users, 
  Palette,
  ChevronRight
} from 'lucide-react';

const Settings: React.FC = () => {
  const navigate = useNavigate();

  const settingsItems = [
    {
      title: 'Staff & Permissions',
      description: 'Manage staff members and module access (Page Editor, Leads)',
      icon: Users,
      path: '/settings/staff',
    },
    {
      title: 'Appearance',
      description: 'Colors, fonts, logos, menus, pages – customize your storefront look',
      icon: Palette,
      path: '/appearance/style',
    },
    {
      title: 'API & Integrations',
      description: 'Configure SMTP, Meta Pixel, Razorpay, and WhatsApp',
      icon: SettingsIcon,
      path: '/settings/api-integrations',
    },
    {
      title: 'Shipping Settings',
      description: 'Configure shipping providers (Shiprocket, DELHIVERY) and manage warehouses',
      icon: SettingsIcon,
      path: '/settings/shipping',
    },
    {
      title: 'Contact Details',
      description: 'Manage phone number, WhatsApp, and email for contact page',
      icon: Phone,
      path: '/settings/contact',
    },
    {
      title: 'Payment Gateway Discount',
      description: 'Configure payment gateway based discount percentage',
      icon: CreditCard,
      path: '/settings/payment-discount',
    },
    {
      title: 'Payment Gateways',
      description: 'Configure and enable/disable payment gateways (Razorpay, UPI)',
      icon: CreditCard,
      path: '/settings/payment-gateways',
    },
    {
      title: 'SMS Templates',
      description: 'Configure SMSAlert templates for orders and cart recovery',
      icon: MessageSquare,
      path: '/settings/sms-templates',
    },
    {
      title: 'GST Settings',
      description: 'Configure GST tax brackets and store details',
      icon: SettingsIcon,
      path: '/settings/gst',
    },
    {
      title: 'Warehouses',
      description: 'Manage warehouse locations and shipping provider configurations',
      icon: SettingsIcon,
      path: '/warehouses',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/dashboard')}
          className="text-muted-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-2">Manage application settings and configurations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {settingsItems.map((item) => {
          const Icon = item.icon;
          return (
            <Card 
              key={item.path}
              className="group cursor-pointer hover:border-blue-500 hover:shadow-md transition-all duration-200"
              onClick={() => navigate(item.path)}
            >
              <CardContent className="p-6 flex items-start gap-4 h-full">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                  <Icon className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className="font-semibold text-foreground group-hover:text-blue-600 transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-snug">
                    {item.description}
                  </p>
                </div>
                <div className="flex-shrink-0 h-full flex items-center">
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-blue-500 transition-colors" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Settings;

