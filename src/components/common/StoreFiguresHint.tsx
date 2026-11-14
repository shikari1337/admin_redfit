import React from 'react';

/**
 * The store's live figures staff can type into public text (growcord-rs
 * `apps/commerce/core/src/domain/store_words.rs`, owner 14 Nov 2026): the website and the app
 * show the current amount from Shipping settings wherever one of these is typed, in page content
 * and blocks (the homepage too), the announcement bar and the notice popup. Admin keeps the
 * placeholder as typed, so changing the setting updates every text at once.
 */
export const STORE_FIGURES: Array<{ key: string; words: string }> = [
  { key: 'free_shipping_threshold', words: 'free delivery from' },
  { key: 'shipping_fee', words: 'delivery fee' },
  { key: 'cod_fee', words: 'cash on delivery fee' },
];

/** `{{free_shipping_threshold}}` as staff type it. */
export const figure = (key: string) => `{{${key}}}`;

/** One line under a text field: which placeholders show the store's current amounts. */
export const StoreFiguresHint: React.FC<{ className?: string }> = ({ className = '' }) => (
  <p className={`text-xs text-gray-500 ${className}`}>
    To show the store&apos;s current amounts, type{' '}
    {STORE_FIGURES.map((f, i) => (
      <React.Fragment key={f.key}>
        {i > 0 && (i === STORE_FIGURES.length - 1 ? ' or ' : ', ')}
        <code className="rounded bg-gray-100 px-1 font-mono text-[11px] text-gray-700">{figure(f.key)}</code> ({f.words})
      </React.Fragment>
    ))}
    . The website fills in the amount from Shipping settings, so changing the setting updates this text too.
  </p>
);

export default StoreFiguresHint;
