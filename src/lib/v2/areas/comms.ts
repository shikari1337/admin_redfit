/**
 * Communications (comms ROUTE_MAP; crm inbox): the message template catalogue, preview, test send, versions and approval sync, registrations; SMS gateway configuration and SMS/WhatsApp notification templates; the contact inbox.
 *
 * Rows follow the ROUTE_MAP to the RUNNING binary (`gc-api routes --json`): `qs` = the handler's declared query
 * fields, `bs` = its typed body, `rs` = the reply's milli-percent / minor-integer leaves (lib/v2/shape.ts applies
 * all three). `reply: wrapData` puts the answer back in the `{data, total}` wrapper the caller reads (the old route
 * answered without `success`); a `gap` row is a NAMED refusal (docs/PORT_NOTES/ADMIN-V2-2.md, "gaps").
 */
import type { V2Route } from '../routes';
import type { Spec } from '../shape';
import { wrapData, shapeBody } from '../shape';


const PREVIEW: Spec = { body: 's', channel: 's', components: ['j'], key: 's', layout: 's', subject: 's', variables: 'j' };
const SMS_CONFIG: Spec = { is_enabled: 'b', live: { api_key: 's', base_url: 's', route: 's' }, test: { api_key: 's', base_url: 's', route: 's' } };

export const COMMS_ROUTES: V2Route[] = [
  { m: 'GET', from: '/comms/templates', row: 'comms Staff (store) - /api/v2/comms', to: '/api/v2/comms/templates', qs: ['channel'] },
  { m: 'PUT', from: '/comms/templates/:key', row: 'comms Staff (store) - /api/v2/comms', method: 'POST', to: '/api/v2/comms/templates/{key}/versions', bs: {'activate':'b','body':'s','category':'s','channel':'s','components':['j'],'description':'s','language':'s','name':'s','provider':'s','provider_ref':'s','subject':'s','variables':['s']} },
  { m: 'POST', from: '/comms/templates/:key/revert', row: 'comms Staff (store) - /api/v2/comms', to: '/api/v2/comms/templates/{key}/revert', bs: {'channel':'s','language':'s'} },
  { m: 'GET', from: '/comms/templates/:key/versions', row: 'comms Staff (store) - /api/v2/comms', to: '/api/v2/comms/templates/{key}/versions', qs: ['channel','language'] },
  { m: 'GET', from: '/comms/templates/catalogue', row: 'comms Staff (store) - /api/v2/comms', to: '/api/v2/comms/templates/catalogue', qs: ['product'] },
  { m: 'POST', from: '/comms/templates/preview', row: 'comms Staff (store) - /api/v2/comms', to: '/api/v2/comms/templates/preview', bs: {'body':'s','channel':'s','components':['j'],'key':'s','layout':'s','subject':'s','variables':'j'} },
  { m: 'GET', from: '/comms/templates/preview', row: 'comms (dropped GET → POST /templates/preview)', method: 'POST', to: '/api/v2/comms/templates/preview', body: (c) => shapeBody(PREVIEW)({ ...c, body: c.query }) },
  { m: 'GET', from: '/comms/templates/registrations', row: 'comms (channel in the path)', to: (c) => (String(c.query.channel || 'sms') === 'sms' ? '/api/v2/comms/templates/registrations/sms/download' : `/api/v2/comms/templates/registrations/${encodeURIComponent(String(c.query.channel))}`), qs: ['product', 'unregistered'] },
  { m: 'POST', from: '/comms/templates/sync-approval', row: 'comms Staff (store) - /api/v2/comms', to: '/api/v2/comms/templates/approval-sync', bs: {'channel':'s'} },
  { m: 'POST', from: '/comms/templates/test-send', row: 'comms Staff (store) - /api/v2/comms', to: '/api/v2/comms/templates/test-send', bs: {'channel':'s','key':'s','to':'s','variables':'j'} },
  { m: 'GET', from: '/contact', row: 'crm Route map', to: '/api/v2/crm/inbox', qs: ['limit','offset','page','sort','q','is_read','status','source'] },
  { m: 'GET', from: '/contact/:id', row: 'crm Route map', to: '/api/v2/crm/inbox/{id}' },
  { m: 'DELETE', from: '/contact/:id', row: 'crm Route map', to: '/api/v2/crm/inbox/{id}' },
  { m: 'PUT', from: '/contact/:id/reply', row: 'crm Route map', method: 'POST', to: '/api/v2/crm/inbox/{id}/reply', bs: {'reply_message':'s'} },
  { m: 'PUT', from: '/contact/:id/status', row: 'crm Route map', method: 'PATCH', to: '/api/v2/crm/inbox/{id}', bs: {'is_read':'b','status':'s'} },
  { m: 'GET', from: '/sms-config', row: 'comms SMS / WhatsApp notification templates (l', to: '/api/v2/comms/sms-config' },
  {
    m: 'PUT', from: '/sms-config', row: 'comms sms-config (flat body → live)', method: 'PATCH', to: '/api/v2/comms/sms-config',
    body: (c) => {
      const b = c.body ?? {};
      if (b.live || b.test) return shapeBody(SMS_CONFIG)(c);
      const live: Record<string, unknown> = {};
      if (b.apiKey ?? b.api_key) live.api_key = b.apiKey ?? b.api_key;
      if (b.baseUrl ?? b.base_url) live.base_url = b.baseUrl ?? b.base_url;
      if (b.route) live.route = b.route;
      const out: Record<string, unknown> = {};
      if (b.isEnabled !== undefined || b.is_enabled !== undefined) out.is_enabled = !!(b.isEnabled ?? b.is_enabled);
      if (Object.keys(live).length) out.live = live;
      return out;
    },
  },
  { m: 'GET', from: '/sms-config/auto-map', row: 'comms SMS / WhatsApp notification templates (l', to: '/api/v2/comms/sms-config/mappings' },
  { m: 'POST', from: '/sms-config/auto-map', row: 'comms SMS / WhatsApp notification templates (l', to: '/api/v2/comms/sms-config/mappings', bs: {'events':['s']}, reply: wrapData },
  { m: 'GET', from: '/sms-config/provider-templates', row: 'comms SMS / WhatsApp notification templates (l', to: '/api/v2/comms/sms-config/provider-templates' },
  { m: 'POST', from: '/sms-config/test', row: 'comms SMS / WhatsApp notification templates (l', to: '/api/v2/comms/sms-config/connection-tests', bs: {'mode':'s'} },
  { m: 'POST', from: '/sms-config/test-sms', row: 'comms SMS / WhatsApp notification templates (l', to: '/api/v2/comms/sms-config/test-messages', bs: {'event':'s','message':'s','phone_number':'s'}, reply: wrapData },
  { m: 'GET', from: '/sms-templates', row: 'comms SMS / WhatsApp notification templates (l', to: '/api/v2/comms/sms-templates', qs: ['channel'] },
  { m: 'PUT', from: '/sms-templates/:event', row: 'comms SMS / WhatsApp notification templates (l', to: '/api/v2/comms/sms-templates/{event}', bs: {'channel':'s','content':'s','is_enabled':'b','template_id':'s','variables_hint':['s']} },
  { m: 'GET', from: '/sms-templates/catalog', row: 'comms SMS / WhatsApp notification templates (l', to: '/api/v2/comms/sms-templates/catalogue' },
  { m: 'GET', from: '/sms-templates/whatsapp/live-status', row: 'comms SMS / WhatsApp notification templates (l', to: '/api/v2/comms/sms-templates/whatsapp/status', qs: ['refresh'] },
  { m: 'POST', from: '/sms-templates/whatsapp/submit-templates', row: 'comms SMS / WhatsApp notification templates (l', to: '/api/v2/comms/sms-templates/whatsapp/submissions', bs: {'dry_run':'b','events':['s'],'keys':['s'],'product':'s'} },
];
