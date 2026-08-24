import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface ReconcileUnmatched {
  awb: string;
  reference: string | null;
  courierName: string | null;
  status: string;
}

export interface ReconcileResultData {
  scanned: number;
  linked: number;
  alreadyLinked: number;
  unmatched: ReconcileUnmatched[];
}

interface ReconcileModalProps {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  result: ReconcileResultData | null;
  provider: 'shiprocket' | 'delhivery';
  /** Attach one unmatched AWB to an order number the staff types in. */
  onAttach: (orderId: string, awb: string) => Promise<void>;
}

const providerLabel: Record<string, string> = { shiprocket: 'Shiprocket', delhivery: 'Delhivery' };

const ReconcileModal: React.FC<ReconcileModalProps> = ({ isOpen, onClose, loading, result, provider, onAttach }) => {
  const [orderInputs, setOrderInputs] = useState<Record<string, string>>({});
  const [attaching, setAttaching] = useState<string | null>(null);
  const [attached, setAttached] = useState<Set<string>>(new Set());

  const handleAttach = async (awb: string) => {
    const orderId = (orderInputs[awb] || '').trim();
    if (!orderId) return;
    setAttaching(awb);
    try {
      await onAttach(orderId, awb);
      setAttached((prev) => new Set(prev).add(awb));
    } finally {
      setAttaching(null);
    }
  };

  const pending = result?.unmatched.filter((u) => !attached.has(u.awb)) ?? [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Reconcile with {providerLabel[provider] ?? provider}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Pulls shipments booked straight in the {providerLabel[provider] ?? provider} dashboard and links them back
            to their orders here.
          </p>
        </DialogHeader>

        {loading && (
          <div className="py-10 text-center text-sm text-muted-foreground">Scanning {providerLabel[provider] ?? provider}…</div>
        )}

        {!loading && result && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{result.scanned} scanned</Badge>
              <Badge variant={'success' as any}>{result.linked} newly linked</Badge>
              <Badge variant="outline">{result.alreadyLinked} already linked</Badge>
              {pending.length > 0 && <Badge variant={'warning' as any}>{pending.length} need manual match</Badge>}
            </div>

            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everything found matched (or was already linked to) a local order.</p>
            ) : (
              <div className="border rounded-md max-h-[420px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>AWB</TableHead>
                      <TableHead>Courier</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reference on {providerLabel[provider] ?? provider}</TableHead>
                      <TableHead>Attach to order</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((u) => (
                      <TableRow key={u.awb}>
                        <TableCell className="text-sm font-mono">{u.awb}</TableCell>
                        <TableCell className="text-sm">{u.courierName || '—'}</TableCell>
                        <TableCell className="text-sm">{u.status}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.reference || '(none typed)'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Input
                              className="h-8 w-32 text-xs"
                              placeholder="Order #"
                              value={orderInputs[u.awb] || ''}
                              onChange={(e) => setOrderInputs((prev) => ({ ...prev, [u.awb]: e.target.value }))}
                            />
                            <Button
                              size="sm"
                              className="h-8"
                              disabled={!orderInputs[u.awb]?.trim() || attaching === u.awb}
                              onClick={() => handleAttach(u.awb)}
                            >
                              {attaching === u.awb ? 'Attaching…' : 'Attach'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReconcileModal;
