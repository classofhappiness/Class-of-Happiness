import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../src/context/AppContext';

// Shown when Student is pressed and nobody is logged in: the app cannot be used without a login, and a child cannot
// log in for themselves. Deliberately plain (no story / animation yet): one message and a Login button for the adult.
export default function AskAdultLogin() {
  const { t, login } = useApp();
  return (
    <View style={styles.container}>
      <MaterialIcons name="lock-outline" size={64} color="#5C6BC0" />
      <Text style={styles.title} accessibilityRole="header">{t('ask_adult_login_title') || 'Please ask an adult to log in'}</Text>
      <Text style={styles.body}>{t('ask_adult_login_body') || 'Class of Happiness needs a grown-up to log in before it can be used.'}</Text>
      <TouchableOpacity style={styles.button} onPress={login} activeOpacity={0.85} accessibilityRole="button">
        <MaterialIcons name="login" size={22} color="white" />
        <Text style={styles.buttonText}>{t('login') || 'Login'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA', alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '800', color: '#1A1A2E', textAlign: 'center', marginTop: 20 },
  body: { fontSize: 16, lineHeight: 24, color: '#555', textAlign: 'center', marginTop: 12, marginBottom: 28 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#1A1A2E', borderRadius: 18, paddingVertical: 16, paddingHorizontal: 40, minWidth: 220 },
  buttonText: { fontSize: 18, fontWeight: '800', color: 'white' },
});
