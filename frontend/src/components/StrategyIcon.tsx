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
const VALID_ICON_NAME = /^[a-z0-9-]+$/;

export function isRealIconName(icon: string | null | undefined): boolean {
  return !!icon && VALID_ICON_NAME.test(icon);
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
  if (icon) {
    // A non-empty value that isn't a valid icon name is treated as emoji/free text -
    // rendered in Text, sized to roughly match the icon's visual footprint.
    const style: TextStyle = { fontSize: size * 0.8, lineHeight: size, textAlign: 'center' };
    return <Text style={style}>{icon}</Text>;
  }
  return <MaterialIcons name={fallback as any} size={size} color={color} />;
}
