import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Plug, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * One honest answer to "are my keys in, and does this actually work?"
 *
 * Integration screens used to show empty credential inputs whether or not
 * something was configured, so there was no way to tell "not set up" from
 * "set up elsewhere (.env / platform account)". This shows both facts
 * separately, because they're genuinely different questions:
 *
 *   1. CREDENTIALS — are they saved, and where do they live?
 *   2. CONNECTION  — do they actually authenticate right now?
 */

export type CredentialSource = 'store' | 'platform' | 'env' | 'none';
export type ConnState = 'unknown' | 'testing' | 'ok' | 'fail';

export interface ConnectionStatusProps {
  configured: boolean;
  source?: CredentialSource;
  /** Friendly name of the account in effect. */
  accountName?: string | null;
  /** Required fields still blank. */
  missing?: string[];
  /** Non-secret values worth echoing back (email, api url, …). */
  details?: Record<string, string | undefined>;
  connection?: ConnState;
  connectionMessage?: string;
  onTest?: () => void;
  testDisabled?: boolean;
  className?: string;
}

const SOURCE_LABEL: Record<CredentialSource, string> = {
  store: 'Your own account',
  platform: 'Platform account',
  env: 'Server config (.env)',
  none: 'Not configured',
};

const SOURCE_HINT: Record<CredentialSource, string> = {
  store: 'Billed directly by the courier to you.',
  platform: 'Uses the platform account — charges are billed to your wallet.',
  env: 'Provided by the server environment, not entered in this form.',
  none: 'Enter credentials below to enable this integration.',
};

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  configured, source = 'none', accountName, missing = [], details = {},
  connection = 'unknown', connectionMessage, onTest, testDisabled, className = '',
}) => {
  const detailEntries = Object.entries(details).filter(([, v]) => v);

  return (
    <div className={`rounded-lg border bg-muted/30 p-4 space-y-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* 1. Credentials */}
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Credentials</span>
          {configured ? (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Saved
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <AlertTriangle className="h-3 w-3" /> Not set
            </Badge>
          )}
          {configured && (
            <span className="text-xs text-muted-foreground">
              · {accountName || SOURCE_LABEL[source]}
            </span>
          )}
        </div>

        {/* 2. Connection */}
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connection</span>
          {connection === 'ok' && (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Connected
            </Badge>
          )}
          {connection === 'fail' && (
            <Badge className="bg-red-100 text-red-800 hover:bg-red-100 gap-1">
              <XCircle className="h-3 w-3" /> Failed
            </Badge>
          )}
          {connection === 'testing' && (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Testing…
            </Badge>
          )}
          {connection === 'unknown' && (
            <Badge variant="outline" className="text-muted-foreground">Not tested</Badge>
          )}
        </div>

        {onTest && (
          <Button
            type="button" size="sm" variant="outline" className="ml-auto"
            onClick={onTest}
            disabled={testDisabled || connection === 'testing' || !configured}
            title={!configured ? 'Add credentials first' : 'Check these credentials against the provider'}
          >
            {connection === 'testing'
              ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Testing…</>
              : <><Plug className="mr-2 h-3.5 w-3.5" />Test connection</>}
          </Button>
        )}
      </div>

      {/* Source explanation — why fields may look empty yet still work */}
      <p className="text-xs text-muted-foreground">{SOURCE_HINT[source]}</p>

      {/* What's still missing */}
      {!configured && missing.length > 0 && (
        <p className="text-xs text-amber-700">
          Still needed: <span className="font-medium">{missing.join(', ')}</span>
        </p>
      )}

      {/* Non-secret confirmation of what's in use */}
      {detailEntries.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {detailEntries.map(([k, v]) => (
            <span key={k}>
              <span className="uppercase tracking-wide">{k.replace(/_/g, ' ')}:</span>{' '}
              <span className="font-mono text-foreground">{v}</span>
            </span>
          ))}
        </div>
      )}

      {/* Result of the last live test */}
      {connectionMessage && connection !== 'testing' && (
        <p className={`text-xs ${connection === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
          {connectionMessage}
        </p>
      )}
    </div>
  );
};

export default ConnectionStatus;
