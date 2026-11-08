/** A Meta page's title, its line of description, its actions, the connection chip and the development-data notice. */
import React from 'react';
import { metaMockOn, type MetaSetup } from '@/lib/v2/areas/meta';
import { StateChip } from './common';

const MetaHeader: React.FC<{ title?: string; setup: MetaSetup | null; description?: React.ReactNode; actions?: React.ReactNode }> = ({ title = 'Facebook and Instagram', setup, description, actions }) => {
  const conn = setup?.connection ?? null;
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {description ?? 'Sell from your catalog on Facebook, Instagram and WhatsApp, tag products in your posts and run Meta ads, all from here.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {setup && (
            conn
              ? <StateChip tone={conn.status === 'connected' ? 'good' : 'warn'}>{conn.status === 'connected' ? `Connected as ${conn.connected_as ?? 'your Meta account'}` : conn.status.replace(/_/g, ' ')}</StateChip>
              : <StateChip tone="warn">Not connected</StateChip>
          )}
        </div>
      </div>
      {metaMockOn() && (
        <p className="rounded-md border border-dashed border-violet-300 bg-violet-50 px-3 py-2 text-xs text-violet-800">
          Sample data for a development preview. Nothing here comes from or goes to Meta.
        </p>
      )}
    </>
  );
};

export default MetaHeader;
