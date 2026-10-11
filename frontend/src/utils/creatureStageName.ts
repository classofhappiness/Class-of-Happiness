// Default creatures' stage names (0-based stage index, matching server.py CREATURES[].stages[].stage).
// Key: creature_<id>_stage_<n>_name. Falls back to the English name the backend sends.
// Never use for community (user-submitted) creatures - those names are user text.
export function creatureStageName(
  t: (k: string) => string,
  creatureId: string | undefined,
  stageIndex: number,
  fallbackEnglish: string,
): string {
  if (!creatureId) return fallbackEnglish;
  const key = `creature_${creatureId}_stage_${stageIndex}_name`;
  const v = t(key);
  return v && v !== key ? v : fallbackEnglish;
}
