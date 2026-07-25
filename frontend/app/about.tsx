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
            Class of Happiness is an independent application and is not affiliated with, associated, 
            authorized, endorsed by, or in any way officially connected with Leah Kuypers, 
            Think Social Publishing, Inc., or The Zones of Regulation®. The colour-based emotional 
            awareness system used in this app was developed independently.
          </Text>
          <Text style={styles.legalText}>
            All product and company names are trademarks™ or registered® trademarks of their respective 
            holders. Use of them does not imply any affiliation with or endorsement by them.
          </Text>
          <Text style={styles.legalText}>
            This app is designed for educational and emotional awareness purposes only. It is not a 
            medical device, clinical tool, or substitute for professional mental health diagnosis, 
            therapy, or intervention. Always consult a qualified professional for clinical concerns.
          </Text>
          <Text style={styles.legalText}>
            Schools and teachers remain responsible for their own safeguarding, pastoral care, and 
            data governance obligations. Class of Happiness is a support tool and does not replace 
            any statutory duty of care.
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
            Class of Happiness is committed to protecting the privacy of all users, especially 
            children. We comply with GDPR (EU/UK) and follow COPPA principles for child safety. 
            We never sell, rent, or share personal data with advertisers or third parties.
          </Text>

          <Text style={styles.privacyHeading}>Student Safety</Text>
          <Text style={styles.legalText}>
            • We never advertise to students{'\n'}
            • Students do not create independent accounts{'\n'}
            • Student data is identified by first name and avatar only{'\n'}
            • Student check-in data is visible only to their teacher and linked parent{'\n'}
            • No location data, contacts, or device identifiers are collected from students
          </Text>

          <Text style={styles.privacyHeading}>Data We Collect</Text>
          <Text style={styles.legalText}>
            • Teachers and Parents: Email address, name, app usage data{'\n'}
            • Students: First name, avatar, emotion check-ins, strategy choices{'\n'}
            • Technical: Session tokens, language preference, anonymised error logs{'\n'}
            • We do NOT collect location data, contacts, or payment card details
          </Text>

          <Text style={styles.privacyHeading}>How We Use Your Data</Text>
          <Text style={styles.legalText}>
            Data is used only to operate the app, supporting emotional awareness for students, 
            teachers, and families. We use anonymised data to fix bugs and improve features. 
            We never use data for advertising or sell it to any third party.
          </Text>

          <Text style={styles.privacyHeading}>Third-Party Services</Text>
          <Text style={styles.legalText}>
            We use Supabase (database), Railway (hosting), Stripe (payments), and Expo 
            (push notifications). All providers are contractually required to process data 
            only as instructed and in compliance with data protection law.
          </Text>

          <Text style={styles.privacyHeading}>Your Rights (GDPR)</Text>
          <Text style={styles.legalText}>
            You have the right to access, correct, delete, or export your data at any time. 
            Parents may request review or deletion of their child's data. Contact us at 
            jono@classofhappiness.com. We respond within 30 days.
          </Text>

          <Text style={styles.privacyHeading}>Data Retention and Security</Text>
          <Text style={styles.legalText}>
            Student check-in data is retained for up to 12 months. Account data is deleted 
            within 30 days of account closure. All data is transmitted over encrypted HTTPS 
            connections. Passwords are never stored in plain text.
          </Text>

          <Text style={styles.privacyHeading}>Full Privacy Policy</Text>
          <Text style={styles.legalText}>
            Our full privacy policy is available at classofhappiness.com/privacy-policy
          </Text>
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
        <Text style={styles.footerText}>© 2026 Class of Happiness</Text>
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
