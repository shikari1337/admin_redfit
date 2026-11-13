import React from 'react';
import { Smartphone } from 'lucide-react';
import { SectionCard } from '@/components/erp';
import { ErrorNote, Loading, useLoad } from '@/pages/panels/erp/shared';
import { KIND_WORDS } from '@/components/common/CatalogItemPicker';
import { formatDateTime } from '@/utils/date';
import { codeLabel } from '@/lib/v2/appSettings';
import { isNotServed } from '@/lib/v2/erp';
import { getCustomerAppAnswers, type AnsweredInterest } from '@/lib/v2/appGrowth';

/**
 * A CUSTOMER'S APP ANSWERS (HMAPP-3 point 4): the "who are you" and "what interests you" answers the
 * customer gave in the store's app, on their page in admin. The answers are the customer's own, kept
 * only while their consent is in force (Identity, platform 430), never used for ads. Server: lane BB,
 * `GET /api/v2/commerce/customers/{id}/app-answers` (`customers.read`), which names the persona and
 * each interest itself (the store's list, the active catalogue) and says why nothing is shown.
 */

/** The server's `state` words (`api/app_audience.rs` `CustomerAppAnswersView`), each in a sentence. */
const STATE_WORDS: Record<string, string> = {
  plane_off: 'Answers are not kept on this server: the person records are switched off.',
  not_kept: 'The place answers are kept is not set up on this server yet.',
  no_person: 'This customer has not signed in to the app with a Growcord ID, so no answers are kept.',
  not_answered: 'The customer has not answered in the app.',
  consent_withdrawn: 'The customer withdrew their consent, so nothing is kept.',
};

const kindWord = (kind: string) => codeLabel((KIND_WORDS as Record<string, string>)[kind] ?? kind);

const AppAnswersCard: React.FC<{ customerId: string }> = ({ customerId }) => {
  const answers = useLoad(() => getCustomerAppAnswers(customerId), [customerId]);
  const a = answers.data;
  const shown = !!a && a.consent && a.state === 'answered';

  const byKind = new Map<string, AnsweredInterest[]>();
  for (const i of shown ? a.interests : []) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);

  // A store or server without the app's routes has no answers to show: no card, rather than a notice on every customer.
  if (answers.error && isNotServed(answers.error)) return null;

  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-gray-500" aria-hidden />App answers</span>}
      description="What the customer told the app about themselves. Their own answers, kept only with their consent, never used for ads."
    >
      {answers.loading && !a ? <Loading label="Reading the app answers" /> : answers.error ? (
        <ErrorNote error={answers.error} what="A customer's app answers" onRetry={() => void answers.reload()} />
      ) : a && !shown ? (
        <p className="text-sm text-gray-600">{STATE_WORDS[a.state] ?? codeLabel(a.state)}</p>
      ) : a ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-gray-500">Who they are</dt>
          <dd className="text-gray-900">
            {a.persona ? (a.persona.label ?? `${a.persona.id} (no longer in the store's list)`) : 'Not answered'}
          </dd>
          <dt className="text-gray-500">Interests</dt>
          <dd>
            {byKind.size === 0 ? <span className="text-gray-900">Not answered</span> : (
              <div className="space-y-2">
                {[...byKind.entries()].map(([kind, items]) => (
                  <div key={kind}>
                    <div className="text-xs text-gray-500">{kindWord(kind)}</div>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {items.map((i) => (
                        <li key={i.id} className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs text-gray-800">
                          {i.name ?? 'An item that is no longer active'}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </dd>
          <dt className="text-gray-500">Last changed</dt>
          <dd className="text-gray-900">{formatDateTime(a.updated_at, 'Not given')}{a.answered_via ? `, in ${a.answered_via}` : ''}</dd>
        </dl>
      ) : null}
    </SectionCard>
  );
};

export default AppAnswersCard;
