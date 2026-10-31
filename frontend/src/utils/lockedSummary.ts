import { Alert } from 'react-native';

// What the free plan holds back, worked out from the resource list a screen already has.
// "Locked" = is_locked from the server (the server's own freemium rule), so nothing here
// restates which weeks are free.
export interface LockedSummary {
  count: number;
  fromWeek: number | null;
  toWeek: number | null;
}

export function summariseLocked(items: any[], topic?: string | null): LockedSummary {
  const locked = (items || []).filter((r) => r && r.is_locked && (!topic || r.topic === topic));
  const weeks = locked
    .map((r) => Number(r.week_number))
    .filter((w) => Number.isFinite(w) && w >= 1);
  return {
    count: locked.length,
    fromWeek: weeks.length ? Math.min(...weeks) : null,
    toWeek: weeks.length ? Math.max(...weeks) : null,
  };
}

const fill = (s: string, v: Record<string, string | number>) =>
  Object.keys(v).reduce((acc, k) => acc.split(`{${k}}`).join(String(v[k])), s);

export function lockedBodyText(s: LockedSummary, t: (k: string) => string): string {
  if (s.count === 1) return t('resource_locked_body_one') || 'Unlock 1 more activity';
  if (s.fromWeek !== null && s.toWeek !== null) {
    if (s.fromWeek === s.toWeek) {
      return fill(t('resource_locked_body_week') || 'Unlock week {from}: {count} more activities', { from: s.fromWeek, count: s.count });
    }
    return fill(t('resource_locked_body_range') || 'Unlock weeks {from}–{to}: {count} more activities', { from: s.fromWeek, to: s.toWeek, count: s.count });
  }
  return fill(t('resource_locked_body_count') || 'Unlock {count} more activities', { count: s.count });
}

// The one alert behind a locked resource card (parent and teacher Resources screens).
export function showLockedResourceAlert(
  resource: any,
  loaded: any[],
  t: (k: string) => string,
  onSeePlans: () => void,
) {
  const summary = summariseLocked(loaded, resource?.topic);
  const note = t('resource_locked_free_note') || 'The Emotions Program and the first 2 weeks of every program are always free.';
  const body = summary.count > 0 ? `${lockedBodyText(summary, t)}\n\n${note}` : note;
  Alert.alert(t('resource_locked_title') || 'Part of a paid plan', body, [
    { text: t('not_now') || 'Not Now', style: 'cancel' },
    { text: t('see_plans') || 'See Plans', onPress: onSeePlans },
  ]);
}
