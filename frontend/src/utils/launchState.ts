import { useEffect, useState } from 'react';

// Per-app-launch state (module scope, so it resets on a cold start and survives screens
// mounting/unmounting and the app going to the background and back).
let splashFinished = false;
let homeRoundClaimed = false;
const listeners = new Set<() => void>();

// Called once by the launch overlay (SplashAnimation) when it has faded out.
export function markSplashFinished() {
  splashFinished = true;
  listeners.forEach((fn) => fn());
}

// true exactly once per launch, for the first Home lockup that asks - and only after the launch
// overlay is gone, so the round is actually seen. `enabled` false never claims it.
export function useHomeIntroRound(enabled: boolean) {
  const [play, setPlay] = useState(false);
  useEffect(() => {
    if (!enabled || homeRoundClaimed) return;
    const go = () => {
      if (homeRoundClaimed) return;
      homeRoundClaimed = true;
      setPlay(true);
    };
    if (splashFinished) {
      go();
      return;
    }
    listeners.add(go);
    return () => {
      listeners.delete(go);
    };
  }, [enabled]);
  return play;
}
