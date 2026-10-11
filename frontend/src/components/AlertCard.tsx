import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { formatTime, formatNumericDate } from '../utils/dateLabel';
import { EMOTION_COLOURS } from '../constants/emotionColours';
import { resolveStrategyName, strategyLabel } from '../utils/resolveStrategyName';
import { translateSupportAlertMessage } from '../utils/api';

// Item 6 (Sep 25): extracted from teacher/alerts.tsx so teacher and parent Alerts share one
// real implementation instead of two copy-pasted ones that can silently drift apart - parent
// Alerts is being rebuilt this round to mirror teacher's layout exactly (see app/parent/
// alerts.tsx), and reusing the actual component was the explicit ask rather than a second copy.
export const ZONE_COLOR: Record<string, string> = EMOTION_COLOURS;
// Real fix Sep 30 (live feedback, item 2): was a hardcoded English dict read directly
// (ZONE_LABEL[alert.zone]) with no t() call at all, so "Yellow Emotions" etc never
// translated. getZoneLabel mirrors the t('blue_zone')||t('blue_emotions') fallback pattern
// already used for this exact same label elsewhere (eg teacher/student-detail.tsx).
export const ZONE_LABEL: Record<string, string> = { blue: 'Blue Emotions', green: 'Green Emotions', yellow: 'Yellow Emotions', red: 'Red Emotions' };
export const getZoneLabel = (zone: string, t: (key: string) => string): string => {
  const key = `${zone}_zone`;
  const emoKey = `${zone}_emotions`;
  return t(key) || t(emoKey) || ZONE_LABEL[zone] || zone;
};
// Legacy fallback dictionary — kept only as a safety net for resolveStrategyName()
// (see src/utils/resolveStrategyName.ts) so nothing that used to resolve correctly
// can start showing blank/undefined. Real names now come from t() via that shared resolver.
export const STRAT: Record<string, string> = {
  b1: 'Gentle Stretch', b2: 'Drink Water', b3: 'Favourite Song', b4: 'Cosy Spot', b5: 'Tell Someone', b6: 'Slow Breathing',
  g1: 'Keep Going!', g2: 'Help a Friend', g3: 'Try Something New', g4: 'Share Your Smile', g5: 'Set a Goal', g6: 'Gratitude',
  y1: 'Bubble Breathing', y2: 'Body Shake', y3: 'Count to 10', y4: '5 Senses', y5: 'Squeeze & Release', y6: 'Talk About It',
  r1: 'Freeze', r2: 'Big Breaths', r3: 'Count Backwards', r4: 'Safe Space', r5: 'Ask for Help', r6: 'Self Hug',
  blue_1: 'Gentle Stretch', blue_2: 'Drink Water', blue_3: 'Favourite Song', blue_4: 'Cosy Spot', blue_5: 'Tell Someone', blue_6: 'Slow Breathing',
  green_1: 'Keep Going!', green_2: 'Help a Friend', green_3: 'Try Something New', green_4: 'Share Your Smile', green_5: 'Set a Goal', green_6: 'Gratitude',
  yellow_1: 'Bubble Breathing', yellow_2: 'Body Shake', yellow_3: 'Count to 10', yellow_4: '5 Senses', yellow_5: 'Squeeze & Release', yellow_6: 'Talk About It',
  red_1: 'Freeze', red_2: 'Big Breaths', red_3: 'Count Backwards', red_4: 'Safe Space', red_5: 'Ask for Help', red_6: 'Self Hug',
};

// Real fix Sep 30 (live feedback follow-up audit): matches the locale fix already applied to
// teacher/student-detail.tsx, teacher/dashboard.tsx, teacher/checkin.tsx and
// parent/linked-child/[id].tsx - toLocaleTimeString([]...)/toLocaleDateString() with no
// locale argument both follow the DEVICE's OS locale, not the app's own in-app language.
const LOCALE_FOR_LANG: Record<string,string> = { en:'en-US', pt:'pt-PT', es:'es-ES', fr:'fr-FR', de:'de-DE', it:'it-IT', hi:'hi-IN', zh:'zh-CN', ar:'ar-u-nu-latn-ca-gregory', ru:'ru-RU' };

