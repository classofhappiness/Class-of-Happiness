// Resource card facts (age, time, grouping, goal, outcomes, use-when) and the
// "Start here" / week grouping used by the parent and teacher resource screens.
//
// Nothing here depends on a particular programme id: a "programme" is simply whatever topic
// tab is selected, and Start here / week headers come from each item's own week_number and
// title. The only per-programme list in the app is PRIMARY_RESOURCE_TOPIC_ORDER
// (src/constants/resourceTopics.ts), which this file does not need.

export interface ResourceFacts {
  age_min?: number | null;
  age_max?: number | null;
  duration_minutes?: number | null;
  grouping?: string | null; // comma-separated: individual, small_group, whole_class
  goal?: string | null;
  outcomes?: string | null; // ' | ' separated
  use_when?: string | null;
}

type T = (key: string) => string;
const fill = (s: string, vars: Record<string, string | number>) =>
  Object.keys(vars).reduce((acc, k) => acc.split(`{${k}}`).join(String(vars[k])), s);

export const GROUPING_CODES = ['individual', 'small_group', 'whole_class'] as const;
const GROUPING_FALLBACK: Record<string, string> = {
  individual: 'Individual',
  small_group: 'Small group',
  whole_class: 'Whole class',
};

export function groupingLabels(r: ResourceFacts, t: T): string[] {
  return (r.grouping || '')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c in GROUPING_FALLBACK)
    .map((c) => t(`resource_group_${c}`) || GROUPING_FALLBACK[c]);
}

export function agesLabel(r: ResourceFacts, t: T): string | null {
  const a = r.age_min ?? null;
  const b = r.age_max ?? null;
  if (a == null && b == null) return null;
  if (a != null && b != null && a !== b) {
    return fill(t('resource_ages_range') || 'Ages {min}–{max}', { min: a, max: b });
  }
  return fill(t('resource_age_single') || 'Age {n}', { n: (a ?? b) as number });
}

export function minutesLabel(r: ResourceFacts, t: T): string | null {
  if (!r.duration_minutes) return null;
  return fill(t('resource_minutes') || '{n} min', { n: r.duration_minutes });
}

export function outcomeList(r: ResourceFacts): string[] {
  return (r.outcomes || '').split('|').map((s) => s.trim()).filter(Boolean);
}

export const hasChips = (r: ResourceFacts) =>
  r.age_min != null || r.age_max != null || !!r.duration_minutes || !!(r.grouping || '').trim();

// ---- Start here / week sections -------------------------------------------------------

interface Sortable { week_number?: number | null; title?: string }

// Program description (week_number < 0) plus the programme's goal sheet and award
// certificate and garden journal (week 0 / no week, matched by title). Agreements, plans and forms are not.
export function isStartHere(r: Sortable): boolean {
  const w = r.week_number;
  if (w != null && w < 0) return true;
  if (w == null || w === 0) {
    const title = r.title || '';
    return /goal sheet|my goals|award|garden journal/i.test(title) && !/agreement|plan\b/i.test(title);
  }
  return false;
}

const startRank = (r: Sortable) => {
  if (r.week_number != null && r.week_number < 0) return 0;
  const title = r.title || '';
  if (/garden journal/i.test(title)) return 3;
  return /award/i.test(title) ? 2 : 1; // description, goal sheet, award, garden journal
};

export interface ResourceSection<R> {
  key: string;
  kind: 'start' | 'week' | 'more';
  week?: number;
  items: R[];
}

// Splits an already-sorted list into Start here, Week N and "more" sections. Returns null when
// the list has no weekly structure (general / hub topics), so the screen keeps its flat list.
export function buildSections<R extends Sortable>(items: R[]): ResourceSection<R>[] | null {
  const start = items.filter(isStartHere).sort((a, b) => startRank(a) - startRank(b));
  const weeks = new Map<number, R[]>();
  const more: R[] = [];
  for (const r of items) {
    if (isStartHere(r)) continue;
    const w = r.week_number;
    if (w != null && w > 0) {
      if (!weeks.has(w)) weeks.set(w, []);
      weeks.get(w)!.push(r);
    } else more.push(r);
  }
  if (weeks.size === 0 && start.length === 0) return null;
  const out: ResourceSection<R>[] = [];
  if (start.length) out.push({ key: 'start', kind: 'start', items: start });
  Array.from(weeks.keys()).sort((a, b) => a - b).forEach((w) =>
    out.push({ key: `w${w}`, kind: 'week', week: w, items: weeks.get(w)! }));
  if (more.length) out.push({ key: 'more', kind: 'more', items: more });
  return out;
}

export function sectionTitle(s: ResourceSection<any>, t: T): string {
  if (s.kind === 'start') return t('resource_start_here') || 'Start here';
  if (s.kind === 'week') return fill(t('resource_week_n') || 'Week {n}', { n: s.week as number });
  return t('resource_more') || 'More resources';
}

// Need-category label shown above a programme's list, derived from the programme id (no column).
const PROGRAMME_CATEGORY: Record<string, [string, string]> = {
  you_are_what_you_eat: ['resource_cat_food_growing', 'Food and growing'],
  coh_entrepreneur: ['resource_cat_enterprise_money', 'Enterprise and money'],
};
export function programmeCategoryLabel(topicId: string, t: T): string | null {
  const c = PROGRAMME_CATEGORY[topicId];
  return c ? t(c[0]) || c[1] : null;
}
