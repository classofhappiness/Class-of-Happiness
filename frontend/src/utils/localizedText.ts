// Real feature Sep 21: shared picker for any object shaped `{field, field_ar, field_de, ...}`
// (default creature stage descriptions, community creature descriptions) - one implementation
// instead of separate copies per render site. Falls back to the base field for English or any
// language missing its own column/translation.
export function pickLocalized(obj: any, field: string, language: string): string | undefined {
  if (!obj) return undefined;
  const localized = obj[`${field}_${language}`];
  if (typeof localized === 'string' && localized.trim()) return localized;
  return obj[field] || undefined;
}
