import React, { useEffect, useState } from 'react';
import { Printer, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { errorText } from '../../services/api';
import {
  LABEL_PRINT_DEFAULTS, LABEL_SIZES, LABEL_SIZE_GROUPS, readLabelPrint, writeLabelPrint,
  type LabelPrintSetting, type LabelSizeKey,
} from '@/lib/shippingLabels';

/**
 * Shipping labels, a store setting (owner 26 Nov 2026): the size and options every Print labels window starts from,
 * and which label it starts on. Read and written as the settings registry key `shippingLabels`; the window can still
 * change them for one print.
 */
const LabelPrintCard: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const [value, setValue] = useState<LabelPrintSetting>(LABEL_PRINT_DEFAULTS);
  const [state, setState] = useState<'loading' | 'ready' | 'absent' | 'error'>('loading');
  const [canWrite, setCanWrite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    readLabelPrint()
      .then((r) => { setValue(r.setting); setCanWrite(r.canWrite); setState(r.exists ? 'ready' : 'absent'); })
      .catch((e) => { setState('error'); setNote(errorText(e, 'The label setting could not be read.')); });
  }, []);

  const set = (patch: Partial<LabelPrintSetting>) => { setValue((v) => ({ ...v, ...patch })); setNote(null); };
  const editable = state === 'ready' && canWrite && canManage;

  const save = async () => {
    setSaving(true); setNote(null);
    try {
      await writeLabelPrint(value);
      setNote('Saved. Every Print labels window starts from this now.');
    } catch (e) {
      setNote(errorText(e, 'The label setting could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Printer className="h-5 w-5" /> Shipping labels</CardTitle>
        <CardDescription>
          The size and details every Print labels window starts from. A change in the window is for that print only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === 'loading' && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reading...</p>}
        {state === 'absent' && (
          <p className="text-sm text-muted-foreground">This server has no label setting yet, so labels start on A5 with every detail shown.</p>
        )}
        {state !== 'loading' && state !== 'absent' && (
          <fieldset disabled={!editable} className="space-y-4">
            <div className="flex flex-wrap items-end gap-6">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Size</span>
                <select className="h-9 rounded-md border px-2" value={value.size} onChange={(e) => set({ size: e.target.value as LabelSizeKey })}>
                  {LABEL_SIZE_GROUPS.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.keys.map((k) => <option key={k} value={k}>{LABEL_SIZES[k].label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <div className="text-sm">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Start on</span>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="label-default-kind" checked={value.defaultKind === 'growcord'} onChange={() => set({ defaultKind: 'growcord' })} />
                    Growcord label
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="label-default-kind" checked={value.defaultKind === 'courier'} onChange={() => set({ defaultKind: 'courier' })} />
                    Courier's label
                  </label>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-5 text-sm">
              {([['showProducts', 'Show products'], ['showInvoiceValue', 'Show invoice value'], ['showLogo', 'Show the store logo']] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={value[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<LabelPrintSetting>)} />
                  {l}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Growcord Ship parcels always start on the Growcord label: the courier's own PDF shows the courier account name.
            </p>
          </fieldset>
        )}
        {note && <p className={`text-sm ${state === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}>{note}</p>}
        {state === 'ready' && !editable && <p className="text-xs text-muted-foreground">Changing this needs the settings.manage permission.</p>}
        {editable && (
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save label setting
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default LabelPrintCard;
