/**
 * The remaining areas (ADMIN-V2-2), one file each, in the order they were migrated. `routes.ts` reads
 * `EXTRA_ROUTES` after the first slice's areas; the matcher orders every row by literal segments, so the
 * position here never decides a match.
 */
import type { V2Route } from '../routes';
import { CHANNEL_ROUTES } from './channels';
import { TRADE_ROUTES } from './trade';
import { SHIPPING_ROUTES } from './shipping';
import { SEO_ROUTES } from './seo';
import { CART_ROUTES } from './carts';
import { DOCUMENT_ROUTES } from './documents';
import { REVIEW_ROUTES } from './reviews';
import { COMMS_ROUTES } from './comms';
import { MARKETING_ROUTES } from './marketing';
import { CONTENT_ROUTES } from './content';
import { CATALOG_ROUTES } from './catalog';
import { PAYMENT_ROUTES } from './payments';
import { PLATFORM_ROUTES } from './platform';
import { MAKE_ROUTES } from './make';
import { WMS_ROUTES } from './wms';
import { BOOKS_ROUTES } from './books';

export const EXTRA_ROUTES: V2Route[] = [
  ...CHANNEL_ROUTES,
  ...TRADE_ROUTES,
  ...SHIPPING_ROUTES,
  ...SEO_ROUTES,
  ...CART_ROUTES,
  ...DOCUMENT_ROUTES,
  ...REVIEW_ROUTES,
  ...COMMS_ROUTES,
  ...MARKETING_ROUTES,
  ...CONTENT_ROUTES,
  ...CATALOG_ROUTES,
  ...PAYMENT_ROUTES,
  ...PLATFORM_ROUTES,
  ...MAKE_ROUTES,
  ...WMS_ROUTES,
  ...BOOKS_ROUTES,
];
