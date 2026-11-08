/**
 * The store's `catalogFacts` setting on the Catalog page (CAT-11, lane META-15B; META-9C section 4): the default country
 * of origin, importer and manufacturer the Meta catalog sends when a product, its brand and its manufacturer state none.
 * A brand's own origin and importer are set on the brand (Catalog, Brands). Empty fields keep the server's fallback:
 * no origin is sent, and the importer is the store's own legal name and address.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useCountries } from '@/lib/v2/reference';
import { metaCatalogApi, type CatalogFacts } from '@/lib/v2/areas/meta';
import { LoadFailure, Section, linkCls, useLoad, writeError } from './common';

const ADDRESS: Array<[keyof CatalogFacts['importerAddress'], string]> = [
  ['street1', 'Address line 1'], ['street2', 'Address line 2'], ['city', 'City'], ['region', 'State or region'], ['postalCode', 'Postal code'],
];

const CountrySelect: React.FC<{ id: string; value: string; onChange: (v: string) => void; disabled?: boolean; empty: string }> = ({ id, value, onChange, disabled, empty }) => {
  const COUNTRIES = useCountries();
  return (
  <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="mt-1 h-9 w-full rounded-md border bg-white px-2 text-sm">
    <option value="">{empty}</option>
    {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
  </select>
  );
};

const CatalogFactsCard: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const { toast } = useToast();
  const q = useLoad(() => metaCatalogApi.facts(), []);
  const [form, setForm] = useState<CatalogFacts | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (q.data) setForm(q.data); }, [q.data]);
  const dirty = !!form && JSON.stringify(form) !== JSON.stringify(q.data);
  const setAddr = (k: keyof CatalogFacts['importerAddress'], v: string) => form && setForm({ ...form, importerAddress: { ...form.importerAddress, [k]: v } });

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const trimmed: CatalogFacts = {
        originCountry: form.originCountry, importerName: form.importerName.trim(), manufacturerInfo: form.manufacturerInfo.trim(),
        importerAddress: Object.fromEntries(Object.entries(form.importerAddress).map(([k, v]) => [k, v.trim()])) as CatalogFacts['importerAddress'],
      };
      await metaCatalogApi.saveFacts(trimmed);
      toast({ title: 'Saved', description: 'Sent with each product from the next change; Sync now resends everything.' });
      await q.reload();
    } catch (e) {
      toast({ title: 'Not saved', description: writeError(e, 'The setting was not saved.'), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Section title="Origin and importer" hint={<>Meta asks for these to sell in India. Sent for a product when neither it nor its brand states them; set a brand's own on <Link className={linkCls} to="/products/brands">Brands</Link>.</>}
      actions={canEdit && form && <Button size="sm" onClick={save} disabled={!dirty || saving}>{saving ? 'Saving...' : 'Save'}</Button>}>
      {q.error && !q.data ? <LoadFailure failure={q.error} what="The store settings could not be read." onRetry={q.reload} />
        : !form ? <p className="text-sm text-gray-500">Loading...</p> : (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <Label htmlFor="cf-origin">Default country of origin</Label>
                <CountrySelect id="cf-origin" value={form.originCountry} onChange={(v) => setForm({ ...form, originCountry: v })} disabled={!canEdit} empty="Not set: Meta is told nothing" />
                <p className="mt-1 text-xs text-gray-500">A product's own country wins, then its brand's, then its manufacturer's, then this.</p>
              </div>
              <div>
                <Label htmlFor="cf-mfr">Manufacturer</Label>
                <Textarea id="cf-mfr" rows={3} className="mt-1" value={form.manufacturerInfo} disabled={!canEdit} placeholder="Name and address of the manufacturer"
                  onChange={(e) => setForm({ ...form, manufacturerInfo: e.target.value })} />
                <p className="mt-1 text-xs text-gray-500">For products whose record and brand name none; sent in the hosted Meta feed.</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label htmlFor="cf-imp">Importer name</Label>
                <Input id="cf-imp" className="mt-1" value={form.importerName} disabled={!canEdit} placeholder="Empty: the store's legal name" onChange={(e) => setForm({ ...form, importerName: e.target.value })} />
                <p className="mt-1 text-xs text-gray-500">Sent only for products made outside the store's own country.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {ADDRESS.map(([k, label]) => (
                  <div key={k} className={k === 'street1' || k === 'street2' ? 'sm:col-span-2' : ''}>
                    <Label htmlFor={`cf-${k}`} className="text-xs font-normal text-gray-700">{label}</Label>
                    <Input id={`cf-${k}`} className="mt-0.5 h-8 text-sm" value={form.importerAddress[k]} disabled={!canEdit}
                      placeholder={k === 'street1' ? "Empty: the store's own address" : ''} onChange={(e) => setAddr(k, e.target.value)} />
                  </div>
                ))}
                <div>
                  <Label htmlFor="cf-country" className="text-xs font-normal text-gray-700">Country</Label>
                  <CountrySelect id="cf-country" value={form.importerAddress.country} onChange={(v) => setAddr('country', v)} disabled={!canEdit} empty="Not set" />
                </div>
              </div>
            </div>
          </div>
        )}
    </Section>
  );
};

export default CatalogFactsCard;
