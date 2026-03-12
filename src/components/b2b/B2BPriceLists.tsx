import { useState, useEffect } from 'react';
import { b2bAPI, productsAPI, categoriesAPI } from '../../services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Edit, Plus, Trash2, ArrowLeft, Settings2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Interfaces based on backend models
interface B2BPriceList {
  _id: string;
  name: string;
  description?: string;
  currency: string;
  isDefault: boolean;
  createdAt: string;
}

interface B2BPriceRule {
  _id: string;
  priceListId: string;
  ruleType: 'product' | 'variant' | 'category' | 'global';
  entityId?: string;
  pricingSlabs: Array<{ minQty: number; maxQty: number | null; price: number }>;
  discountSlabs: Array<{ minQty: number; discountPct: number }>;
  flatPrice?: number;
  flatDiscountPct?: number;
}

interface B2BMOQRule {
  _id: string;
  priceListId: string;
  ruleType: 'global' | 'category' | 'product';
  entityId?: string;
  minQty: number;
  minOrderValue?: number;
  incrementQty: number;
}

export default function B2BPriceLists() {
  const [lists, setLists] = useState<B2BPriceList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [activeList, setActiveList] = useState<B2BPriceList | null>(null);
  const [rules, setRules] = useState<B2BPriceRule[]>([]);
  const [moqRules, setMoqRules] = useState<B2BMOQRule[]>([]);

  // Modals
  const [showListModal, setShowListModal] = useState(false);
  const [editList, setEditList] = useState<B2BPriceList | null>(null);
  const [listForm, setListForm] = useState({ name: '', description: '', currency: 'INR', isDefault: false });

  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editRule, setEditRule] = useState<B2BPriceRule | null>(null);
  const [ruleForm, setRuleForm] = useState<{
    ruleType: 'product' | 'category' | 'global';
    entityId: string;
    flatPrice: string;
    flatDiscountPct: string;
    pricingSlabs: Array<{ minQty: string; maxQty: string; price: string }>;
  }>({
    ruleType: 'product',
    entityId: '',
    flatPrice: '',
    flatDiscountPct: '',
    pricingSlabs: [],
  });

  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    loadLists();
    loadEntities();
  }, []);

  const loadEntities = async () => {
    try {
      const prods = await productsAPI.getAll();
      setProducts(prods?.data || prods || []);
      const cats = await categoriesAPI.list();
      setCategories(cats?.data || cats || []);
    } catch (e) {
      console.error('Failed to load products/categories', e);
    }
  };

  const loadLists = async () => {
    try {
      setLoading(true);
      const res = await b2bAPI.getPriceLists();
      setLists(res?.data || res || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load price lists');
    } finally {
      setLoading(false);
    }
  };

  const loadListDetails = async (listId: string) => {
    try {
      setLoading(true);
      const pRules = await b2bAPI.getPriceRules(listId);
      const pMoq = await b2bAPI.getMOQRules(listId);
      setRules(pRules?.data || pRules || []);
      setMoqRules(pMoq?.data || pMoq || []);
    } catch (err: any) {
      setError('Failed to load rules for list');
    } finally {
      setLoading(false);
    }
  };

  const openListModal = (list?: B2BPriceList) => {
    if (list) {
      setEditList(list);
      setListForm({ name: list.name, description: list.description || '', currency: list.currency || 'INR', isDefault: list.isDefault || false });
    } else {
      setEditList(null);
      setListForm({ name: '', description: '', currency: 'INR', isDefault: false });
    }
    setShowListModal(true);
  };

  const saveList = async () => {
    try {
      if (!listForm.name) return setError('Name is required');
      if (editList) {
        await b2bAPI.updatePriceList(editList._id, listForm);
        setSuccess('Price list updated');
      } else {
        await b2bAPI.createPriceList(listForm);
        setSuccess('Price list created');
      }
      setShowListModal(false);
      loadLists();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to save');
    }
  };

  const openRuleModal = (rule?: B2BPriceRule) => {
    if (rule) {
      setEditRule(rule);
      setRuleForm({
        ruleType: rule.ruleType as any,
        entityId: rule.entityId || '',
        flatPrice: rule.flatPrice?.toString() || '',
        flatDiscountPct: rule.flatDiscountPct?.toString() || '',
        pricingSlabs: rule.pricingSlabs.map(s => ({
          minQty: s.minQty.toString(),
          maxQty: s.maxQty ? s.maxQty.toString() : '',
          price: s.price.toString()
        }))
      });
    } else {
      setEditRule(null);
      setRuleForm({
        ruleType: 'product',
        entityId: '',
        flatPrice: '',
        flatDiscountPct: '',
        pricingSlabs: [],
      });
    }
    setShowRuleModal(true);
  };

  const saveRule = async () => {
    if (!activeList) return;
    try {
      if (ruleForm.ruleType !== 'global' && !ruleForm.entityId) return setError('Entity selection required');
      
      const payload = {
        ruleType: ruleForm.ruleType,
        entityId: ruleForm.entityId || undefined,
        flatPrice: ruleForm.flatPrice ? Number(ruleForm.flatPrice) : undefined,
        flatDiscountPct: ruleForm.flatDiscountPct ? Number(ruleForm.flatDiscountPct) : undefined,
        pricingSlabs: ruleForm.pricingSlabs.map(s => ({
          minQty: Number(s.minQty),
          maxQty: s.maxQty ? Number(s.maxQty) : null,
          price: Number(s.price)
        }))
      };

      if (editRule) {
        await b2bAPI.updatePriceRule(activeList._id, editRule._id, payload);
      } else {
        await b2bAPI.createPriceRule(activeList._id, payload);
      }
      setShowRuleModal(false);
      loadListDetails(activeList._id);
      setSuccess('Rule saved');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to save rule');
    }
  };

  const getEntityName = (type: string, id?: string) => {
    if (type === 'global') return 'All Products';
    if (type === 'category') return categories.find(c => c._id === id)?.name || 'Unknown Category';
    if (type === 'product') return products.find(p => p._id === id)?.name || 'Unknown Product';
    return id;
  };

  if (activeList) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => setActiveList(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold">{activeList.name}</h2>
            <p className="text-muted-foreground">{activeList.description}</p>
          </div>
          {activeList.isDefault && <Badge className="ml-2">Default List</Badge>}
        </div>

        {error && <div className="bg-destructive/15 text-destructive p-3 rounded-md">{error}</div>}
        {success && <div className="bg-green-50 text-green-700 p-3 rounded-md">{success}</div>}

        <Tabs defaultValue="pricing">
          <TabsList>
            <TabsTrigger value="pricing">Pricing Rules</TabsTrigger>
            <TabsTrigger value="moq">MOQ Rules</TabsTrigger>
          </TabsList>

          <TabsContent value="pricing" className="mt-4 border rounded-md p-4 bg-background">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Pricing & Discount Rules</h3>
              <Button onClick={() => openRuleModal()}>
                <Plus className="h-4 w-4 mr-2" />
                Add Rule
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-8">Loading rules...</div>
            ) : rules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-md">
                No pricing rules defined for this list yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Applies To</TableHead>
                    <TableHead>Flat Rates</TableHead>
                    <TableHead>Slabs</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map(rule => (
                    <TableRow key={rule._id}>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{rule.ruleType}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {getEntityName(rule.ruleType, rule.entityId)}
                      </TableCell>
                      <TableCell>
                        {rule.flatPrice ? <div className="text-sm">₹{rule.flatPrice} flat</div> : null}
                        {rule.flatDiscountPct ? <div className="text-sm">{rule.flatDiscountPct}% off</div> : null}
                        {!rule.flatPrice && !rule.flatDiscountPct && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {rule.pricingSlabs?.length > 0 ? (
                          <div className="text-sm">
                            {rule.pricingSlabs.length} slabs defined
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openRuleModal(rule)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => {
                          if (confirm('Delete rule?')) {
                            await b2bAPI.deletePriceRule(activeList._id, rule._id);
                            loadListDetails(activeList._id);
                          }
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
          <TabsContent value="moq" className="mt-4 border rounded-md p-4 bg-background">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Minimum Order Quantity (MOQ)</h3>
              <Button disabled>
                <Plus className="h-4 w-4 mr-2" />
                Add MOQ Rule
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">MOQ management UI coming soon.</p>
            {moqRules.map(moq => (
              <div key={moq._id} className="p-3 border rounded my-2 text-sm">
                <strong>{moq.ruleType}</strong>: Min {moq.minQty} units (Increments of {moq.incrementQty})
              </div>
            ))}
          </TabsContent>
        </Tabs>

        {/* Rule Modal */}
        <Dialog open={showRuleModal} onOpenChange={setShowRuleModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editRule ? 'Edit Rule' : 'New Pricing Rule'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Rule Type</Label>
                  <Select value={ruleForm.ruleType} onValueChange={(v: any) => setRuleForm(f => ({ ...f, ruleType: v, entityId: '' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global (All Products)</SelectItem>
                      <SelectItem value="category">Category-wide</SelectItem>
                      <SelectItem value="product">Specific Product</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {ruleForm.ruleType === 'product' && (
                  <div className="space-y-2">
                    <Label>Product</Label>
                    <Select value={ruleForm.entityId} onValueChange={v => setRuleForm(f => ({ ...f, entityId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent>
                        {products.map(p => <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {ruleForm.ruleType === 'category' && (
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={ruleForm.entityId} onValueChange={v => setRuleForm(f => ({ ...f, entityId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Flat Price override (₹)</Label>
                  <Input type="number" placeholder="Optional" value={ruleForm.flatPrice} onChange={e => setRuleForm(f => ({ ...f, flatPrice: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Flat Discount (%)</Label>
                  <Input type="number" placeholder="Optional" value={ruleForm.flatDiscountPct} onChange={e => setRuleForm(f => ({ ...f, flatDiscountPct: e.target.value }))} />
                </div>
              </div>

              <div className="pt-4 border-t mt-2">
                <div className="flex justify-between items-center mb-2">
                  <Label>Quantity Slabs Pricing</Label>
                  <Button variant="outline" size="sm" onClick={() => setRuleForm(f => ({ ...f, pricingSlabs: [...f.pricingSlabs, { minQty: '', maxQty: '', price: '' }] }))}>
                    <Plus className="h-3 w-3 mr-1" /> Add Slab
                  </Button>
                </div>
                {ruleForm.pricingSlabs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No slabs defined. Use flat pricing or add a slab.</p>
                ) : (
                  <div className="space-y-2">
                    {ruleForm.pricingSlabs.map((slab, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Input placeholder="Min Qty" type="number" value={slab.minQty} onChange={e => {
                          const s = [...ruleForm.pricingSlabs]; s[i].minQty = e.target.value; setRuleForm({ ...ruleForm, pricingSlabs: s });
                        }} />
                        <span>-</span>
                        <Input placeholder="Max Qty (leave empty for no limit)" type="number" value={slab.maxQty} onChange={e => {
                          const s = [...ruleForm.pricingSlabs]; s[i].maxQty = e.target.value; setRuleForm({ ...ruleForm, pricingSlabs: s });
                        }} />
                        <span>₹</span>
                        <Input placeholder="Price" type="number" value={slab.price} onChange={e => {
                          const s = [...ruleForm.pricingSlabs]; s[i].price = e.target.value; setRuleForm({ ...ruleForm, pricingSlabs: s });
                        }} />
                        <Button variant="ghost" size="icon" onClick={() => {
                          const s = [...ruleForm.pricingSlabs]; s.splice(i, 1); setRuleForm({ ...ruleForm, pricingSlabs: s });
                        }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRuleModal(false)}>Cancel</Button>
              <Button onClick={saveRule}>Save Rule</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    );
  }

  // Main Lists View
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">B2B Price Lists</h3>
          <p className="text-sm text-muted-foreground">Define specialized pricing tiers for your wholesale accounts.</p>
        </div>
        <Button onClick={() => openListModal()}>
          <Plus className="h-4 w-4 mr-2" />
          Create List
        </Button>
      </div>

      {error && <div className="bg-destructive/15 text-destructive p-3 rounded-md text-sm">{error}</div>}
      
      {loading ? (
        <div className="py-8 text-center"><div className="animate-spin h-6 w-6 border-b-2 border-primary mx-auto rounded-full"></div></div>
      ) : lists.length === 0 ? (
        <Card className="border-dashed shadow-none bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings2 className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground">No Price Lists</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm text-center">Create multiple price lists and assign them to your B2B customers for customized wholesale pricing.</p>
            <Button onClick={() => openListModal()}>Create First List</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map(list => (
            <Card key={list._id} className="hover:border-primary/50 transition-colors cursor-pointer group" onClick={() => {
              setActiveList(list);
              loadListDetails(list._id);
            }}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-base flex items-center gap-2">
                    {list.name}
                    {list.isDefault && <Badge variant="secondary" className="text-[10px] h-4">Default</Badge>}
                  </CardTitle>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => {
                    e.stopPropagation();
                    openListModal(list);
                  }}>
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>
                <CardDescription className="line-clamp-2 min-h-10 text-xs">
                  {list.description || 'No description provided.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between text-xs text-muted-foreground border-t pt-3">
                  <span>Currency: {list.currency}</span>
                  <span className="font-medium text-primary">Manage Rules &rarr;</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* List Modal Form */}
      <Dialog open={showListModal} onOpenChange={setShowListModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editList ? 'Edit Price List' : 'Create Price List'}</DialogTitle>
            <DialogDescription>B2B price lists override standard B2C pricing for assigned accounts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input placeholder="e.g. Gold Tier Distributors" value={listForm.name} onChange={e => setListForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="Optional details..." value={listForm.description} onChange={e => setListForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={listForm.currency} onValueChange={v => setListForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INR">INR (₹)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex flex-col justify-end">
                <div className="flex items-center space-x-2 border rounded-md p-3">
                  <input type="checkbox" id="isDefault" className="h-4 w-4" checked={listForm.isDefault} onChange={e => setListForm(f => ({ ...f, isDefault: e.target.checked }))} />
                  <Label htmlFor="isDefault" className="cursor-pointer">Default List</Label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowListModal(false)}>Cancel</Button>
            <Button onClick={saveList}>{editList ? 'Update List' : 'Create List'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
