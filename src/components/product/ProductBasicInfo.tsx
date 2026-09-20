import React, { useState } from 'react';
import RichTextEditor from '../common/RichTextEditor';
import { AiTextButton } from '../common/AiTextButton';
import { FieldGroup, Field, fieldInputCls, fieldTextareaCls, fieldInputErrorCls } from './FormField';

interface ProductBasicInfoProps {
  name: string;
  title?: string;
  description: string;
  richDescription: string;
  onNameChange: (name: string) => void;
  onTitleChange?: (title: string) => void;
  onDescriptionChange: (description: string) => void;
  onRichDescriptionChange: (description: string) => void;
  errors: {
    name?: string;
  };
  /** Saved product id (AI context) — undefined for a new product. */
  entityId?: string | null;
  /** The unsaved form, for the AI's context. */
  draft?: () => Record<string, any> | null | undefined;
}

const ProductBasicInfo: React.FC<ProductBasicInfoProps> = ({
  name, title = '', description, richDescription,
  onNameChange, onTitleChange, onDescriptionChange, onRichDescriptionChange,
  errors, entityId, draft,
}) => {
  const [showTitle, setShowTitle] = useState(!!title);
  const ai = (field: string, label: string, value: string, onResult: (v: string) => void, format?: 'text' | 'html') => (
    <AiTextButton entity="product" entityId={entityId} draft={draft} field={field} label={label} value={value} format={format} onResult={(v) => onResult(String(v))} />
  );
  return (
    <FieldGroup title="Product details" description="The name and descriptions customers read.">
      <div className="space-y-5">

        <Field label="Product name" htmlFor="pfName" required error={errors.name}
          help="The name customers see — it also builds the web address."
          where="Product page title, listing cards, cart, invoices and search results."
          ai={ai('product.name', 'Product name', name, onNameChange)}>
          <input
            id="pfName"
            type="text"
            required
            className={errors.name ? fieldInputErrorCls : fieldInputCls}
            value={name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="e.g., Arnica Montana 30CH 30ml"
          />
        </Field>

        {onTitleChange !== undefined && !showTitle && (
          <button type="button" onClick={() => setShowTitle(true)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            + Show a different title on the storefront (optional)
          </button>
        )}
        {onTitleChange !== undefined && showTitle && (
          <Field label="Storefront title (optional)" htmlFor="pfDisplayTitle"
            help="Shown instead of the product name on your store — leave blank to just use the name."
            where="The product page heading and the browser tab."
            ai={ai('product.title', 'Storefront title', title, (v) => onTitleChange && onTitleChange(v))}>
            <input
              id="pfDisplayTitle"
              type="text"
              className={fieldInputCls}
              value={title}
              onChange={e => onTitleChange(e.target.value)}
              placeholder="Override name shown on storefront and listings"
            />
          </Field>
        )}

        <Field label="Short description" htmlFor="pfShortDesc"
          help="1–2 sentences shown on product cards and in search results."
          where="Product cards, the top of the product page, search results and the default meta description."
          ai={ai('product.short_desc', 'Short description', description, onDescriptionChange)}>
          <textarea
            id="pfShortDesc"
            rows={3}
            className={fieldTextareaCls}
            value={description}
            onChange={e => onDescriptionChange(e.target.value)}
            placeholder="1–2 sentence summary shown in search results and category grids…"
          />
        </Field>

        <Field label="Full description"
          help="The long description on the product page — use the toolbar for headings, lists and links."
          where="The Description tab on the product page; the Page content tab can override it per product."
          ai={ai('product.long_desc', 'Full description', richDescription, onRichDescriptionChange, 'html')}>
          <RichTextEditor
            value={richDescription}
            onChange={onRichDescriptionChange}
            placeholder="Detailed product description — use the toolbar to format headings, lists, links…"
            minHeight={220}
          />
        </Field>

      </div>
    </FieldGroup>
  );
};

export default ProductBasicInfo;
