/**
 * Editors for the block types the page builder advertised but could not edit.
 *
 * GET /pages/block-types returns 19 types; only 12 had an editor, so the rest
 * fell through to a raw JSON textarea — which is why half the fields looked
 * missing. Each type here gets real inputs: upload-or-URL images, an icon
 * picker, and HTML content through the rich-text editor. The matching
 * renderers live in ecom (components/blocks) and the storefront.
 */
import React from 'react';
import IconPicker from '../IconPicker';
import ImageInputWithActions from '../common/ImageInputWithActions';
import { TextField, NumberField, HtmlField, ItemsField } from './BlockEditors';

type EditorProps = { data: any; onChange: (data: any) => void; pageId?: string };

export const TestimonialsBlockEditor: React.FC<EditorProps> = ({ data, onChange, pageId }) => (
  <div className="space-y-4">
    <TextField label="Section Title" value={data?.title} onChange={(v) => onChange({ ...data, title: v })} placeholder="What our customers say" />
    <TextField label="Subtitle" value={data?.subtitle} onChange={(v) => onChange({ ...data, subtitle: v })} placeholder="Optional intro line" />
    <ItemsField
      label="Testimonials" addLabel="Add Testimonial"
      items={data?.items}
      onChange={(items) => onChange({ ...data, items })}
      blank={() => ({ name: '', role: '', quote: '', rating: 5, avatar: '' })}
      render={(item: any, set) => (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <TextField label="Name" value={item.name} onChange={(v) => set({ name: v })} placeholder="Customer name" />
            <TextField label="Role / Location" value={item.role} onChange={(v) => set({ role: v })} placeholder="Verified buyer" />
          </div>
          <HtmlField label="Quote" value={item.quote} onChange={(v) => set({ quote: v })} minHeight={90} placeholder="What they said…" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
            <NumberField label="Rating (1-5)" value={item.rating} onChange={(v) => set({ rating: v })} min={1} />
            <ImageInputWithActions value={item.avatar || ''} onChange={(url) => set({ avatar: url })}
              label="Avatar" placeholder="Upload or paste URL" productId={pageId} sectionId="testimonials" fieldPath="avatar" />
          </div>
        </>
      )}
    />
  </div>
);

export const VideoBlockEditor: React.FC<EditorProps> = ({ data, onChange, pageId }) => (
  <div className="space-y-4">
    <TextField label="Title" value={data?.title} onChange={(v) => onChange({ ...data, title: v })} placeholder="Section title" />
    <TextField label="Video URL" value={data?.url} onChange={(v) => onChange({ ...data, url: v })}
      placeholder="https://youtube.com/watch?v=... or an .mp4 URL" />
    <ImageInputWithActions value={data?.poster || ''} onChange={(url) => onChange({ ...data, poster: url })}
      label="Poster / Thumbnail" placeholder="Upload or paste URL" productId={pageId} sectionId="video" fieldPath="poster" />
    <HtmlField label="Caption" value={data?.caption} onChange={(v) => onChange({ ...data, caption: v })} minHeight={90} />
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" checked={data?.autoplay === true}
        onChange={(e) => onChange({ ...data, autoplay: e.target.checked })} />
      Autoplay (muted)
    </label>
  </div>
);

export const GalleryBlockEditor: React.FC<EditorProps> = ({ data, onChange, pageId }) => (
  <div className="space-y-4">
    <TextField label="Title" value={data?.title} onChange={(v) => onChange({ ...data, title: v })} placeholder="Gallery title" />
    <NumberField label="Columns" value={data?.columns} onChange={(v) => onChange({ ...data, columns: v })} min={1} placeholder="3" />
    <ItemsField
      label="Images" addLabel="Add Image"
      items={data?.images}
      onChange={(images) => onChange({ ...data, images })}
      blank={() => ({ url: '', alt: '', caption: '', link: '' })}
      render={(item: any, set, i) => (
        <>
          <ImageInputWithActions value={item.url || ''} onChange={(url) => set({ url })}
            label="Image" placeholder="Upload or paste URL" productId={pageId} sectionId="gallery" fieldPath={'images.' + i + '.url'} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <TextField label="Alt text" value={item.alt} onChange={(v) => set({ alt: v })} placeholder="Describes the image" />
            <TextField label="Caption" value={item.caption} onChange={(v) => set({ caption: v })} placeholder="Shown under the image" />
          </div>
          <TextField label="Links to (optional)" value={item.link} onChange={(v) => set({ link: v })} placeholder="/products/..." />
        </>
      )}
    />
  </div>
);

