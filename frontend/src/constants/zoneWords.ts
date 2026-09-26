// Shared per-colour emotion word list - extracted Sep 27 (home-screen mood-emoji press-hold
// feature) from student/zone.tsx's own getColourInfo, which already built exactly this same
// "Blue -> Tired/Sad/Bored/Lonely" style mapping for the "Need help? Tap here!" section of the
// check-in flow. Kept as the SINGLE source (zone.tsx now imports this too, instead of defining
// its own copy) so a translation added/changed once here can never drift out of sync between
// the two screens - the whole reason this was pulled out rather than duplicated.
export interface ZoneWord {
  label: string;
  emoji: string;
}

export type ZoneColour = 'blue' | 'green' | 'yellow' | 'red';

export function getZoneWords(t: (key: string) => string | undefined): Record<ZoneColour, ZoneWord[]> {
  return {
    blue: [
      { label: t('tired') || 'Tired', emoji: '😴' },
      { label: t('sad') || 'Sad', emoji: '😢' },
      { label: t('bored') || 'Bored', emoji: '😑' },
      { label: t('lonely') || 'Lonely', emoji: '🥺' },
    ],
    green: [
      { label: t('calm') || 'Calm', emoji: '😌' },
      { label: t('happy') || 'Happy', emoji: '😄' },
      { label: t('focused') || 'Focused', emoji: '🎯' },
      { label: t('ready_to_learn') || 'Ready', emoji: '🌟' },
    ],
    yellow: [
      { label: t('silly') || 'Silly', emoji: '🤪' },
      { label: t('nervous') || 'Nervous', emoji: '😰' },
      { label: t('frustrated') || 'Frustrated', emoji: '😤' },
      { label: t('worried') || 'Worried', emoji: '😟' },
    ],
    red: [
      { label: t('angry') || 'Angry', emoji: '😡' },
      { label: t('very_upset') || 'Very Upset', emoji: '😭' },
      { label: t('out_of_control') || 'Wild', emoji: '🌪️' },
      { label: t('super_charged') || 'Hyper', emoji: '⚡' },
    ],
  };
}
