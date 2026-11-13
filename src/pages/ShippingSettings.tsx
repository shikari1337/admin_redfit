import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Truck, Warehouse, Loader2, MapPin, Plus, Pencil, Trash2, ShieldCheck, Copy, KeyRound } from 'lucide-react';
import api, { shippingZonesAPI, pincodeZonesAPI, shippingAPI, getApiBase, errorText, type ShippingProviderStatus, type GrowcordShipConnection } from '../services/api';
import ConnectionStatus, { type ConnState } from '../components/common/ConnectionStatus';
import GrowcordShipCard from '../components/shipments/GrowcordShipCard';
import ZoneRates from '../components/shipments/ZoneRates';
import { useAuth } from '../contexts/AuthContext';
import { useSettingsSection } from '../hooks/useSettingsSection';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ShippingZone {
  id: string;
  name: string;
  countries: string[];
  states: string[];
  pincodes: string[];
  is_active: boolean;
}

const emptyZoneForm = { id: '', name: '', countries: '', states: '', pincodes: '', is_active: true };

interface PincodeZoneRow {
  id: string;
  pincode: string;
  zone: string;
  city?: string;
  state?: string;
  is_serviceable: boolean;
}

const emptyPincodeForm = { id: '', pincode: '', zone: 'standard', city: '', state: '', is_serviceable: true };
const PINCODE_PAGE_SIZE = 20;

// Shipping by payment method (growcord-rs lane PAY-ADV-1, `shippingConfig.byPaymentMethod`): each method may
// carry its own flat fee, free-shipping threshold and zone-rate adjustment. A blank box follows the store's
// value above (saved as null, never as 0, which would mean "free").
type MethodKey = 'prepaid' | 'cod';
type MethodTerms = { shippingFee: string; freeShippingThreshold: string; rateAdjustment: string };
const METHOD_TERM_KEYS: Array<keyof MethodTerms> = ['shippingFee', 'freeShippingThreshold', 'rateAdjustment'];
const emptyTerms = (): MethodTerms => ({ shippingFee: '', freeShippingThreshold: '', rateAdjustment: '' });
const METHOD_LABEL: Record<MethodKey, string> = { prepaid: 'Paid online', cod: 'Cash on delivery' };

/** The stored object as the form's text boxes (a missing or null value is a blank box). */
const termsOf = (raw: any): MethodTerms => {
  const t = emptyTerms();
  for (const k of METHOD_TERM_KEYS) {
    const v = raw?.[k];
    if (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))) t[k] = String(v);
  }
  return t;
};

/** The form's boxes as the stored object: a blank box is null (follow the store's value). */
const storedTerms = (t: MethodTerms): Record<keyof MethodTerms, number | null> => {
  const out = {} as Record<keyof MethodTerms, number | null>;
  for (const k of METHOD_TERM_KEYS) {
    const v = t[k].trim();
    out[k] = v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
  }
  return out;
};

const DEFAULT_FORM_DATA = {
  shippingConfig: {
    freeShippingThreshold: 500,
    shippingFee: 49,
    codFee: 0,
    codEnabled: true,
    deliveryEnabled: true,
    slaHours: 0,
    // Registry `shippingConfig.zoneRatingEnabled` (default off): Indian orders priced by the zones' rates below.
    zoneRatingEnabled: false,
    byPaymentMethod: { prepaid: emptyTerms(), cod: emptyTerms() } as Record<MethodKey, MethodTerms>,
  },
  shiprocket: {
    email: '',
    password: '',
    apiUrl: 'https://apiv2.shiprocket.in',
    pickupLocation: '',
    channelId: '',
    isEnabled: false,
    requireSignedWebhook: false,
  },
  delhivery: {
    apiToken: '',
    apiUrl: 'https://staging-express.delhivery.com/api',
    isEnabled: false,
  },
};

type FormData = typeof DEFAULT_FORM_DATA;

