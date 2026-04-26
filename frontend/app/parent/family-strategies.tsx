import React, { useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';

const ZONE_COLORS: Record<string, string> = {
  blue: '#4A90D9', green: '#4CAF50', yellow: '#FFC107', red: '#F44336',
};
const ZONE_BG: Record<string, string> = {
  blue: '#EBF3FB', green: '#E8F5E9', yellow: '#FFF8E1', red: '#FFEBEE',
};
const ZONE_NAMES: Record<string, string> = {
  blue: 'Blue Zone — Quiet Energy',
  green: 'Green Zone — Balanced Energy',
  yellow: 'Yellow Zone — Fizzing Energy',
  red: 'Red Zone — Big Energy',
};
const ZONE_DESC: Record<string, string> = {
  blue: 'Sad, tired, withdrawn, low motivation',
  green: 'Calm, happy, focused, ready to connect',
  yellow: 'Worried, frustrated, silly, losing control',
  red: 'Angry, scared, overwhelmed, out of control',
};

const FAMILY_STRATEGIES = [
  // BLUE
  { zone:'blue', name:'Side-by-Side Presence', description:'Sit quietly next to your child without expectation. No screens, no fixing — just presence. Research shows co-regulation starts with felt safety.', icon:'people', research:'Attachment theory (Bowlby)' },
  { zone:'blue', name:'Warm Drink Ritual', description:'Make a warm drink together. The act of preparing something nourishing activates the caregiving system and signals safety.', icon:'local-cafe', research:'Gottman Emotion Coaching' },
  { zone:'blue', name:'Name It to Tame It', description:'Gently name what you see: "You seem really low today." Labelling emotions reduces amygdala activation by up to 50%.', icon:'chat-bubble', research:'Siegel & Bryson (2012)' },
  { zone:'blue', name:'Movement Invitation', description:'Suggest a 5-minute walk outside. Even slow movement increases serotonin and dopamine. Invite — never force.', icon:'directions-walk', research:'Exercise & mood regulation' },
  { zone:'blue', name:'Comfort Object or Pet', description:'Encourage connection with a pet, soft toy or blanket. Physical comfort activates the parasympathetic nervous system.', icon:'pets', research:'Polyvagal Theory (Porges)' },
  { zone:'blue', name:'Lowered Expectations Day', description:'Explicitly say "Today we can take it easy." Removing performance pressure allows natural energy to return without shame.', icon:'hotel', research:'Positive Discipline (Nelsen)' },
  // GREEN
  { zone:'green', name:'Gratitude Round', description:'Each family member shares one thing they appreciated today. Builds positive neural pathways and strengthens family cohesion over time.', icon:'favorite', research:'Positive Psychology (Seligman)' },
  { zone:'green', name:'Family Dance Break', description:'Put on a favourite upbeat song and move together. Music + movement + laughter = powerful social bonding.', icon:'music-note', research:'Social rhythm therapy' },
  { zone:'green', name:'Strength Spotting', description:'Point out a specific strength: "I noticed how patient you were today." Specific praise builds a secure self-concept.', icon:'star', research:'Growth mindset (Dweck)' },
  { zone:'green', name:'Creative Together Time', description:'Draw, build, cook or make something with no goal in mind. Open-ended play activates curiosity and strengthens connection.', icon:'palette', research:'Play therapy research' },
  { zone:'green', name:'Calm Problem-Solving', description:'When things are calm, solve problems together: "What could we do differently next time?" Green zone is ideal for collaborative planning.', icon:'lightbulb', research:'Collaborative Problem Solving (Greene)' },
  { zone:'green', name:'Special One-on-One Time', description:'10-15 minutes of undivided attention where your child leads. Non-negotiable — significantly reduces attention-seeking behaviour.', icon:'child-care', research:'Attachment-based parenting' },
  // YELLOW
  { zone:'yellow', name:'Box Breathing Together', description:'Breathe in 4, hold 4, out 4, hold 4. Do it WITH your child — modelling is more powerful than instruction.', icon:'air', research:'HRV & vagal tone research' },
  { zone:'yellow', name:'Validate First Always', description:'Before solving, say "That makes sense you\'d feel that way." Validation reduces emotional intensity within 90 seconds.', icon:'volunteer-activism', research:'DBT validation (Linehan)' },
  { zone:'yellow', name:'Body Check-In', description:'Ask "Where do you feel this in your body?" Noticing physical sensations interrupts the spiral and increases interoceptive awareness.', icon:'accessibility', research:'Somatic therapy (Levine)' },
  { zone:'yellow', name:'Feelings Journal or Drawing', description:'Offer a notebook to write or draw feelings. Externalising emotions reduces intensity and builds long-term emotional literacy.', icon:'edit', research:'Expressive writing research' },
  { zone:'yellow', name:'Space with Check-Back', description:'Say "I\'ll give you 5 minutes and come back to check on you." Respects autonomy while maintaining warm connection.', icon:'timer', research:'Autonomy-supportive parenting' },
  { zone:'yellow', name:'Playful Interruption', description:'For younger children — a funny face or ridiculous sound can work. Laughter physically downregulates the stress response.', icon:'mood', research:'Playful parenting (Cohen)' },
  // RED
  { zone:'red', name:'Regulate Yourself First', description:'Your nervous system regulates theirs. Take one slow breath before responding. Children co-regulate through adult calm — not words.', icon:'self-improvement', research:'Polyvagal Theory (Porges)' },
  { zone:'red', name:'Safe Space — Not Isolation', description:'Guide your child to a quiet corner WITH you nearby. Isolation increases shame; proximity while calm reduces it.', icon:'home', research:'Attachment-based discipline' },
  { zone:'red', name:'Cold Water Reset', description:'Splash cold water on the face or hold a cold drink. This activates the dive reflex, rapidly reducing heart rate.', icon:'water', research:'Physiological self-regulation' },
  { zone:'red', name:'No Teaching in the Storm', description:'Wait until the red zone passes before discussing what happened. The reasoning brain goes offline during high arousal.', icon:'do-not-disturb', research:'Siegel — Window of Tolerance' },
  { zone:'red', name:'Reconnect Before Redirect', description:'After the storm, reconnect with warmth first: a hug, eye contact, soft voice. Only then address behaviour — calmly.', icon:'favorite-border', research:'Gottman Emotion Coaching' },
  { zone:'red', name:'Model Repair', description:'If you lost your cool, model repair: "I\'m sorry I raised my voice. Let\'s try again." Repair is more powerful than perfection.', icon:'handshake', research:'Rupture-repair cycle (Tronick)' },
];

export default function FamilyStrategiesScreen() {
  const router = useRouter();
  const { t } = useApp();
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const zones = ['green', 'blue', 'yellow', 'red'];
  const filteredStrategies = selectedZone
    ? FAMILY_STRATEGIES.filter(s => s.zone === selectedZone)
    : FAMILY_STRATEGIES;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{t('family_strategies') || 'Family Strategies'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 400); }} />}
      >
        <Text style={styles.subtitle}>
          Evidence-based strategies for parents. Tap any card to read the full strategy and its research backing.
        </Text>
        <View style={styles.infoNote}>
          <MaterialIcons name="info" size={14} color="#5C6BC0" />
          <Text style={styles.infoNoteText}>
            For educational purposes only. Not a substitute for professional advice. See disclaimer below.
          </Text>
        </View>

        {/* Zone filter tabs - matching app style */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 14, marginHorizontal: -4 }}
          contentContainerStyle={{ paddingHorizontal: 4, gap: 8, flexDirection: 'row' }}>
          <TouchableOpacity
            style={[styles.zoneChip, !selectedZone && styles.zoneChipActive]}
            onPress={() => setSelectedZone(null)}>
            <Text style={[styles.zoneChipText, !selectedZone && styles.zoneChipTextActive]}>All Zones</Text>
          </TouchableOpacity>
          {zones.map(zone => (
            <TouchableOpacity key={zone}
              style={[styles.zoneChip, selectedZone === zone && { backgroundColor: ZONE_COLORS[zone], borderColor: ZONE_COLORS[zone] }]}
              onPress={() => setSelectedZone(selectedZone === zone ? null : zone)}>
              <Text style={[styles.zoneChipText, selectedZone === zone && styles.zoneChipTextActive]}>
                {zone.charAt(0).toUpperCase() + zone.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Zone info card */}
        {selectedZone && (
          <View style={[styles.zoneInfoCard, { borderLeftColor: ZONE_COLORS[selectedZone], backgroundColor: ZONE_BG[selectedZone] }]}>
            <Text style={[styles.zoneInfoTitle, { color: ZONE_COLORS[selectedZone] }]}>{ZONE_NAMES[selectedZone]}</Text>
            <Text style={styles.zoneInfoDesc}>{ZONE_DESC[selectedZone]}</Text>
          </View>
        )}

        {/* Strategies grouped by zone */}
        {(!selectedZone ? zones : [selectedZone]).map(zone => {
          const strats = filteredStrategies.filter(s => s.zone === zone);
          if (strats.length === 0) return null;
          return (
            <View key={zone}>
              {!selectedZone && (
                <TouchableOpacity
                  style={[styles.zoneSectionHeader, { backgroundColor: ZONE_COLORS[zone] }]}
                  onPress={() => setSelectedZone(zone)} activeOpacity={0.85}>
                  <Text style={styles.zoneSectionTitle}>{ZONE_NAMES[zone]}</Text>
                  <Text style={styles.zoneSectionDesc}>{ZONE_DESC[zone]}</Text>
                </TouchableOpacity>
              )}
              {strats.map((s, i) => {
                const key = `${zone}-${i}`;
                const isOpen = expandedStrategy === key;
                return (
                  <TouchableOpacity key={key}
                    style={[styles.stratCard, { borderLeftColor: ZONE_COLORS[zone] }]}
                    onPress={() => setExpandedStrategy(isOpen ? null : key)}
                    activeOpacity={0.8}>
                    <View style={styles.stratHeader}>
                      <View style={[styles.stratIcon, { backgroundColor: ZONE_BG[zone] }]}>
                        <MaterialIcons name={s.icon as any} size={22} color={ZONE_COLORS[zone]} />
                      </View>
                      <Text style={styles.stratName}>{s.name}</Text>
                      <MaterialIcons name={isOpen ? 'expand-less' : 'expand-more'} size={20} color="#999" />
                    </View>
                    {isOpen && (
                      <View style={styles.stratBody}>
                        <Text style={styles.stratDesc}>{s.description}</Text>
                        <View style={styles.researchBadge}>
                          <MaterialIcons name="science" size={11} color="#5C6BC0" />
                          <Text style={styles.researchText}>{s.research}</Text>
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}

        {/* Research attribution */}
        <View style={styles.footer}>
          <MaterialIcons name="info-outline" size={14} color="#AAA" />
          <Text style={styles.footerText}>
            Based on Zones of Regulation, Gottman Emotion Coaching, Collaborative Problem Solving, Attachment Theory, and Polyvagal Theory.
          </Text>
        </View>

        {/* Legal disclaimer */}
        <View style={styles.disclaimer}>
          <MaterialIcons name="gavel" size={14} color="#999" />
          <Text style={styles.disclaimerText}>
            <Text style={styles.disclaimerBold}>Important Notice: </Text>
            The strategies provided in this section are for general educational and informational purposes only. They are not a substitute for professional psychological, medical, or therapeutic advice, diagnosis, or treatment.{'

'}
            If you have concerns about your child's emotional, mental, or physical health, please consult a qualified healthcare or mental health professional.{'

'}
            Class of Happiness is not liable for any outcomes resulting from the application of strategies found in this app. All strategies should be applied with parental judgement and in accordance with your child's individual needs.{'

'}
            © {new Date().getFullYear()} Class of Happiness. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#F8F9FA',
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 3,
  },
  backButton: { padding: 4 },
  topBarTitle: { fontSize: 17, fontWeight: '700', color: '#333' },
  scrollContent: { padding: 16, paddingBottom: 50 },
  subtitle: { fontSize: 13, color: '#888', marginBottom: 14, lineHeight: 18, textAlign: 'center', fontStyle: 'italic' },
  zoneChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: '#F0F0F0', borderWidth: 1.5, borderColor: '#E0E0E0' },
  zoneChipActive: { backgroundColor: '#5C6BC0', borderColor: '#5C6BC0' },
  zoneChipText: { fontSize: 13, fontWeight: '600', color: '#666' },
  zoneChipTextActive: { color: 'white' },
  zoneInfoCard: { borderLeftWidth: 4, borderRadius: 10, padding: 12, marginBottom: 14 },
  zoneInfoTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  zoneInfoDesc: { fontSize: 13, color: '#555', lineHeight: 18 },
  zoneSectionHeader: { borderRadius: 12, padding: 14, marginBottom: 8, marginTop: 8 },
  zoneSectionTitle: { fontSize: 15, fontWeight: '700', color: 'white' },
  zoneSectionDesc: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  stratCard: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  stratHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stratIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stratName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#333' },
  stratBody: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  stratDesc: { fontSize: 13, color: '#555', lineHeight: 19, marginBottom: 8 },
  researchBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  researchText: { fontSize: 10, color: '#5C6BC0', fontWeight: '500' },
  footer: { flexDirection: 'row', gap: 6, marginTop: 24, padding: 12, backgroundColor: '#F0F0F0', borderRadius: 10, alignItems: 'flex-start' },
  footerText: { fontSize: 11, color: '#999', flex: 1, lineHeight: 16 },
  infoNote: {
    flexDirection: 'row', gap: 6, marginBottom: 14, padding: 10,
    backgroundColor: '#EEF2FF', borderRadius: 8, alignItems: 'center',
  },
  infoNoteText: { fontSize: 11, color: '#5C6BC0', flex: 1, lineHeight: 15 },
  disclaimer: {
    flexDirection: 'row', gap: 8, marginTop: 12, padding: 14,
    backgroundColor: '#FFF8E1', borderRadius: 10,
    borderWidth: 1, borderColor: '#FFE082',
    alignItems: 'flex-start',
  },
  disclaimerText: { fontSize: 11, color: '#666', flex: 1, lineHeight: 17 },
  disclaimerBold: { fontWeight: '700', color: '#555' },
});
