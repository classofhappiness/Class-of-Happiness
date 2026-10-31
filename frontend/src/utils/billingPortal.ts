import { Alert, Linking, Platform } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { subscriptionApi } from './api';

// Opens Stripe's own "update your card" page in the browser. Callers put the parent check in
// front of this (it shows the person's saved card details), same as checkout.
export async function openBillingPortal(t: (k: string) => string) {
  try {
    const isWeb = Platform.OS === 'web';
    const returnUrl = isWeb ? window.location.origin : ExpoLinking.createURL('subscription');
    const { url } = await subscriptionApi.createBillingPortal(returnUrl);
    if (url) {
      if (isWeb) window.location.href = url;
      else await Linking.openURL(url);
    }
  } catch {
    Alert.alert(t('error') || 'Error', t('payment_issue_error') || 'Could not open the card page. Please try again.');
  }
}
