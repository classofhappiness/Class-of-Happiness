import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as Linking from 'expo-linking';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';

const INDIGO = '#5C6BC0';

// New feature Sep 4 (build-26, kiosk discoverability): the pairing-code numpad at /kiosk had no
// real entry point for the classroom device receiving a code - see COH-REVIEW-PLAN.md A81's
// "orphaned door" finding. This screen is that door: reachable from a small link on the opening
// screen (app/index.tsx), it scans the QR shown by teacher/dashboard.tsx's pairing modal and
// hands the code straight to /kiosk's existing setupKiosk() flow via the autoCode param - no
// pairing logic duplicated here, this is purely an input method for that same flow. The numpad
// itself (manual entry) is always one tap away for when scanning isn't possible.
const extractCode = (data: string): string | null => {
  const raw = data.trim();
  if (/^\d{6}$/.test(raw)) return raw;
  try {
    const parsed = Linking.parse(raw);
    const code = parsed.queryParams?.code;
    if (typeof code === 'string' && /^\d{6}$/.test(code)) return code;
  } catch {}
  return null;
};

export default function KioskScanScreen() {
  const router = useRouter();
  const { t } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  const goManual = () => router.push('/kiosk');
  const goHome = () => router.push('/');

  const handleScanned = (result: BarcodeScanningResult) => {
    if (scannedRef.current) return;
    const code = extractCode(result.data);
    if (!code) return;
    scannedRef.current = true;
    router.replace({ pathname: '/kiosk', params: { autoCode: code } });
  };

  // Permission not yet resolved - avoid flashing the denied state before the OS prompt answers.
  if (!permission) {
    return <SafeAreaView style={st.container} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.centerContent}>
          <TouchableOpacity style={st.closeBtn} onPress={goHome}>
            <MaterialIcons name="close" size={26} color="white" />
          </TouchableOpacity>
          <MaterialIcons name="videocam-off" size={48} color="rgba(255,255,255,0.85)" />
          <Text style={st.deniedText}>
            {t('kiosk_scan_permission_denied') || 'Camera access is off — you can still enter the code manually.'}
          </Text>
          {permission.canAskAgain && (
            <TouchableOpacity style={st.retryBtn} onPress={requestPermission}>
              <Text style={st.retryBtnText}>{t('try_again') || 'Try Again'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={st.manualBtn} onPress={goManual}>
            <MaterialIcons name="dialpad" size={18} color={INDIGO} />
            <Text style={st.manualBtnText}>{t('kiosk_scan_manual_link') || 'Enter code manually instead'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={st.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleScanned}
      />
      <SafeAreaView style={st.overlay}>
        <TouchableOpacity style={st.closeBtn} onPress={goHome}>
          <MaterialIcons name="close" size={26} color="white" />
        </TouchableOpacity>

        <View style={st.centerContent}>
          <View style={st.viewfinder} />
          <Text style={st.hintText}>
            {t('kiosk_scan_hint') || 'Point the camera at the code your teacher is showing'}
          </Text>
        </View>

        <TouchableOpacity style={st.manualBtnOverlay} onPress={goManual}>
          <MaterialIcons name="dialpad" size={18} color="white" />
          <Text style={st.manualBtnOverlayText}>{t('kiosk_scan_manual_link') || 'Enter code manually instead'}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const VIEWFINDER_SIZE = 240;

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A2E' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  closeBtn: { alignSelf: 'flex-start', margin: 16, padding: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 20 },
  viewfinder: {
    width: VIEWFINDER_SIZE,
    height: VIEWFINDER_SIZE,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  hintText: { color: 'white', fontSize: 15, fontWeight: '600', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  deniedText: { color: 'white', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  retryBtn: { backgroundColor: INDIGO, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20 },
  retryBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  manualBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'white', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, marginTop: 8 },
  manualBtnText: { color: INDIGO, fontWeight: '700', fontSize: 14 },
  manualBtnOverlay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 28, padding: 12 },
  manualBtnOverlayText: { color: 'white', fontWeight: '600', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
});
