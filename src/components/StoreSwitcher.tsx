import React, { useState } from 'react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Store, ChevronDown, Plus, Check, Loader2, X, AlertCircle,
} from 'lucide-react';
import { useStore } from '../contexts/StoreContext';
import { useAuth } from '../contexts/AuthContext';

const StoreSwitcher: React.FC = () => {
  const { currentStore, stores, switchStore, addStore, removeStore, isLoadingSwitch } = useStore();
  const { user } = useAuth();

  const [showAddModal, setShowAddModal]   = useState(false);
  const [apiKey, setApiKey]               = useState('');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [addError, setAddError]           = useState('');
  const [adding, setAdding]               = useState(false);

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || !email.trim() || !password.trim()) {
      setAddError('All fields are required');
      return;
    }
    setAdding(true);
    setAddError('');
    const result = await addStore(apiKey.trim(), email.trim(), password);
    setAdding(false);
    if (result.success) {
      setShowAddModal(false);
      setApiKey(''); setEmail(''); setPassword('');
    } else {
      setAddError(result.error || 'Failed to add store');
    }
  };

  const handleSwitch = async (key: string) => {
    if (key === currentStore?.apiKey) return;
    await switchStore(key);
  };

  const storeName = currentStore?.storeName || 'Select Store';
  const roleLabel = currentStore?.role === 'admin' ? 'Admin' : 'Staff';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 border-dashed font-medium max-w-[200px]"
            disabled={isLoadingSwitch}
          >
            {isLoadingSwitch
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Store className="h-4 w-4 shrink-0" />
            }
            <span className="truncate">{storeName}</span>
            <Badge
              variant={currentStore?.role === 'admin' ? 'default' : 'secondary'}
              className="text-[10px] px-1.5 py-0 h-4 shrink-0"
            >
              {roleLabel}
            </Badge>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            {user?.email || 'My Stores'}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {stores.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No stores added yet.</div>
          )}

          {stores.map(store => (
            <DropdownMenuItem
              key={store.apiKey}
              className="flex items-center justify-between gap-2 cursor-pointer"
              onClick={() => handleSwitch(store.apiKey)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">
                  {store.storeName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{store.storeName}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{store.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {store.apiKey === currentStore?.apiKey && (
                  <Check className="h-3.5 w-3.5 text-green-600" />
                )}
                {stores.length > 1 && store.apiKey !== currentStore?.apiKey && (
                  <button
                    onClick={e => { e.stopPropagation(); removeStore(store.apiKey); }}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-500 p-0.5"
                    title="Remove store"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowAddModal(true)} className="gap-2 text-primary cursor-pointer">
            <Plus className="h-4 w-4" />
            Add Another Store
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Add Store Modal */}
      <Dialog open={showAddModal} onOpenChange={open => { setShowAddModal(open); if (!open) setAddError(''); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> Add Another Store
            </DialogTitle>
            <DialogDescription>
              Enter the store's API key and your credentials for that store to add it to your switcher.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddStore} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="store-api-key">Store API Key</Label>
              <Input
                id="store-api-key"
                type="password"
                placeholder="rf_xxxxxxxxxxxxxxxx..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Found in the target store's Settings → API Integrations.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="store-email">Your Email for that Store</Label>
              <Input
                id="store-email"
                type="email"
                placeholder="admin@store.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="store-password">Password</Label>
              <Input
                id="store-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {addError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {addError}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={adding}>
                {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {adding ? 'Connecting…' : 'Add Store'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StoreSwitcher;
