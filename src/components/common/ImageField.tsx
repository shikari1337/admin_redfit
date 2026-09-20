import React from 'react';
import ImageInputWithActions from './ImageInputWithActions';
import type { AiEntity } from '../../lib/ai';

/**
 * Compact single-image field for dense editors (A+ blocks, section items).
 * A thin wrapper over ImageInputWithActions so the four actions (Upload ·
 * Library · AI · URL), the size hint and the spec check are the SAME
 * everywhere — this used to be a second implementation with its own
 * window.prompt() "AI".
 */
export interface ImageFieldProps {
  value: string;
  onChange: (url: string) => void;
  folder?: string;
  spec?: string;
  entity?: AiEntity;
  entityId?: string | null;
  draft?: () => Record<string, any> | null | undefined;
  referenceImages?: string[];
  local?: Record<string, string | undefined>;
  label?: string;
  /** Kept for older callers; folded into `local.prompt`. */
  aiPrompt?: string;
  className?: string;
  disabled?: boolean;
}

const ImageField: React.FC<ImageFieldProps> = ({ value, onChange, folder = 'products', spec, entity, entityId, draft, referenceImages, local, label = '', aiPrompt, className = '', disabled }) => (
  <ImageInputWithActions
    value={value} onChange={onChange} folder={folder} spec={spec} entity={entity} entityId={entityId} draft={draft}
    referenceImages={referenceImages} local={{ ...(aiPrompt ? { prompt: aiPrompt } : {}), ...(local || {}) }}
    label={label} compact hideUrlInput={false} className={className} disabled={disabled}
  />
);

export default ImageField;