const ShippingSettings: React.FC = () => {
  const navigate = useNavigate();
  const [providerStatus, setProviderStatus] = useState<ShippingProviderStatus[]>([]);
  const [conn, setConn] = useState<Record<string, { state: ConnState; message?: string }>>({});
  const [channels, setChannels] = useState<Array<{ id: string; name: string; type?: string; status?: string }>>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [channelsMsg, setChannelsMsg] = useState<string | null>(null);
  // ── Webhook security (Shiprocket) ───────────────────────────────────────
  const [webhookTokenSet, setWebhookTokenSet] = useState(false);
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [genSecret, setGenSecret] = useState<string | null>(null); // shown ONCE after generate
  const [genLoading, setGenLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  // Growcord Ship, the one aggregator: its connection rides the credentials read.
  const [growcordShip, setGrowcordShip] = useState<GrowcordShipConnection | null>(null);
  const { hasPerm } = useAuth();
  const canManage = hasPerm('settings.manage');
  // The zone whose rates are open under its row.
  const [ratesZoneId, setRatesZoneId] = useState<string | null>(null);

  // ── Shipping zones ──────────────────────────────────────────────────────
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zoneForm, setZoneForm] = useState(emptyZoneForm);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [savingZone, setSavingZone] = useState(false);
  const [zoneError, setZoneError] = useState<string | null>(null);

  const loadZones = async () => {
    setZonesLoading(true);
    try {
      const list = await shippingZonesAPI.getAll();
      setZones(Array.isArray(list) ? list : []);
    } catch { setZoneError('Failed to load shipping zones'); }
    finally { setZonesLoading(false); }
  };

  const splitList = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);

  const openCreateZone = () => { setZoneForm(emptyZoneForm); setShowZoneForm(true); };
  const openEditZone = (z: ShippingZone) => {
    setZoneForm({
      id: z.id, name: z.name,
      countries: (z.countries || []).join(', '),
      states: (z.states || []).join(', '),
      pincodes: (z.pincodes || []).join(', '),
      is_active: z.is_active,
    });
    setShowZoneForm(true);
  };

  const saveZone = async () => {
    if (!zoneForm.name.trim()) { setZoneError('Zone name is required.'); return; }
    setSavingZone(true);
    setZoneError(null);
    try {
      const payload = {
        name: zoneForm.name.trim(),
        countries: splitList(zoneForm.countries),
        states: splitList(zoneForm.states),
        pincodes: splitList(zoneForm.pincodes),
        is_active: zoneForm.is_active,
      };
      if (zoneForm.id) {
        const updated = await shippingZonesAPI.update(zoneForm.id, payload);
        setZones(prev => prev.map(z => z.id === zoneForm.id ? { ...z, ...updated } : z));
      } else {
        const created = await shippingZonesAPI.create(payload);
        setZones(prev => [...prev, created]);
      }
      setShowZoneForm(false);
      setZoneForm(emptyZoneForm);
    } catch (err: any) {
      setZoneError(errorText(err, 'Failed to save zone'));
    } finally {
      setSavingZone(false);
    }
  };

  const deleteZone = async (id: string) => {
    if (!confirm('Delete this shipping zone?')) return;
    try {
      await shippingZonesAPI.delete(id);
      setZones(prev => prev.filter(z => z.id !== id));
    } catch {
      setZoneError('Failed to delete zone');
    }
  };

  // ── Pincode serviceability ──────────────────────────────────────────────
  const [pincodes, setPincodes] = useState<PincodeZoneRow[]>([]);
  const [pincodesLoading, setPincodesLoading] = useState(true);
  const [pincodePage, setPincodePage] = useState(1);
  const [pincodeTotal, setPincodeTotal] = useState(0);
  const [pincodeForm, setPincodeForm] = useState(emptyPincodeForm);
  const [showPincodeForm, setShowPincodeForm] = useState(false);
  const [savingPincode, setSavingPincode] = useState(false);
  const [pincodeError, setPincodeError] = useState<string | null>(null);

  const loadPincodes = async (page: number) => {
    setPincodesLoading(true);
    try {
      const res = await pincodeZonesAPI.getAll({ page, per_page: PINCODE_PAGE_SIZE });
      const list = Array.isArray(res) ? res : (res?.data ?? []);
      setPincodes(list);
      setPincodeTotal(res?.meta?.total ?? list.length);
    } catch { setPincodeError('Failed to load pincode zones'); }
    finally { setPincodesLoading(false); }
  };

  const openCreatePincode = () => { setPincodeForm(emptyPincodeForm); setShowPincodeForm(true); };
  const openEditPincode = (p: PincodeZoneRow) => {
    setPincodeForm({ id: p.id, pincode: p.pincode, zone: p.zone || 'standard', city: p.city || '', state: p.state || '', is_serviceable: p.is_serviceable });
    setShowPincodeForm(true);
  };

  const savePincode = async () => {
    if (!/^\d{6}$/.test(pincodeForm.pincode.trim())) { setPincodeError('Enter a valid 6-digit pincode.'); return; }
    setSavingPincode(true);
    setPincodeError(null);
    try {
      const payload = {
        pincode: pincodeForm.pincode.trim(), zone: pincodeForm.zone.trim() || 'standard',
        city: pincodeForm.city.trim(), state: pincodeForm.state.trim(), is_serviceable: pincodeForm.is_serviceable,
      };
      if (pincodeForm.id) await pincodeZonesAPI.update(pincodeForm.id, payload);
      else await pincodeZonesAPI.create(payload);
      setShowPincodeForm(false);
      setPincodeForm(emptyPincodeForm);
      loadPincodes(pincodePage);
    } catch (err: any) {
      setPincodeError(err?.response?.data?.message || 'Failed to save pincode');
    } finally {
      setSavingPincode(false);
    }
  };

  const deletePincode = async (id: string) => {
    if (!confirm('Delete this pincode entry?')) return;
    try {
      await pincodeZonesAPI.delete(id);
      loadPincodes(pincodePage);
    } catch {
      setPincodeError('Failed to delete pincode');
    }
  };

  useEffect(() => {
    loadZones();
  }, []);

  useEffect(() => { loadPincodes(pincodePage); }, [pincodePage]);

  /**
   * Which carriers are really configured, and whose account is in effect.
   * The credential inputs can legitimately look empty (values may live in .env
   * or on a platform account), so this is the only reliable signal.
   */
  const loadProviderStatus = async () => {
    try {
      setProviderStatus(await shippingAPI.getProviderStatus());
    } catch { setProviderStatus([]); }
  };

  const statusFor = (provider: string): ShippingProviderStatus | undefined =>
    providerStatus.find((p) => p.provider === provider);

  /** After Growcord Ship is switched on or off: read its connection and the carrier strip again, keeping unsaved edits in the form. */
  const refreshGrowcordShip = async () => {
    const c = await shippingAPI.getProviderCredentials().catch(() => null);
    setGrowcordShip(c?.growcordShip ?? null);
    await loadProviderStatus();
  };

  /** Sales channels on the connected Shiprocket account (for the picker). */
  const loadChannels = async () => {
    setChannelsLoading(true);
    setChannelsMsg(null);
    try {
      const r = await shippingAPI.getShiprocketChannels();
      setChannels(r.channels);
      if (r.message) setChannelsMsg(r.message);
      else if (!r.configured) setChannelsMsg('Connect Shiprocket first, then refresh to list channels.');
    } catch (e: any) {
      setChannels([]);
      setChannelsMsg(e?.message || 'Could not load channels');
    } finally {
      setChannelsLoading(false);
    }
  };

  const testProvider = async (provider: string) => {
    setConn((prev) => ({ ...prev, [provider]: { state: 'testing' } }));
    try {
      const r = await shippingAPI.testConnection(provider);
      setConn((prev) => ({ ...prev, [provider]: { state: r.ok ? 'ok' : 'fail', message: r.message } }));
    } catch (e: any) {
      setConn((prev) => ({ ...prev, [provider]: { state: 'fail', message: e?.message || 'Test failed' } }));
    }
  };

  // Courier credentials come from the dedicated endpoint that reads the same
  // `shipping_providers` setting the shipment resolver uses (they used to be
  // read from /settings/admin, which held a different key entirely — so saved
  // credentials were never actually applied), so this page's "settings" are
  // really two independent fetches merged into one form. A failure fetching
  // creds alone must not fail the whole load — the status strip still reports
  // the truth from `loadProviderStatus()`.
  const {
    formData, setFormData, loading, saving, reload, handleSubmit,
  } = useSettingsSection<FormData>({
    defaults: DEFAULT_FORM_DATA,
    fetcher: async () => {
      loadProviderStatus();
      loadChannels();
      const response = await api.get('/settings/admin');
      const settings = response.data;
      const creds = await shippingAPI.getProviderCredentials().catch(() => null);
      return { settings, creds };
    },
    parse: ({ settings, creds }) => {
      const next: FormData = {
        shippingConfig: { ...DEFAULT_FORM_DATA.shippingConfig },
        shiprocket: { ...DEFAULT_FORM_DATA.shiprocket },
        delhivery: { ...DEFAULT_FORM_DATA.delhivery },
      };
      if (settings?.shippingConfig) {
        next.shippingConfig = {
          freeShippingThreshold: settings.shippingConfig.freeShippingThreshold ?? 500,
          shippingFee: settings.shippingConfig.shippingFee ?? 49,
          codFee: settings.shippingConfig.codFee ?? 0,
          codEnabled: settings.shippingConfig.codEnabled !== false,
          deliveryEnabled: settings.shippingConfig.deliveryEnabled !== false,
          slaHours: settings.shippingConfig.slaHours ?? 0,
          zoneRatingEnabled: settings.shippingConfig.zoneRatingEnabled === true,
          byPaymentMethod: {
            prepaid: termsOf(settings.shippingConfig.byPaymentMethod?.prepaid),
            cod: termsOf(settings.shippingConfig.byPaymentMethod?.cod),
          },
        };
      }
      if (creds) {
        next.shiprocket = {
          ...DEFAULT_FORM_DATA.shiprocket,
          isEnabled: creds.shiprocket.isEnabled,
          email: creds.shiprocket.email || '',
          apiUrl: creds.shiprocket.apiUrl || DEFAULT_FORM_DATA.shiprocket.apiUrl,
          pickupLocation: creds.shiprocket.pickupLocation || '',
          channelId: (creds.shiprocket as any).channelId || '',
          password: '', // never prefill a secret
          requireSignedWebhook: !!creds.shiprocket.requireSignedWebhook,
        };
        next.delhivery = {
          ...DEFAULT_FORM_DATA.delhivery,
          isEnabled: creds.delhivery.isEnabled,
          apiUrl: creds.delhivery.apiUrl || DEFAULT_FORM_DATA.delhivery.apiUrl,
          apiToken: '',
        };
      }
      return next;
    },
    onLoaded: ({ creds }) => {
      setWebhookTokenSet(!!creds?.shiprocket.webhookTokenSet);
      setStoreSlug(creds?.slug ?? null);
      setGrowcordShip(creds?.growcordShip ?? null);
    },
    onLoadError: () => alert('Failed to load shipping settings'),
    submitter: async (data) => {
      // Store-wide fee config stays in /settings…
      // The COD switch and the COD convenience fee are the registry's `cod` setting (they live inside
      // shippingConfig, but the shippingConfig definition does not declare them, so sent there they were
      // dropped without a word).
      await api.put('/settings', {
        shippingConfig: {
          freeShippingThreshold: Number(data.shippingConfig.freeShippingThreshold) || 500,
          shippingFee: Number(data.shippingConfig.shippingFee) || 0,
          deliveryEnabled: data.shippingConfig.deliveryEnabled,
          slaHours: Math.max(0, Number(data.shippingConfig.slaHours) || 0),
        },
        cod: {
          codFee: Math.max(0, Number(data.shippingConfig.codFee) || 0),
          codEnabled: data.shippingConfig.codEnabled,
        },
      });
      // Shipping by payment method: one JSON field (`byPaymentMethod`), so a cleared box is stored as null.
      await api.put('/settings/registry/shippingConfig', {
        byPaymentMethod: {
          prepaid: storedTerms(data.shippingConfig.byPaymentMethod.prepaid),
          cod: storedTerms(data.shippingConfig.byPaymentMethod.cod),
        },
        zoneRatingEnabled: !!data.shippingConfig.zoneRatingEnabled,
      });

      // …courier credentials go to the endpoint that writes `shipping_providers`
      // (the key the shipment resolver actually reads) and encrypts secrets.
      // Blank secret = keep the stored one.
      await shippingAPI.saveProviderCredentials({
        shiprocket: {
          isEnabled: data.shiprocket.isEnabled,
          email: data.shiprocket.email,
          apiUrl: data.shiprocket.apiUrl,
          pickupLocation: data.shiprocket.pickupLocation,
          channelId: data.shiprocket.channelId,
          requireSignedWebhook: data.shiprocket.requireSignedWebhook,
          ...(data.shiprocket.password ? { password: data.shiprocket.password } : {}),
        },
        delhivery: {
          isEnabled: data.delhivery.isEnabled,
          apiUrl: data.delhivery.apiUrl,
          ...(data.delhivery.apiToken ? { apiToken: data.delhivery.apiToken } : {}),
        },
      });
      // Report what actually persisted (read back from the server) rather than a
      // blanket "saved" — that's what made a silently-ignored save look successful.
      const saved = await shippingAPI.getProviderCredentials().catch(() => null);
      const savedChannel = saved?.shiprocket?.channelId
        ? (channels.find((c) => c.id === saved.shiprocket.channelId)?.name ?? saved.shiprocket.channelId)
        : null;
      alert(
        'Shipping settings saved.\n' +
        `Shiprocket: ${saved?.shiprocket?.isEnabled ? 'enabled' : 'disabled'}` +
        `${saved?.shiprocket?.email ? `, ${saved.shiprocket.email}` : ''}` +
        `${savedChannel ? `, channel: ${savedChannel}` : ', no channel selected'}`
      );
      await reload();
      // Credentials may have changed — a previous "Connected" result is now stale.
      setConn({});
      await loadProviderStatus();
      // Newly-saved credentials may unlock the channel list for the first time.
      await loadChannels();
    },
    onError: (error: any) => {
      alert(error?.response?.data?.message || 'Failed to save shipping settings');
    },
  });

  const setMethodTerm = (method: MethodKey, key: keyof MethodTerms, value: string) => {
    setFormData(prev => ({
      ...prev,
      shippingConfig: {
        ...prev.shippingConfig,
        byPaymentMethod: {
          ...prev.shippingConfig.byPaymentMethod,
          [method]: { ...prev.shippingConfig.byPaymentMethod[method], [key]: value },
        },
      },
    }));
  };

  const handleChange = (section: keyof typeof formData, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  // ── Webhook security helpers ────────────────────────────────────────────
  const webhookUrl = storeSlug
    ? `${getApiBase()}/webhooks/shipping/track/${storeSlug}`
    : '';

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1500);
    } catch { /* clipboard blocked — the value is visible to select manually */ }
  };

  const generateWebhookSecret = async () => {
    if (
      webhookTokenSet &&
      !confirm(
        'A webhook secret already exists. Generating a new one REPLACES it. ' +
        'You must update the new secret in your Shiprocket dashboard, or tracking pushes ' +
        'signed with the old secret will be rejected once enforcement is on. Continue?'
      )
    ) return;
    setGenLoading(true);
    try {
      const r = await shippingAPI.generateWebhookSecret();
      setGenSecret(r.webhookToken);
      setWebhookTokenSet(true);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to generate webhook secret');
    } finally {
      setGenLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/settings')}
          className="text-muted-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Shipping Settings</h1>
            <p className="text-sm text-muted-foreground mt-2">What shoppers pay for delivery, where you deliver, and the couriers that carry it.</p>
          </div>
          <Button
            onClick={() => navigate('/warehouses')}
            className="bg-blue-600 hover:bg-blue-700 self-start sm:self-auto"
          >
            <Warehouse className="mr-2 w-4 h-4" />
            Manage Warehouses
          </Button>
        </div>
      </div>

      {/* Growcord Ship first: it is the one aggregator, and the own-account cards below are the alternative. */}
      <GrowcordShipCard
        connection={growcordShip}
        status={statusFor('growcord_ship')}
        canManage={canManage}
        onChanged={refreshGrowcordShip}
      />

      <form onSubmit={handleSubmit} className="space-y-6 pb-12">
        {/* Shipping Fees & COD */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Truck className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <CardTitle>Shipping Fees & COD</CardTitle>
                <CardDescription>Set the flat shipping fee, the free shipping threshold, the COD convenience fee, and shipping by payment method</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Free Shipping Threshold (₹)</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.shippingConfig.freeShippingThreshold}
                  onChange={(e) => handleChange('shippingConfig', 'freeShippingThreshold', e.target.value)}
                  placeholder="500"
                />
                <p className="text-[11px] text-muted-foreground">Orders above this amount get free shipping</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Flat Shipping Fee (₹)</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.shippingConfig.shippingFee}
                  onChange={(e) => handleChange('shippingConfig', 'shippingFee', e.target.value)}
                  placeholder="49"
                />
                <p className="text-[11px] text-muted-foreground">Charged when order is below the threshold</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Dispatch SLA (hours)</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.shippingConfig.slaHours}
                  onChange={(e) => handleChange('shippingConfig', 'slaHours', e.target.value)}
                  placeholder="24"
                />
                <p className="text-[11px] text-muted-foreground">
                  Website-level dispatch promise: the storefront shows "Ships within X hours"
                  and order pages show the expected ship-by time. 0 = don't promise.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">COD convenience fee (₹)</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.shippingConfig.codFee}
                  onChange={(e) => handleChange('shippingConfig', 'codFee', e.target.value)}
                  placeholder="0"
                />
                <p className="text-[11px] text-muted-foreground">
                  Added to cash-on-delivery orders (0 = no fee). To have buyers pay it online at checkout and the
                  rest on delivery, switch on "COD convenience fee paid online" under Payment settings.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">COD Available</label>
                <div className="flex items-center gap-3 pt-2">
                  <Checkbox
                    checked={formData.shippingConfig.codEnabled}
                    onCheckedChange={(checked) => handleChange('shippingConfig', 'codEnabled', checked as boolean)}
                  />
                  <span className="text-sm">Enable Cash on Delivery for customers</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Delivery Available</label>
                <div className="flex items-center gap-3 pt-2">
                  <Checkbox
                    checked={formData.shippingConfig.deliveryEnabled}
                    onCheckedChange={(checked) => handleChange('shippingConfig', 'deliveryEnabled', checked as boolean)}
                  />
                  <span className="text-sm">Show the delivery method on checkout</span>
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-foreground">Rate by zone</label>
                <div className="flex items-start gap-3 pt-1">
                  <Checkbox
                    className="mt-0.5"
                    checked={formData.shippingConfig.zoneRatingEnabled}
                    onCheckedChange={(checked) => handleChange('shippingConfig', 'zoneRatingEnabled', checked as boolean)}
                  />
                  <span className="text-sm">
                    Price Indian orders by the shipping zones and their rates below
                    <span className="block text-[11px] text-muted-foreground mt-0.5">
                      Off: every Indian order pays the flat fee above. On: the zone the address falls in and its
                      cheapest fitting rate decide the charge; the flat fee stays the fallback. Orders abroad are always
                      priced by their zone.
                      {formData.shippingConfig.zoneRatingEnabled && zones.length === 0 && ' No zone exists yet, so every order still pays the flat fee.'}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <div>
                <p className="text-sm font-medium text-foreground">Shipping by payment method</p>
                <p className="text-[11px] text-muted-foreground">
                  Charge a different shipping fee or free-shipping threshold for orders paid online and for cash on
                  delivery, for example free shipping on every prepaid order. Leave a box empty to use the value
                  above. The checkout shows the difference on the payment step. The zone rate adjustment applies
                  when shipping is rated by zone (a negative amount takes it off; free delivery stays free).
                </p>
              </div>
              {(['prepaid', 'cod'] as MethodKey[]).map((m) => (
                <div key={m} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end rounded-lg border p-3">
                  <p className="text-sm font-medium text-foreground md:pb-2">{METHOD_LABEL[m]}</p>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Flat shipping fee (₹)</label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.shippingConfig.byPaymentMethod[m].shippingFee}
                      onChange={(e) => setMethodTerm(m, 'shippingFee', e.target.value)}
                      placeholder={`Same as above (${formData.shippingConfig.shippingFee})`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Free shipping from (₹)</label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.shippingConfig.byPaymentMethod[m].freeShippingThreshold}
                      onChange={(e) => setMethodTerm(m, 'freeShippingThreshold', e.target.value)}
                      placeholder={`Same as above (${formData.shippingConfig.freeShippingThreshold})`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Zone rate adjustment (₹)</label>
                    <Input
                      type="number"
                      value={formData.shippingConfig.byPaymentMethod[m].rateAdjustment}
                      onChange={(e) => setMethodTerm(m, 'rateAdjustment', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Shiprocket Settings */}
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Truck className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <CardTitle>Shiprocket Shipping</CardTitle>
                <CardDescription>Configure Shiprocket shipping integration</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.shiprocket.isEnabled}
                  onCheckedChange={(checked) => handleChange('shiprocket', 'isEnabled', checked as boolean)}
                />
                <span className="text-sm font-medium">Enabled</span>
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ConnectionStatus
              configured={!!statusFor('shiprocket')?.configured}
              source={statusFor('shiprocket')?.source ?? 'none'}
              accountName={statusFor('shiprocket')?.account_name}
              missing={statusFor('shiprocket')?.missing ?? []}
              details={statusFor('shiprocket')?.details ?? {}}
              connection={conn.shiprocket?.state ?? 'unknown'}
              connectionMessage={conn.shiprocket?.message}
              onTest={() => testProvider('shiprocket')}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Email</label>
                <Input
                  type="email"
                  value={formData.shiprocket.email}
                  onChange={(e) => handleChange('shiprocket', 'email', e.target.value)}
                  placeholder="your-email@shiprocket.com"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Password</label>
                <Input
                  type="password"
                  value={formData.shiprocket.password}
                  onChange={(e) => handleChange('shiprocket', 'password', e.target.value)}
                  placeholder={statusFor('shiprocket')?.configured ? 'Saved. Leave blank to keep current' : 'Enter password'}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">API URL</label>
                <Input
                  type="text"
                  value={formData.shiprocket.apiUrl}
                  onChange={(e) => handleChange('shiprocket', 'apiUrl', e.target.value)}
                  placeholder="https://apiv2.shiprocket.in"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">Sales Channel</label>
                  <button
                    type="button" onClick={loadChannels} disabled={channelsLoading}
                    className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    {channelsLoading ? 'Loading' : 'Refresh'}
                  </button>
                </div>

                {channels.length > 0 ? (
                  <select
                    value={formData.shiprocket.channelId || ''}
                    onChange={(e) => handleChange('shiprocket', 'channelId', e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Select a channel</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (#{c.id}){c.status && c.status.toLowerCase() !== 'active' ? `, ${c.status}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type="text"
                    value={formData.shiprocket.channelId}
                    onChange={(e) => handleChange('shiprocket', 'channelId', e.target.value)}
                    placeholder={channelsMsg ? 'Enter Channel ID' : 'Save credentials, then Refresh to list channels'}
                  />
                )}

                {/* Shiprocket files every order under a channel, so a blank or
                    stale value quietly misattributes the whole catalog. */}
                {!formData.shiprocket.channelId && channels.length > 0 && (
                  <p className="text-[11px] text-amber-700">
                    No channel selected: orders won&apos;t be attributed to a sales channel.
                  </p>
                )}
                {formData.shiprocket.channelId && channels.length > 0 &&
                  !channels.some((c) => c.id === formData.shiprocket.channelId) && (
                  <p className="text-[11px] text-red-700">
                    Channel {formData.shiprocket.channelId} isn&apos;t on this Shiprocket account. Pick a current one.
                  </p>
                )}
                {channelsMsg && <p className="text-[10px] text-muted-foreground">{channelsMsg}</p>}
                <p className="text-[10px] text-muted-foreground">
                  Shiprocket files orders under this channel. It&apos;s how catalog and orders reconcile back to your store.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Fallback Pickup Location <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                  type="text"
                  value={formData.shiprocket.pickupLocation}
                  onChange={(e) => handleChange('shiprocket', 'pickupLocation', e.target.value)}
                  placeholder="Only used if a warehouse has no mapping"
                />
                <p className="text-[10px] text-muted-foreground">
                  Leave blank once every warehouse is mapped.
                </p>
              </div>
            </div>

            {/* Pickup is a per-warehouse fact, not a per-account one. */}
            <div className="rounded-lg border bg-blue-50/60 border-blue-200 px-4 py-3 text-sm text-blue-900">
              <strong>Pickup locations are set per warehouse.</strong> Each warehouse maps to a
              pickup location that exists on this Shiprocket account, so multi-warehouse stores
              dispatch from the right place.{' '}
              <button
                type="button"
                onClick={() => navigate('/warehouses')}
                className="underline underline-offset-2 font-medium hover:opacity-80"
              >
                Map warehouses
              </button>
            </div>

            {/* Webhook security — verify Shiprocket status pushes are really from Shiprocket */}
            <div className="rounded-lg border bg-muted/30 px-4 py-4 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-green-600" />
                <h4 className="text-sm font-semibold text-foreground">Webhook security</h4>
                {webhookTokenSet
                  ? <Badge className="bg-green-500/15 text-green-700 border-green-200">Secret set</Badge>
                  : <Badge variant="secondary">No secret</Badge>}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Shiprocket sends live order-tracking updates to your store over a webhook. Set a secret
                here, paste it into Shiprocket, then require signed webhooks so only Shiprocket can push
                status changes to your orders.
              </p>

              {/* The URL to register in the Shiprocket dashboard */}
              <div className="space-y-1.5">
                <Label className="text-xs">Webhook URL: paste it into Shiprocket under Settings, API, Webhooks</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={webhookUrl || 'Save credentials first to reveal your webhook URL'}
                    className="font-mono text-xs"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button type="button" variant="outline" size="sm" disabled={!webhookUrl} onClick={() => copy(webhookUrl, 'url')}>
                    <Copy className="h-3.5 w-3.5 mr-1" />{copied === 'url' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>

              {/* Generate / rotate the shared secret */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={generateWebhookSecret} disabled={genLoading}>
                    {genLoading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <KeyRound className="h-3.5 w-3.5 mr-1" />}
                    {webhookTokenSet ? 'Regenerate webhook secret' : 'Generate webhook secret'}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">Set the SAME value as the security token in Shiprocket.</span>
                </div>
                {genSecret && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 space-y-1.5">
                    <p className="text-[11px] font-medium text-amber-800">Copy this now. It is shown only once and cannot be retrieved later.</p>
                    <div className="flex gap-2">
                      <Input readOnly value={genSecret} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                      <Button type="button" variant="outline" size="sm" onClick={() => copy(genSecret, 'secret')}>
                        <Copy className="h-3.5 w-3.5 mr-1" />{copied === 'secret' ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Enforcement toggle — opt-in, off by default */}
              <div className="space-y-2 pt-1">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    className="mt-0.5"
                    checked={formData.shiprocket.requireSignedWebhook}
                    onCheckedChange={(checked) => handleChange('shiprocket', 'requireSignedWebhook', checked as boolean)}
                  />
                  <span>
                    <span className="text-sm font-medium">Require signed webhooks (reject unsigned)</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">
                      When on, any tracking push that doesn&apos;t carry your secret is ignored. Leave this
                      OFF (the default) if your Shiprocket webhook has no security token registered.
                    </span>
                  </span>
                </label>
                {formData.shiprocket.requireSignedWebhook && !webhookTokenSet && (
                  <p className="text-[11px] font-medium text-red-700">
                    No secret is set. If you save with this ON, ALL tracking pushes will be rejected until
                    you generate a secret above and register it in Shiprocket.
                  </p>
                )}
                {formData.shiprocket.requireSignedWebhook && webhookTokenSet && (
                  <p className="text-[11px] text-amber-700">
                    Only turn this on AFTER you&apos;ve set the secret in your Shiprocket dashboard, or your
                    tracking updates will stop. Click &quot;Save Changes&quot; to apply.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* DELHIVERY Settings */}
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Truck className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <CardTitle>DELHIVERY Shipping</CardTitle>
                <CardDescription>Configure DELHIVERY shipping integration</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={formData.delhivery.isEnabled}
                  onCheckedChange={(checked) => handleChange('delhivery', 'isEnabled', checked as boolean)}
                />
                <span className="text-sm font-medium">Enabled</span>
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ConnectionStatus
              configured={!!statusFor('delhivery')?.configured}
              source={statusFor('delhivery')?.source ?? 'none'}
              accountName={statusFor('delhivery')?.account_name}
              missing={statusFor('delhivery')?.missing ?? []}
              details={statusFor('delhivery')?.details ?? {}}
              connection={conn.delhivery?.state ?? 'unknown'}
              connectionMessage={conn.delhivery?.message}
              onTest={() => testProvider('delhivery')}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">API Token</label>
                <Input
                  type="password"
                  value={formData.delhivery.apiToken}
                  onChange={(e) => handleChange('delhivery', 'apiToken', e.target.value)}
                  placeholder={statusFor('delhivery')?.configured ? 'Saved. Leave blank to keep current' : 'Enter DELHIVERY API Token'}
                />
                <p className="text-[10px] text-muted-foreground">
                  Get your API token from the DELHIVERY Dashboard under Settings, API Setup.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">API URL</label>
                <Input
                  type="text"
                  value={formData.delhivery.apiUrl}
                  onChange={(e) => handleChange('delhivery', 'apiUrl', e.target.value)}
                  placeholder="https://staging-express.delhivery.com/api"
                />
                <p className="text-[10px] text-muted-foreground">Production: https://track.delhivery.com/api, Staging: https://staging-express.delhivery.com/api</p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> Warehouse configuration is managed separately in the <strong>Warehouses</strong> section. Each warehouse must have a DELHIVERY warehouse code (warehouse name as registered with DELHIVERY) configured.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/settings')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>

      {/* Shipping Zones */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <MapPin className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <CardTitle>Shipping Zones</CardTitle>
              <CardDescription>
                Group countries, states or pincodes into zones, then give each zone its rates.
                {formData.shippingConfig.zoneRatingEnabled ? ' Rate by zone is on.' : ' Indian orders use these rates only when Rate by zone is on.'}
              </CardDescription>
            </div>
          </div>
          {canManage && <Button size="sm" onClick={openCreateZone}><Plus className="mr-1.5 h-4 w-4" /> Add Zone</Button>}
        </CardHeader>
        <CardContent className="space-y-4">
          {zoneError && (
            <div className="flex items-start justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <span>{zoneError}</span>
              <button onClick={() => setZoneError(null)} className="opacity-60 hover:opacity-100">✕</button>
            </div>
          )}

          {showZoneForm && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Zone Name</Label>
                  <Input value={zoneForm.name} onChange={e => setZoneForm(f => ({ ...f, name: e.target.value }))} placeholder="North India" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Countries (comma-separated ISO codes)</Label>
                  <Input value={zoneForm.countries} onChange={e => setZoneForm(f => ({ ...f, countries: e.target.value }))} placeholder="IN" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">States (comma-separated)</Label>
                  <Input value={zoneForm.states} onChange={e => setZoneForm(f => ({ ...f, states: e.target.value }))} placeholder="Delhi, Punjab, Haryana" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Pincodes (comma-separated, optional)</Label>
                  <Input value={zoneForm.pincodes} onChange={e => setZoneForm(f => ({ ...f, pincodes: e.target.value }))} placeholder="110001, 110002" className="h-9" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={zoneForm.is_active} onCheckedChange={c => setZoneForm(f => ({ ...f, is_active: c as boolean }))} />
                <span className="text-sm">Active</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveZone} disabled={savingZone}>
                  {savingZone && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {zoneForm.id ? 'Save' : 'Create'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowZoneForm(false); setZoneForm(emptyZoneForm); }}>Cancel</Button>
              </div>
            </div>
          )}

          {zonesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : zones.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No shipping zones configured yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Name</TableHead><TableHead>Coverage</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {zones.map(z => (
                  <React.Fragment key={z.id}>
                  <TableRow>
                    <TableCell className="font-medium">{z.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(() => {
                        // What checkout matches on (commerce zone_matches): countries (none = India), then states, then pincodes.
                        const places = [...(z.countries || []), ...(z.states || [])];
                        const pins = z.pincodes?.length || 0;
                        const pinText = pins ? `${pins} pincode${pins === 1 ? '' : 's'}` : '';
                        if (!places.length) return pinText ? `India, ${pinText}` : 'All of India';
                        const shown = places.slice(0, 4).join(', ');
                        const more = places.length > 4 ? `, and ${places.length - 4} more` : '';
                        return `${shown}${more}${pinText ? `, ${pinText}` : ''}`;
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={z.is_active ? 'default' : 'secondary'} className={z.is_active ? 'bg-green-500/15 text-green-700 border-green-200 hover:bg-green-500/25' : ''}>
                        {z.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        variant={ratesZoneId === z.id ? 'default' : 'outline'} size="sm" className="h-7 px-2 mr-1 text-xs"
                        onClick={() => setRatesZoneId(ratesZoneId === z.id ? null : z.id)}
                        aria-expanded={ratesZoneId === z.id}
                      >
                        Rates
                      </Button>
                      {canManage && (
                        <>
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0 mr-1" onClick={() => openEditZone(z)} aria-label={`Edit ${z.name}`}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteZone(z.id)} aria-label={`Delete ${z.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                  {ratesZoneId === z.id && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={4} className="p-2 sm:p-3">
                        <ZoneRates zoneId={z.id} zoneName={z.name} canManage={canManage} />
                      </TableCell>
                    </TableRow>
                  )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pincode Serviceability */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
              <MapPin className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <CardTitle>Pincode Serviceability</CardTitle>
              <CardDescription>Mark individual pincodes as serviceable/unserviceable and assign them to a rate zone.</CardDescription>
            </div>
          </div>
          <Button size="sm" onClick={openCreatePincode}><Plus className="mr-1.5 h-4 w-4" /> Add Pincode</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {pincodeError && (
            <div className="flex items-start justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <span>{pincodeError}</span>
              <button onClick={() => setPincodeError(null)} className="opacity-60 hover:opacity-100">✕</button>
            </div>
          )}

          {showPincodeForm && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Pincode</Label>
                  <Input value={pincodeForm.pincode} onChange={e => setPincodeForm(f => ({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="110001" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Zone</Label>
                  <Input value={pincodeForm.zone} onChange={e => setPincodeForm(f => ({ ...f, zone: e.target.value }))} placeholder="standard" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">City</Label>
                  <Input value={pincodeForm.city} onChange={e => setPincodeForm(f => ({ ...f, city: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">State</Label>
                  <Input value={pincodeForm.state} onChange={e => setPincodeForm(f => ({ ...f, state: e.target.value }))} className="h-9" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={pincodeForm.is_serviceable} onCheckedChange={c => setPincodeForm(f => ({ ...f, is_serviceable: c as boolean }))} />
                <span className="text-sm">Serviceable</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={savePincode} disabled={savingPincode}>
                  {savingPincode && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {pincodeForm.id ? 'Save' : 'Create'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowPincodeForm(false); setPincodeForm(emptyPincodeForm); }}>Cancel</Button>
              </div>
            </div>
          )}

          {pincodesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : pincodes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No pincodes configured yet.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Pincode</TableHead><TableHead>Zone</TableHead><TableHead>City / State</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {pincodes.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm">{p.pincode}</TableCell>
                      <TableCell className="text-sm capitalize">{p.zone}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{[p.city, p.state].filter(Boolean).join(', ') || 'Not given'}</TableCell>
                      <TableCell>
                        <Badge variant={p.is_serviceable ? 'default' : 'destructive'} className={p.is_serviceable ? 'bg-green-500/15 text-green-700 border-green-200 hover:bg-green-500/25' : ''}>
                          {p.is_serviceable ? 'Serviceable' : 'Not serviceable'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0 mr-1" onClick={() => openEditPincode(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => deletePincode(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pincodeTotal > PINCODE_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">Page {pincodePage} of {Math.ceil(pincodeTotal / PINCODE_PAGE_SIZE)}, {pincodeTotal} total</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={pincodePage <= 1} onClick={() => setPincodePage(p => p - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={pincodePage >= Math.ceil(pincodeTotal / PINCODE_PAGE_SIZE)} onClick={() => setPincodePage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ShippingSettings;
