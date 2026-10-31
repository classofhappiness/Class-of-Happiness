import React, { useState } from 'react';
import { Alert, Linking } from 'react-native';
import { ParentGate } from './ParentGate';

// Link resources open in the phone's browser, so they sit behind the same adult check as a purchase.
// `requestOpen(url)` asks the check first; `gate` is the element to render once in the screen.
export function useLinkGate(t: (k: string) => string) {
  const [pending, setPending] = useState<string | null>(null);
  const requestOpen = (url?: string | null) => {
    if (!url || !/^https?:\/\//i.test(url)) {
      Alert.alert(t('error') || 'Error', t('link_unavailable') || 'This link is not available.');
      return;
    }
    setPending(url);
  };
  const gate = (
    <ParentGate
      visible={!!pending}
      t={t}
      onCancel={() => setPending(null)}
      onPass={() => {
        const url = pending;
        setPending(null);
        if (url) Linking.openURL(url).catch(() => Alert.alert(t('error') || 'Error', t('link_unavailable') || 'This link is not available.'));
      }}
    />
  );
  return { requestOpen, gate };
}
