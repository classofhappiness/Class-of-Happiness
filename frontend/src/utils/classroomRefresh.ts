// S10: decisions for AppContext.refreshClassrooms, kept pure so they can be tested.

// Who may load /classrooms. 'unknown' = the account is still loading (auth transition): the call must neither clear the
// list nor count as a fetch. Only an explicit parent/family role clears it.
export type ClassroomAccess = 'unknown' | 'parent' | 'staff';
export function classroomAccess(user: { role?: string | null } | null | undefined): ClassroomAccess {
  const role = user?.role;
  if (!role) return 'unknown';
  return role === 'parent' || role === 'family' ? 'parent' : 'staff';
}

// The 30 s "fresh enough" window is stamped only after a real successful fetch (never after a failure, a skipped call
// or an auth transition), so a failed load is retried by the next plain refresh instead of being hidden for 30 s.
export const CLASSROOMS_TTL_MS = 30000;
export function classroomsStillFresh(lastSuccessAt: number, now: number, force?: boolean): boolean {
  return !force && lastSuccessAt > 0 && now - lastSuccessAt < CLASSROOMS_TTL_MS;
}

// 401 / not-authenticated failures are an auth transition, not a load error the person should be told about.
export function isAuthTransitionError(error: unknown): boolean {
  const s = String(error);
  return s.includes('401') || s.includes('authenticated');
}
