import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../src/context/AppContext';

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useApp();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <ScrollView 
      style={[styles.container, { paddingBottom: insets.bottom }]}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>About Class of Happiness</Text>
      
      <Text style={styles.description}>
        Class of Happiness helps students, teachers, and families understand and manage emotions 
        through awareness and helpful strategies.
      </Text>

      {/* Disclaimer Section */}
      <TouchableOpacity 
        style={styles.sectionHeader}
        onPress={() => toggleSection('disclaimer')}
        activeOpacity={0.7}
      >
        <View style={styles.sectionTitleRow}>
          <MaterialIcons name="info-outline" size={24} color="#5C6BC0" />
          <Text style={styles.sectionTitle}>Disclaimer</Text>
        </View>
        <MaterialIcons 
          name={expandedSection === 'disclaimer' ? 'expand-less' : 'expand-more'} 
          size={24} 
          color="#666" 
        />
      </TouchableOpacity>
      {expandedSection === 'disclaimer' && (
        <View style={styles.sectionContent}>
          <Text style={styles.legalText}>
            This application, Class of Happiness, is an independent creation and is not affiliated with, 
            associated, authorized, endorsed by, or in any way officially connected with Leah Kuypers 
            or The Zones of Regulation®.
          </Text>
          <Text style={styles.legalText}>
            All product and company names are trademarks™ or registered® trademarks of their respective 
            holders. Use of them does not imply any affiliation with or endorsement by them.
          </Text>
          <Text style={styles.legalText}>
            This app is intended for general informational and educational purposes only and does not 
            constitute professional or medical advice.
          </Text>
        </View>
      )}

      {/* Privacy Policy Section */}
      <TouchableOpacity 
        style={styles.sectionHeader}
        onPress={() => toggleSection('privacy')}
        activeOpacity={0.7}
      >
        <View style={styles.sectionTitleRow}>
          <MaterialIcons name="privacy-tip" size={24} color="#5C6BC0" />
          <Text style={styles.sectionTitle}>Privacy Policy</Text>
        </View>
        <MaterialIcons 
          name={expandedSection === 'privacy' ? 'expand-less' : 'expand-more'} 
          size={24} 
          color="#666" 
        />
      </TouchableOpacity>
      {expandedSection === 'privacy' && (
        <View style={styles.sectionContent}>
          <Text style={styles.privacyHeading}>Our Commitment to Privacy</Text>
          <Text style={styles.legalText}>
            Class of Happiness is committed to protecting the privacy of all users, especially children. 
            We comply with COPPA (Children's Online Privacy Protection Act) in the US and GDPR 
            (General Data Protection Regulation) in the EU/UK.
          </Text>

          <Text style={styles.privacyHeading}>Data We Collect</Text>
          <Text style={styles.legalText}>
            • Account Information: Email address (for login only){'\n'}
            • Profile Data: Name, avatar choice, classroom assignment{'\n'}
            • Usage Data: Emotion check-ins, selected strategies, and optional notes{'\n'}
            • We do NOT collect location data, contacts, or device identifiers
          </Text>

          <Text style={styles.privacyHeading}>How We Use Your Data</Text>
          <Text style={styles.legalText}>
            All data is used solely for the app's core functionality:{'\n'}
            • To track daily mood history{'\n'}
            • To support students, teachers, and families with tools of emotional awareness{'\n'}
            • To provide personalized strategy suggestions{'\n'}
            • To enable teachers and parents to monitor emotional wellness
          </Text>

          <Text style={styles.privacyHeading}>Third-Party Sharing</Text>
          <Text style={styles.legalText}>
            We do NOT sell, rent, or share your personal data with advertisers or third-party 
            marketing companies. Your data stays within the app ecosystem and is only shared 
            between linked accounts (e.g., teacher-student or parent-child connections) that 
            you explicitly authorize.
          </Text>

          <Text style={styles.privacyHeading}>Parental Rights</Text>
          <Text style={styles.legalText}>
            Parents and guardians have the right to:{'\n'}
            • Review their child's personal information{'\n'}
            • Request deletion of any stored data at any time{'\n'}
            • Refuse further collection of their child's data{'\n'}
            • Contact us at any time regarding their child's privacy
          </Text>

          <Text style={styles.privacyHeading}>Data Deletion</Text>
          <Text style={styles.legalText}>
            To request deletion of your data or your child's data, please contact us through 
            the app settings or email. We will process deletion requests within 30 days.
          </Text>

          <Text style={styles.privacyHeading}>Data Security</Text>
          <Text style={styles.legalText}>
            We use industry-standard encryption and security measures to protect your data. 
            All data is transmitted securely and stored on protected servers.
          </Text>
        </View>
      )}

      {/* Terms of Use Section */}
      <TouchableOpacity 
        style={styles.sectionHeader}
        onPress={() => toggleSection('terms')}
        activeOpacity={0.7}
      >
        <View style={styles.sectionTitleRow}>
          <MaterialIcons name="description" size={24} color="#5C6BC0" />
          <Text style={styles.sectionTitle}>Terms of Use</Text>
        </View>
        <MaterialIcons 
          name={expandedSection === 'terms' ? 'expand-less' : 'expand-more'} 
          size={24} 
          color="#666" 
        />
      </TouchableOpacity>
      {expandedSection === 'terms' && (
        <View style={styles.sectionContent}>
          <Text style={styles.legalText}>
            By using Class of Happiness, you agree to use the app for its intended educational 
            and informational purposes. The app is designed to support emotional awareness and 
            is not a substitute for professional mental health services.
          </Text>
          <Text style={styles.legalText}>
            Users are responsible for maintaining the confidentiality of their account credentials. 
            Teachers and parents should supervise children's use of the app as appropriate.
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Version 1.0.6</Text>
        <Text style={styles.footerText}>© 2025 Class of Happiness</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 24,
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  sectionContent: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    marginTop: -4,
  },
  privacyHeading: {
    fontSize: 16,
    fontWeight: '600',
    color: '#5C6BC0',
    marginTop: 16,
    marginBottom: 8,
  },
  legalText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
    marginBottom: 12,
  },
  footer: {
    marginTop: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#999',
    marginBottom: 4,
  },
});
