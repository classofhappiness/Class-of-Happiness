// Subscription wording shared by the Subscription screen and Settings: the real next-payment
// date/amount from Stripe (GET /subscription/status -> next_payment), dates with the month spelled out.
import { formatLongDate } from './dateLabel';

export type NextPayment = { date: string; amount: number; currency: string; interval: string } | null | undefined;

const COMMA_DECIMAL = new Set(['pt', 'es', 'fr', 'de', 'it', 'ru']);
const SYMBOL: Record<string, string> = { usd: '$', gbp: '£', eur: '€' };

export function formatMoney(amountMinor: number, currency: string, language: string): string {
  let n = (amountMinor / 100).toFixed(2);
  if (COMMA_DECIMAL.has(language)) n = n.replace('.', ',');
  const sym = SYMBOL[(currency || '').toLowerCase()];
  return sym ? `${sym}${n}` : `${n} ${(currency || '').toUpperCase()}`;
}

type T = (k: string) => string;

/** "Renews on 1 December 2026 - $4.99 per month". Falls back to the date alone if Stripe gave no amount. */
export function renewsLine(np: NextPayment, fallbackDateIso: string | undefined, language: string, t: T): string {
  const dateIso = np?.date || fallbackDateIso;
  if (!dateIso) return '';
  const date = formatLongDate(dateIso, language);
  if (!np) return (t('renews_on_date') || 'Renews on {date}').replace('{date}', date);
  const interval = np.interval === 'year' ? (t('billing_interval_year') || 'year') : (t('billing_interval_month') || 'month');
  return (t('renews_on_line') || 'Renews on {date} - {amount} per {interval}')
    .replace('{date}', date).replace('{amount}', formatMoney(np.amount, np.currency, language)).replace('{interval}', interval);
}

/** "Ends on 1 December 2026. You keep access until then." */
export function endsLine(dateIso: string, language: string, t: T): string {
  return (t('ends_on_line') || 'Ends on {date}. You keep access until then.').replace('{date}', formatLongDate(dateIso, language));
}
