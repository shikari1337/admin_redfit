import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Inbox, Layers, Tags, Settings } from 'lucide-react';
import B2BPriceLists from '../components/b2b/B2BPriceLists';
import B2BSettings from '../components/b2b/B2BSettings';
import B2BApplications from '../components/b2b/B2BApplications';
import B2BTiers from '../components/b2b/B2BTiers';

type Tab = 'applications' | 'tiers' | 'price-lists' | 'settings';

/**
 * B2B management.
 *
 * A store's B2B "accounts" are simply its APPROVED CUSTOMERS — the grant lives on
 * public.customer_store_profiles (is_b2b + b2b_tier), which is what the pricing
 * waterfall reads. The old standalone Accounts/Quotes tabs modelled a parallel,
 * unused set of tables and drove no pricing, so they were removed.
 *
 * Per-product and per-account prices are set on the PRODUCT form
 * (components/product/ProductB2BPricing.tsx).
 */
export default function B2B() {
  const [activeTab, setActiveTab] = useState<Tab>('applications');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">B2B Management</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review business applications, and set the wholesale plans your approved customers get.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as Tab)} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="applications" className="gap-2">
            <Inbox className="h-4 w-4" />
            Applications
          </TabsTrigger>
          <TabsTrigger value="tiers" className="gap-2">
            <Layers className="h-4 w-4" />
            Plans &amp; Tiers
          </TabsTrigger>
          <TabsTrigger value="price-lists" className="gap-2">
            <Tags className="h-4 w-4" />
            Price Lists
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="p-6">
            <TabsContent value="applications" className="m-0 border-0 p-0">
              <B2BApplications />
            </TabsContent>

            <TabsContent value="tiers" className="m-0 border-0 p-0">
              <B2BTiers />
            </TabsContent>

            <TabsContent value="price-lists" className="m-0 border-0 p-0">
              <B2BPriceLists />
            </TabsContent>

            <TabsContent value="settings" className="m-0 border-0 p-0 pt-4">
              <B2BSettings />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
