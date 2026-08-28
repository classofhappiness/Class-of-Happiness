// Real feature Aug 28: the fixed, curated 4-slot topic order shown first on every resource
// screen (portal and app - teacher, parent, superadmin), confirmed with Jono before building.
// This does NOT replace each screen's own full topic list (used for the upload form's topic
// picker, unchanged) - it's the ORDER the 4 primary categories are pinned to the front in,
// with any other topic that has real content still shown after them, unchanged.
//
// Topics are still hardcoded independently across 5+ places (portal RM_TOPICS, this file, and
// each of admin/dashboard.tsx, teacher/resources.tsx, parent/resources.tsx's own arrays,
// plus a backend GET /teacher-resources/topics with yet another shape) - a real, separately-
// scoped future project (genuinely admin-editable topics) was investigated and deliberately
// deferred earlier tonight. This file at least gives the APP side one shared source of truth
// for the part that must stay visually consistent across all three app screens, rather than
// hardcoding the same 4-item order a third and fourth time.
export const PRIMARY_RESOURCE_TOPIC_ORDER: string[] = [
  'emotions_program',
  'healthy_relationships',
  'leader_online',
  'you_are_what_you_eat',
];

// Reorders any topic list so the 4 primary topics above come first, in that exact order,
// followed by every other topic in the list unchanged (relative order preserved) - used by
// each screen's own TOPICS/ADMIN_RESOURCE_TOPICS array without needing to hand-reorder them.
export function orderPrimaryTopicsFirst<T extends { id: string }>(topics: T[]): T[] {
  const primary = PRIMARY_RESOURCE_TOPIC_ORDER
    .map(id => topics.find(t => t.id === id))
    .filter((t): t is T => !!t);
  const primaryIds = new Set(PRIMARY_RESOURCE_TOPIC_ORDER);
  const rest = topics.filter(t => !primaryIds.has(t.id));
  return [...primary, ...rest];
}
