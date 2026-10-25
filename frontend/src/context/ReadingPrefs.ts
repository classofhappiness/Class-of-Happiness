import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Font from 'expo-font';
import { Step, isDyslexicSupported, setReadingState } from '../utils/readingStore';

// "Reading font" settings, kept on this device only. Called once, from AppProvider, and
// exposed through useApp().reading. Everything defaults to OFF.
const STORAGE_KEY = 'reading_prefs_v1';

// Loaded lazily - only when OpenDyslexic or word spacing is actually switched on - so people
// who never use these settings never pay for the font files.
const loadFonts = () =>
  Font.loadAsync({
    'OpenDyslexic-Regular': require('../../assets/fonts/OpenDyslexic-Regular.otf'),
    'OpenDyslexic-Bold': require('../../assets/fonts/OpenDyslexic-Bold.otf'),
    'OpenDyslexic-Italic': require('../../assets/fonts/OpenDyslexic-Italic.otf'),
    'OpenDyslexic-BoldItalic': require('../../assets/fonts/OpenDyslexic-BoldItalic.otf'),
  });

export interface ReadingPrefsApi {
  loaded: boolean;
  dyslexic: boolean;
  letterStep: Step;
  wordStep: Step;
  // OpenDyslexic can be used in the current app language.
  dyslexicSupported: boolean;
  setDyslexic: (v: boolean) => void;
  setLetterStep: (s: Step) => void;
  setWordStep: (s: Step) => void;
}

const asStep = (v: any): Step => (v === 1 || v === 2 || v === 3 ? v : 0);

export function useReadingPrefsState(language: string): ReadingPrefsApi {
  const [loaded, setLoaded] = useState(false);
  const [dyslexic, setDyslexicState] = useState(false);
  const [letterStep, setLetterStepState] = useState<Step>(0);
  const [wordStep, setWordStepState] = useState<Step>(0);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const p = JSON.parse(raw);
          setDyslexicState(p.dyslexic === true);
          setLetterStepState(asStep(p.letterStep));
          setWordStepState(asStep(p.wordStep));
        }
      } catch {
        // unreadable storage: stay on the defaults (everything off)
      }
      setLoaded(true);
    })();
  }, []);

  const dyslexicSupported = isDyslexicSupported(language);
  const needFonts = (dyslexic && dyslexicSupported) || wordStep > 0;

  useEffect(() => {
    if (!needFonts || fontsReady) return;
    let cancelled = false;
    loadFonts()
      .then(() => { if (!cancelled) setFontsReady(true); })
      .catch(() => { /* fonts failed: the normal font stays, spacing steps still work */ });
    return () => { cancelled = true; };
  }, [needFonts, fontsReady]);

  // Pushed into the module store during render (idempotent), so the very render in which a
  // setting changes already sees it.
  setReadingState({ dyslexic, letterStep, wordStep, language, fontsReady });

  const save = (next: { dyslexic: boolean; letterStep: Step; wordStep: Step }) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const setDyslexic = useCallback((v: boolean) => {
    setDyslexicState(v);
    save({ dyslexic: v, letterStep, wordStep });
  }, [letterStep, wordStep]);
  const setLetterStep = useCallback((s: Step) => {
    setLetterStepState(s);
    save({ dyslexic, letterStep: s, wordStep });
  }, [dyslexic, wordStep]);
  const setWordStep = useCallback((s: Step) => {
    setWordStepState(s);
    save({ dyslexic, letterStep, wordStep: s });
  }, [dyslexic, letterStep]);

  return { loaded, dyslexic, letterStep, wordStep, dyslexicSupported, setDyslexic, setLetterStep, setWordStep };
}