export const StatsBlockEditor: React.FC<EditorProps> = ({ data, onChange }) => (
  <div className="space-y-4">
    <TextField label="Title" value={data?.title} onChange={(v) => onChange({ ...data, title: v })} placeholder="By the numbers" />
    <ItemsField
      label="Stats" addLabel="Add Stat"
      items={data?.items}
      onChange={(items) => onChange({ ...data, items })}
      blank={() => ({ icon: '', value: '', label: '', suffix: '' })}
      render={(item: any, set) => (
        <>
          <IconPicker value={item.icon} onChange={(icon) => set({ icon })} label="Icon" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <TextField label="Value" value={item.value} onChange={(v) => set({ value: v })} placeholder="10,000" />
            <TextField label="Suffix" value={item.suffix} onChange={(v) => set({ suffix: v })} placeholder="+" />
            <TextField label="Label" value={item.label} onChange={(v) => set({ label: v })} placeholder="Happy customers" />
          </div>
        </>
      )}
    />
  </div>
);

export const TimelineBlockEditor: React.FC<EditorProps> = ({ data, onChange, pageId }) => (
  <div className="space-y-4">
    <TextField label="Title" value={data?.title} onChange={(v) => onChange({ ...data, title: v })} placeholder="Our journey" />
    <ItemsField
      label="Milestones" addLabel="Add Milestone"
      items={data?.items}
      onChange={(items) => onChange({ ...data, items })}
      blank={() => ({ date: '', title: '', description: '', icon: '', image: '' })}
      render={(item: any, set, i) => (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <TextField label="Date / Year" value={item.date} onChange={(v) => set({ date: v })} placeholder="2024" />
            <TextField label="Title" value={item.title} onChange={(v) => set({ title: v })} placeholder="Milestone" />
          </div>
          <HtmlField label="Description" value={item.description} onChange={(v) => set({ description: v })} minHeight={90} />
          <IconPicker value={item.icon} onChange={(icon) => set({ icon })} label="Icon" />
          <ImageInputWithActions value={item.image || ''} onChange={(url) => set({ image: url })}
            label="Image (optional)" placeholder="Upload or paste URL" productId={pageId} sectionId="timeline" fieldPath={'items.' + i + '.image'} />
        </>
      )}
    />
  </div>
);

export const PricingBlockEditor: React.FC<EditorProps> = ({ data, onChange }) => (
  <div className="space-y-4">
    <TextField label="Title" value={data?.title} onChange={(v) => onChange({ ...data, title: v })} placeholder="Plans & pricing" />
    <TextField label="Subtitle" value={data?.subtitle} onChange={(v) => onChange({ ...data, subtitle: v })} />
    <ItemsField
      label="Plans" addLabel="Add Plan"
      items={data?.plans}
      onChange={(plans) => onChange({ ...data, plans })}
      blank={() => ({ name: '', price: '', period: '', features: [], ctaText: '', ctaLink: '', highlighted: false })}
      render={(item: any, set) => (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <TextField label="Plan name" value={item.name} onChange={(v) => set({ name: v })} placeholder="Starter" />
            <TextField label="Price" value={item.price} onChange={(v) => set({ price: v })} placeholder="999" />
            <TextField label="Period" value={item.period} onChange={(v) => set({ period: v })} placeholder="/month" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Features (one per line)</label>
            <textarea
              value={Array.isArray(item.features) ? item.features.join('\n') : (item.features ?? '')}
              onChange={(e) => set({ features: e.target.value.split('\n').map((s: string) => s.trim()).filter(Boolean) } as any)}
              rows={4} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="Unlimited products" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <TextField label="Button text" value={item.ctaText} onChange={(v) => set({ ctaText: v })} placeholder="Choose plan" />
            <TextField label="Button link" value={item.ctaLink} onChange={(v) => set({ ctaLink: v })} placeholder="/checkout" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={item.highlighted === true} onChange={(e) => set({ highlighted: e.target.checked } as any)} />
            Highlight this plan
          </label>
        </>
      )}
    />
  </div>
);

export const ContactFormBlockEditor: React.FC<EditorProps> = ({ data, onChange }) => (
  <div className="space-y-4">
    <TextField label="Title" value={data?.title} onChange={(v) => onChange({ ...data, title: v })} placeholder="Get in touch" />
    <HtmlField label="Intro text" value={data?.description} onChange={(v) => onChange({ ...data, description: v })} minHeight={90} />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <TextField label="Submit button text" value={data?.submitText} onChange={(v) => onChange({ ...data, submitText: v })} placeholder="Send message" />
      <TextField label="Success message" value={data?.successMessage} onChange={(v) => onChange({ ...data, successMessage: v })} placeholder="Thanks, we will be in touch." />
    </div>
    <TextField label="Send enquiries to (email)" type="email" value={data?.recipientEmail}
      onChange={(v) => onChange({ ...data, recipientEmail: v })} placeholder="Blank = the store's contact email" />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={data?.showPhone !== false} onChange={(e) => onChange({ ...data, showPhone: e.target.checked })} />
        Ask for phone number
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={data?.showSubject === true} onChange={(e) => onChange({ ...data, showSubject: e.target.checked })} />
        Ask for a subject
      </label>
    </div>
  </div>
);