export const AlertCard = ({ alert, onResolve, selected, selectMode, onLongPress, onPress }: any) => {
  const { t, language } = useApp();
  const alertLocale = LOCALE_FOR_LANG[language] || 'en-US';
  const zc = ZONE_COLOR[alert.zone] || '#5C6BC0';
  // Real fix Sep 11 (item 3): support_request fell into the generic else branch here and
  // rendered as a bare "Message" - no distinguishing label at all. The companion alert's
  // message field already carries the full readable type ("Student to a staff member
  // (Tom)", "Back on Track", etc. - see backend's _support_request_readable_type), so this
  // just needs its own badge, not a generic one. Parent Alerts never receives a
  // support_request alert (filtered server-side and again client-side at load), so this
  // branch is simply unused there rather than needing its own variant.
  const typeLabel = alert.alert_type === 'help_request' ? (t('help_request') || 'Help Request') :
                   alert.alert_type === 'zone_alert' ? (t('check_in_alert') || 'Check-in Alert') :
                   alert.alert_type === 'support_request' ? (t('support_request') || 'Support Request') : (t('message_label') || 'Message');
  const typeBg = alert.alert_type === 'help_request' ? '#FFF3E0' :
                 alert.alert_type === 'parent_message' ? '#EEF2FF' :
                 alert.alert_type === 'support_request' ? '#FFF3E0' : '#E8F5E9';
  const typeColor = alert.alert_type === 'help_request' ? '#E65100' :
                   alert.alert_type === 'parent_message' ? '#5C6BC0' :
                   alert.alert_type === 'support_request' ? '#FF7043' : '#2E7D32';
  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.85}
      style={{ backgroundColor: selected ? '#E8F5E9' : 'white', borderRadius:14, marginBottom:10,
        shadowColor:'#000', shadowOpacity:0.07, shadowRadius:6, elevation:3,
        borderLeftWidth:5, borderLeftColor: zc }}>
      <View style={{ padding:14 }}>
        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' }}>
          <View style={{ flex:1 }}>
            <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
              {selectMode && <MaterialIcons name={selected?'check-box':'check-box-outline-blank'} size={20} color={selected?'#4CAF50':'#CCC'} />}
              <View style={{ width:12, height:12, borderRadius:6, backgroundColor:zc }} />
              <Text style={{ fontSize:15, fontWeight:'700', color:'#222' }}>
                {alert.student_name || t('child') || 'Child'}
              </Text>
              <View style={{ backgroundColor:typeBg, borderRadius:10, paddingHorizontal:8, paddingVertical:3 }}>
                <Text style={{ fontSize:11, fontWeight:'700', color:typeColor }}>{typeLabel}</Text>
              </View>
            </View>
            <Text style={{ fontSize:12, color:'#999', marginBottom:6 }}>
              {getZoneLabel(alert.zone, t)} · {formatTime(alert.created_at, language, { twoDigitHour: true })} {formatNumericDate(alert.created_at, language)}
            </Text>
            {(alert.strategy_id || alert.strategy_name) ? (
              <Text style={{ fontSize:13, color:'#555', marginBottom:6 }}>
                {/* Real fix Sep 30 (live feedback, item 2): this used to resolve
                    alert.strategy_name — the display text the STUDENT's own device already
                    resolved to English/whatever language THEY were using at the moment they
                    tapped "help", frozen into the stored alert forever. alert.strategy_id (the
                    raw code, eg "b2"/"r3") is stored alongside it and is what resolveStrategyName
                    actually knows how to translate — falling back to strategy_name only for
                    older alerts stored before strategy_id existed. */}
                🎯 {strategyLabel(alert.strategy_id || alert.strategy_name, t, STRAT)}
              </Text>
            ) : null}
            {alert.message ? (
              <View style={{ backgroundColor: alert.alert_type === 'support_request' ? '#FFF3E0' : '#EEF2FF', borderRadius:10, padding:10, marginBottom:4,
                borderLeftWidth:4, borderLeftColor: alert.alert_type === 'support_request' ? '#FF7043' : '#5C6BC0' }}>
                <Text style={{ fontSize:11, color: alert.alert_type === 'support_request' ? '#FF7043' : '#5C6BC0', fontWeight:'700', marginBottom:3 }}>
                  {alert.alert_type === 'support_request' ? `🔔 ${t('support_request') || 'Support Request'}` : `💬 ${t('message_label') || 'Message'}`}
                </Text>
                <Text style={{ fontSize:14, color:'#111', fontWeight:'600', lineHeight:20 }}>{alert.alert_type === 'support_request' ? translateSupportAlertMessage(alert.message, t) : alert.message}</Text>
              </View>
            ) : null}
          </View>
          {/* Real fix Sep 15 (Marisa build-26, S12): a PAST alert is already resolved - the
              "mark resolved" button read as a live action on something historical. Shown as a
              plain, non-interactive check instead, same as the old read-only resolved-list
              treatment this replaced. */}
          {alert.resolved ? (
            <View style={{ padding:6, marginLeft:8 }}>
              <MaterialIcons name="check-circle" size={26} color="#4CAF50" />
            </View>
          ) : !selectMode && (
            <TouchableOpacity onPress={onResolve} style={{ padding:6, marginLeft:8 }}>
              <MaterialIcons name="check-circle-outline" size={26} color="#4CAF50" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};
