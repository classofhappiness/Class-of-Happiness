import React, { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useApp } from '../context/AppContext';
import { subscriptionApi } from '../utils/api';
import { openBillingPortal } from '../utils/billingPortal';
import { PaidFeatureBanner } from './PaidFeatureBanner';
import { ParentGate } from './ParentGate';

// "Your payment didn't go through" - the same slim adult banner as the paid-feature one, shown only
// to teacher/parent accounts whose renewal payment failed and who are still inside the 7-day grace.
// It hides itself as soon as the status says the payment is sorted. Adult screens only.
export const PaymentIssueBanner: React.FC = () => {
  const { t, user } = useApp();
  const [info, setInfo] = useState<{ past_due?: boolean; in_grace?: boolean; grace_ends_at?: string | null } | null>(null);
  const [gate, setGate] = useState(false);
  const adult = user?.role === 'parent' || user?.role === 'teacher';

  useFocusEffect(
    useCallback(() => {
      if (!adult) { setInfo(null); return; }
      let alive = true;
      subscriptionApi.getStatus().then((s) => { if (alive) setInfo(s); }).catch(() => { if (alive) setInfo(null); });
      return () => { alive = false; };
    }, [adult, user?.user_id]),
  );

  const visible = adult && !!info?.past_due && !!info?.in_grace;
  return (
    <>
      <PaidFeatureBanner
        visible={visible}
        t={t}
        text={t('payment_issue_banner') || "Your payment didn't go through. Update your card to keep your plan."}
        buttonLabel={t('payment_issue_update_card') || 'Update your card'}
        storageKey={`coh.paymentBanner.${info?.grace_ends_at || 'none'}`}
        onPress={() => setGate(true)}
      />
      <ParentGate visible={gate} t={t} onCancel={() => setGate(false)} onPass={() => { setGate(false); openBillingPortal(t); }} />
    </>
  );
};
