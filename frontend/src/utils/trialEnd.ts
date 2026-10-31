// The one place that answers "when does this account's free trial end?". The server writes the end
// to subscription_expires_at for every trial (standard and code). Trials started before that
// change have no expiry stored, so they fall back to trial_started_at + the standard length.
export function trialEndsAt(user: any, standardDays: number = 14): Date | null {
  if (!user || user.subscription_status !== 'trial') return null;
  if (user.subscription_expires_at) return new Date(user.subscription_expires_at);
  if (user.trial_started_at) {
    return new Date(new Date(user.trial_started_at).getTime() + standardDays * 24 * 60 * 60 * 1000);
  }
  return null;
}
