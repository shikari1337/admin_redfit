import React, { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { api } from '../services/api';

/**
 * Read-only indicator — the store's test/live switch lives in super admin
 * (SettingsTab ▸ Environment) only. Store staff cannot change it here, but
 * must always be able to see it: in TEST mode Razorpay/SMS/WhatsApp/email are
 * all safely no-op (or sandboxed), which looks exactly like "nothing is
 * happening" unless it's called out.
 */
export const TestModeBanner: React.FC = () => {
  const [isTest, setIsTest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/settings')
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data ?? res.data ?? {};
        setIsTest(data.environment !== 'live');
      })
      .catch(() => { /* don't block the panel on this */ });
    return () => { cancelled = true; };
  }, []);

  if (!isTest) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-amber-600 flex-shrink-0" />
        <span className="text-sm font-medium text-amber-900">TEST MODE</span>
        <span className="text-xs text-amber-700">
          — no real Razorpay charges or real SMS/WhatsApp/email sends. Ask your platform admin to switch to live.
        </span>
      </div>
    </div>
  );
};
