/**
 * E-mail rules the screens share (owner 24 Nov 2026 on SM-13338: a phone number stood in an order's e-mail).
 * The server refuses an address whose e-mail box holds something else (commerce domain/shoppers/address.rs,
 * EMAIL_REFUSAL); these keep the form from sending one.
 */

/** The message for an e-mail box that holds something else (the server's own words). */
export const EMAIL_INVALID_MESSAGE = 'Enter a valid email, or leave it empty.';

/** One @, a dot in the domain, no spaces: the storefront's and the app's test. */
export const isEmailShape = (email?: string | null): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || '').trim());

/** A stand-in e-mail an order without one carries: `mobile+name@gc.mw`, or the older `@redfit.in` one. */
export const isPlaceholderEmail = (email?: string | null): boolean => {
  const e = String(email || '').trim().toLowerCase();
  return e.endsWith('@redfit.in') || /^\d{6,15}\+[a-z0-9]*@gc\.mw$/.test(e);
};

/** A customer's own e-mail, or '' when it is a stand-in or not an e-mail. */
export const ownEmailOrEmpty = (email?: string | null): string => {
  const e = String(email || '').trim();
  return e && isEmailShape(e) && !isPlaceholderEmail(e) ? e : '';
};
