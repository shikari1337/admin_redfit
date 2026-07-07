import { useState, useEffect } from 'react';
import { modulesAPI } from '../services/api';

interface Module {
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  default?: boolean;
  category?: string;
}

interface RegistryModule {
  name: string;
  description?: string;
  default: boolean;
  category?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  core:        'Core',
  commerce:    'Commerce',
  engagement:  'Engagement',
  marketing:   'Marketing',
  insights:    'Insights & Analytics',
  ai:          'AI & Automation',
  advanced:    'Advanced',
  operations:  'Operations',
  catalog:     'Catalog',
};

export default function Modules() {
  const [modules, setModules] = useState<Module[]>([]);
  const [registry, setRegistry] = useState<Record<string, RegistryModule>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [initLoading, setInitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [modulesRes, registryRes] = await Promise.all([
        modulesAPI.list(),
        modulesAPI.getRegistry(),
      ]);
      const modulesList = Array.isArray(modulesRes) ? modulesRes : modulesRes?.modules ?? [];
      const registryData = registryRes?.registry ?? registryRes ?? {};
      setModules(modulesList);
      setRegistry(registryData);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Failed to load modules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggle = async (key: string, currentEnabled: boolean) => {
    try {
      setSaving(key);
      setError(null);
      await modulesAPI.toggle(key, !currentEnabled);
      setModules(prev =>
        prev.map(m => (m.key === key ? { ...m, enabled: !currentEnabled } : m))
      );
      setSuccess(`Module ${!currentEnabled ? 'enabled' : 'disabled'} successfully.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Failed to update module');
    } finally {
      setSaving(null);
    }
  };

  const handleInitialize = async () => {
    try {
      setInitLoading(true);
      setError(null);
      await modulesAPI.initialize();
      setSuccess('Modules initialized with defaults.');
      setTimeout(() => setSuccess(null), 3000);
      loadData();
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || err?.message || 'Failed to initialize modules');
    } finally {
      setInitLoading(false);
    }
  };

  // Group modules by category
  const grouped = modules.reduce<Record<string, Module[]>>((acc, mod) => {
    const cat = mod.category ?? registry[mod.key]?.category ?? 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(mod);
    return acc;
  }, {});

  const enabledCount = modules.filter(m => m.enabled).length;

  return (
    <div className="modules-page">
      <div className="page-header">
        <div>
          <h1>Store Modules</h1>
          <p className="page-subtitle">
            Enable or disable features for your store. Changes take effect immediately.
          </p>
        </div>
        <div className="header-actions">
          <span className="module-count">{enabledCount}/{modules.length} active</span>
          <button
            className="btn btn-secondary"
            onClick={handleInitialize}
            disabled={initLoading}
          >
            {initLoading ? 'Initializing…' : 'Reset to Defaults'}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading modules…</p>
        </div>
      ) : modules.length === 0 ? (
        <div className="empty-state">
          <p>No modules found.</p>
          <button className="btn btn-primary" onClick={handleInitialize} disabled={initLoading}>
            {initLoading ? 'Initializing…' : 'Initialize Modules'}
          </button>
        </div>
      ) : (
        <div className="modules-grid">
          {Object.entries(grouped).map(([category, mods]) => (
            <div key={category} className="module-category">
              <h2 className="category-title">
                {CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1)}
              </h2>
              <div className="module-cards">
                {mods.map(mod => {
                  const reg = registry[mod.key];
                  return (
                    <div key={mod.key} className={`module-card ${mod.enabled ? 'enabled' : 'disabled'}`}>
                      <div className="module-info">
                        <div className="module-name-row">
                          <span className="module-name">{reg?.name ?? mod.name ?? mod.key}</span>
                          {reg?.default && (
                            <span className="badge badge-default">Default</span>
                          )}
                        </div>
                        {(reg?.description ?? mod.description) && (
                          <p className="module-description">{reg?.description ?? mod.description}</p>
                        )}
                        <code className="module-key">{mod.key}</code>
                      </div>
                      <div className="module-toggle">
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={mod.enabled}
                            disabled={saving === mod.key}
                            onChange={() => handleToggle(mod.key, mod.enabled)}
                          />
                          <span className="toggle-slider" />
                        </label>
                        <span className="toggle-label">
                          {saving === mod.key ? 'Saving…' : mod.enabled ? 'On' : 'Off'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .modules-page { padding: 24px; max-width: 1100px; margin: 0 auto; }
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }
        .page-header h1 { margin: 0 0 4px; font-size: 1.6rem; }
        .page-subtitle { margin: 0; color: #666; font-size: 0.9rem; }
        .header-actions { display: flex; align-items: center; gap: 12px; }
        .module-count { font-size: 0.85rem; color: #888; background: #f3f4f6; padding: 4px 12px; border-radius: 999px; }
        .btn { padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer; font-size: 0.875rem; transition: background 0.15s; }
        .btn-primary { background: #4f46e5; color: #fff; }
        .btn-primary:hover { background: #4338ca; }
        .btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
        .btn-secondary:hover { background: #e5e7eb; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .alert { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 0.875rem; }
        .alert-error { background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; }
        .alert-success { background: #f0fdf4; border: 1px solid #86efac; color: #16a34a; }
        .alert button { background: none; border: none; cursor: pointer; font-size: 1rem; color: inherit; padding: 0 4px; }
        .loading-state, .empty-state { text-align: center; padding: 60px 20px; color: #666; }
        .spinner { width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: #4f46e5; border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto 12px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .modules-grid { display: flex; flex-direction: column; gap: 32px; }
        .module-category {}
        .category-title { font-size: 1rem; font-weight: 600; color: #374151; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }
        .module-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
        .module-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; transition: border-color 0.15s, box-shadow 0.15s; }
        .module-card.enabled { border-color: #a5b4fc; box-shadow: 0 1px 3px rgba(99,102,241,0.1); }
        .module-card.disabled { opacity: 0.7; }
        .module-info { flex: 1; min-width: 0; }
        .module-name-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .module-name { font-weight: 600; font-size: 0.9rem; color: #111827; }
        .badge { font-size: 0.7rem; padding: 2px 8px; border-radius: 999px; }
        .badge-default { background: #dbeafe; color: #1d4ed8; }
        .module-description { font-size: 0.8rem; color: #6b7280; margin: 4px 0 8px; line-height: 1.4; }
        .module-key { font-size: 0.7rem; background: #f3f4f6; padding: 2px 6px; border-radius: 4px; color: #6b7280; }
        .module-toggle { display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; }
        .toggle-switch { position: relative; display: inline-block; width: 44px; height: 24px; }
        .toggle-switch input { opacity: 0; width: 0; height: 0; }
        .toggle-slider { position: absolute; cursor: pointer; inset: 0; background: #d1d5db; border-radius: 24px; transition: 0.2s; }
        .toggle-slider::before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: 0.2s; }
        .toggle-switch input:checked + .toggle-slider { background: #4f46e5; }
        .toggle-switch input:checked + .toggle-slider::before { transform: translateX(20px); }
        .toggle-switch input:disabled + .toggle-slider { opacity: 0.5; cursor: not-allowed; }
        .toggle-label { font-size: 0.7rem; color: #6b7280; }
      `}</style>
    </div>
  );
}
