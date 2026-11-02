import { useSyncExternalStore } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  UNLOCK_PERM, inventoryLockSnapshot, lockInventory, lockedMessage, lockedTitle, refreshInventoryLock,
  subscribeInventoryLock, unlockInventory, type InventoryLockSnapshot,
} from '../lib/v2/inventoryLock';

export interface InventoryLock extends InventoryLockSnapshot {
  /** Manual stock changes are refused right now. False while unknown or not served. */
  locked: boolean;
  /** "the ERP" or the connection's own name. */
  label: string;
  /** The banner sentence. */
  message: string;
  /** Tooltip for a control the lock has switched off — undefined when not locked. */
  why: string | undefined;
  /** May unlock / lock again (admin only, `inventory.delete`). */
  canUnlock: boolean;
  reload: () => Promise<void>;
  unlock: (reason: string) => Promise<void>;
  lock: (reason?: string) => Promise<void>;
}

/**
 * The store's inventory lock (DEC-069). One shared copy across every screen: the first
 * component that asks loads it, a lock / unlock / refused save refreshes it for all.
 */
export function useInventoryLock(): InventoryLock {
  const snap = useSyncExternalStore(subscribeInventoryLock, inventoryLockSnapshot, inventoryLockSnapshot);
  const { hasPerm } = useAuth();
  const locked = !!snap.state?.locked;
  const label = snap.erpLabel || 'the ERP';
  return {
    ...snap,
    locked,
    label,
    message: lockedMessage(label),
    why: locked ? lockedTitle(label) : undefined,
    canUnlock: hasPerm(UNLOCK_PERM),
    reload: refreshInventoryLock,
    unlock: unlockInventory,
    lock: lockInventory,
  };
}

export default useInventoryLock;
