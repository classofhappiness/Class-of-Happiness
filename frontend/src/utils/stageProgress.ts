// "Stage n of total" number for the creature detail line. A default creature's stage is 0-indexed, a community creature's is
// already a 1-indexed count of unlocked stages, and a community creature that has not unlocked its first stage yet is at 0.
// The line must never read "Stage 0", so the number is floored at 1.
export function stageNumber(type: 'default' | 'community', stage: number): number {
  const n = type === 'default' ? stage + 1 : stage;
  return Math.max(1, n);
}

// Fills "Stage {n} of {total}" (the stage_of_total translation).
export function stageOfTotal(template: string, n: number, total: number): string {
  return template.replace('{n}', String(n)).replace('{total}', String(total));
}

// True only at the final stage: a default creature's stage is 0-indexed (final = total - 1), a community creature's is a
// 1-indexed count of unlocked stages (final = total, so stage 3 of 4 is not finished).
export function isFinalStage(type: 'default' | 'community', stage: number, total: number): boolean {
  return type === 'default' ? stage >= total - 1 : stage >= total;
}
