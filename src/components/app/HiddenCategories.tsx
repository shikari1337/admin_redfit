import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Btn, SectionCard } from '@/components/erp';
import { CatalogItemPicker } from '@/components/common/CatalogItemPicker';
import { ErrorNote, Loading, Notice, useLoad, whyDisabled } from '@/pages/panels/erp/shared';
import { getHiddenCategories, putHiddenCategories } from '@/lib/v2/appSettings';

/**
 * Hidden category roots (AD08, HMAPP-T2d section 5): each root hides itself and every category under
 * it from the app (filters, listings, home rows, interest lists). Until the store saves this setting
 * (even empty) the app offers no automatic category list at all (fail closed). The health concerns
 * tree is the first root to hide (owner default: no health concern interests in the app).
 *
 * Server: `GET/PUT /api/v2/commerce/app/hidden-categories` {hidden_category_roots: [uuid]}, at most
 * 50; `settings.read`, save `settings.manage` and a person.
 */
const HiddenCategories: React.FC<{ canSave: boolean }> = ({ canSave }) => {
  const data = useLoad(getHiddenCategories, []);
  const [roots, setRoots] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setRoots(data.data?.settings?.hidden_category_roots ?? []); }, [data.data]);

  if (data.loading && !data.data) return <Loading label="Reading the hidden categories" />;
  if (data.error) return <ErrorNote error={data.error} what="Hidden categories" onRetry={() => void data.reload()} />;

  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try { await putHiddenCategories({ hidden_category_roots: roots }); setSaved(true); await data.reload(); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const off = whyDisabled(canSave, []);

  return (
    <SectionCard title="Categories the app never shows" description="Pick a top category to hide it and everything under it from the app.">
      <div className="space-y-4">
        {!data.data?.stored && (
          <Notice tone="warn" title="Not saved yet">
            Until this is saved, even empty, the app shows no category list of its own. Save it to open the categories you keep.
          </Notice>
        )}
        {data.data?.problem && <Notice tone="bad" title="The saved list is not in force">{data.data.problem}</Notice>}
        <CatalogItemPicker kind="category" value={roots} ordered={false} max={50} disabled={!canSave} onChange={setRoots} />
        <div className="flex flex-wrap items-center gap-3">
          <Btn onClick={() => void save()} disabled={!!off || busy} title={off ?? undefined}><Save className="h-4 w-4" />Save hidden categories</Btn>
          {off && <span className="text-xs text-gray-500">{off}</span>}
          {saved && <span className="text-sm text-emerald-700" role="status">Saved.</span>}
        </div>
        {error ? <ErrorNote error={error} /> : null}
      </div>
    </SectionCard>
  );
};

export default HiddenCategories;
