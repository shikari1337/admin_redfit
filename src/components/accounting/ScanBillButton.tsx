import React, { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { api } from '@/services/api';
import { payload } from '@/lib/unwrap';
import { Btn } from '@/components/erp';

/**
 * SCAN A BILL — photograph it, get the form filled in, check it, then save.
 *
 * The contract is the platform's standing one: **AI proposes, a human applies.**
 * `POST /expenses/scan` writes NOTHING (its payload even says `saved: false`);
 * this button hands the proposal back to the form, the person reads it, and the
 * ordinary `POST /expenses` is still the only way an expense is recorded.
 *
 * When AI is not switched on for the store the route answers 503 with the
 * reason — shown as-is, because "nothing happened" is the worst possible answer
 * to a button someone just pressed.
 */

export interface ScanProposal {
  vendor_name: string | null;
  vendor_gstin: string | null;
  bill_no: string | null;
  expense_date: string;
  date_from_bill: boolean;
  amount_rupees: number;
  gst_rupees: number;
  gst_type: 'cgst_sgst' | 'igst' | null;
  total_rupees: number;
  category: string | null;
  account_code: string | null;
  description: string;
  place_of_supply: string | null;
  confidence: number | null;
  warnings?: string[];
}

const ScanBillButton: React.FC<{
  onProposal: (p: ScanProposal, fileName: string) => void;
  disabled?: boolean;
}> = ({ onProposal, disabled }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/expenses/scan', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const data = payload<any>(res);
      onProposal(data?.proposal as ScanProposal, file.name);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? e?.message ?? 'The bill could not be read.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <Btn variant="primary" disabled={disabled || busy} onClick={() => fileRef.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {busy ? 'Reading the bill…' : 'Scan a bill'}
      </Btn>
      {err && <span className="max-w-xs text-right text-xs text-red-600">{err}</span>}
    </div>
  );
};

export default ScanBillButton;
