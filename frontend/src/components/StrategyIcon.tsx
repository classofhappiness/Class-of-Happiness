import React from 'react';
import { Text, TextStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

// Real fix Sep 25 (item 4 reopened, round-2 device log: '"🆘" is not a valid icon name for
// family "material"', 14x on the teacher-role session): the bug isn't in source - it's in
// DATA. admin_teacher_strategies.icon is free text a school_admin types/picks when adding a
// strategy (see admin/dashboard.tsx's StrategyManager), and 35 of 39 live rows are a raw
// emoji character, not a MaterialIcons name - including the exact 🆘/🤝 this warning names,
// on the two strategy_type='teacher' rows teacher/checkin.tsx renders. Every screen that
// renders a strategy's `.icon` field as a MaterialIcons `name` prop was trusting that field
// to already be a valid icon name with no guard - correct for the `helpers`/`custom_helpers`
// tables (confirmed clean), wrong for admin_teacher_strategies, which this whole component
// exists to guard against for good, at the render site, rather than only patching today's
// specific `strategy_type='teacher'` rows that happen to be reported. A real MaterialIcons
// name is lowercase ascii letters/digits/hyphens only (e.g. 'self-improvement', 'chat',
// 'star') - anything else (an emoji, any other free-text value) renders as plain text
// instead of being handed to the icon component at all.
// Oct 10: decided by MaterialIcons' own glyph table instead of a lowercase pattern, so a lowercase value
// that is not a real icon (typo, another icon family's name) no longer reaches MaterialIcons.
export function isRealIconName(icon: string | null | undefined): boolean {
  return !!icon && Object.prototype.hasOwnProperty.call(MaterialIcons.glyphMap, icon);
}

// Plain-ASCII words/identifiers that are not icons (e.g. 'startt') are not emoji either: they fall back
// to the default icon. Anything containing a non-ASCII character (an emoji) is shown as text.
function looksLikeEmojiText(v: string): boolean {
  return /[^\x00-\x7F]/.test(v);
}

export function StrategyIcon({ icon, size = 24, color = '#333', fallback = 'star' }: {
  icon: string | null | undefined;
  size?: number;
  color?: string;
  fallback?: string;
}) {
  if (isRealIconName(icon)) {
    return <MaterialIcons name={icon as any} size={size} color={color} />;
  }
  // Oct 11: the star emoji is yellow, invisible on the yellow emotion circle. It is drawn as the star glyph in the
  // caller's colour instead (white on the coloured circles, like every other glyph icon).
  if (icon && /^[\u2B50\u{1F31F}\u2605\u2606]\uFE0F?$/u.test(icon.trim())) {
    return <MaterialIcons name="star" size={size} color={color} />;
  }
  if (icon && looksLikeEmojiText(icon)) {
    // A value with non-ASCII characters (emoji) is rendered as Text, sized to roughly match the
    // icon's visual footprint.
    const style: TextStyle = { fontSize: size * 0.8, lineHeight: size, textAlign: 'center' };
    return <Text style={style}>{icon}</Text>;
  }
  // empty or unknown: safe default icon (the caller's fallback if it is a real icon, else 'star')
  return <MaterialIcons name={(isRealIconName(fallback) ? fallback : 'star') as any} size={size} color={color} />;
}
