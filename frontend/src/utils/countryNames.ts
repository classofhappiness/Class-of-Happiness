// Country display helpers for the "Where are you based?" picker: names in the app language (Intl.DisplayNames when the
// phone's JS engine has it, otherwise the English name from the shared ISO list) and the device's own region for pre-fill.
import { COUNTRIES } from '../constants/countries';

const VALID = new Set(COUNTRIES.map(c => c.code));

export function localizedCountryName(code: string, language: string): string {
  const fallback = COUNTRIES.find(c => c.code === code)?.name || code;
  try {
    const DN = (Intl as any).DisplayNames;
    if (DN) {
      const name = new DN([language || 'en'], { type: 'region' }).of(code);
      if (name && name !== code) return name;
    }
  } catch {}
  return fallback;
}

// All countries sorted by their name in the app language.
export function sortedCountries(language: string): { code: string; name: string }[] {
  const list = COUNTRIES.map(c => ({ code: c.code, name: localizedCountryName(c.code, language) }));
  try {
    return list.sort((a, b) => a.name.localeCompare(b.name, language || 'en'));
  } catch {
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }
}

// The region of the phone's locale ("en-AU" -> "AU"), or null when it has none or isn't in the list.
export function deviceRegion(): string | null {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    const region = (locale.split('-').find((p, i) => i > 0 && /^[A-Za-z]{2}$/.test(p)) || '').toUpperCase();
    return VALID.has(region) ? region : null;
  } catch {
    return null;
  }
}
