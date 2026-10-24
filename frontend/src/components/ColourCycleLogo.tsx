import React, { useEffect, useRef } from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  SharedValue,
  runOnJS,
  useAnimatedProps,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { EMOTION_COLOURS } from '../constants/emotionColours';
import { MARK_BARS, MARK_CHEEKS, MARK_CHEEK_COLOUR, MARK_FACE, MARK_VIEWBOX } from './logoPaths';

// The Class of Happiness mark, drawn from the SVG shapes (logoPaths.ts, generated from
// COH-logo-mark.svg). Four bars (the green one includes the three rays) each fade to the
// next colour in the fixed order green -> yellow -> red -> blue -> green.
//
// All colour comes from one elapsed-time clock. Bar i starts on colour i, so every ROUND_MS
// all four bars are exactly back on their resting colours (green top-left, yellow top-right,
// red bottom-right, blue bottom-left). Colours are interpolated in RGB.
export const HOLD_MS = 400;
export const CROSSFADE_MS = 350;
export const STEP_MS = HOLD_MS + CROSSFADE_MS; // 750
export const ROUND_MS = STEP_MS * 4; // 3000

// Settle mode (launch screen): once ready, wait for the round to finish if that is at most
// this long, otherwise ease each bar from wherever it is to its resting colour instead.
const MAX_SETTLE_WAIT_MS = 1500;
const EASE_TO_REST_MS = 450;

const CYCLE_ORDER = [
  EMOTION_COLOURS.green,
  EMOTION_COLOURS.yellow,
  EMOTION_COLOURS.red,
  EMOTION_COLOURS.blue,
];

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const CYCLE_RGB = CYCLE_ORDER.map(hexToRgb);

// Colour of bar `i` at elapsed time `e` (ms).
const barRgb = (i: number, e: number): [number, number, number] => {
  'worklet';
  const step = Math.floor(e / STEP_MS);
  const within = e - step * STEP_MS;
  const from = (i + step) % 4;
  const to = (from + 1) % 4;
  const p = within < HOLD_MS ? 0 : (within - HOLD_MS) / CROSSFADE_MS;
  const a = CYCLE_RGB[from];
  const b = CYCLE_RGB[to];
  return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p];
};

const toFill = (c: number[]) => {
  'worklet';
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
};

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface BarProps {
  index: number;
  d: string;
  elapsed: SharedValue<number>;
  easing: SharedValue<number>;
  easeStart: SharedValue<number>;
}

const Bar: React.FC<BarProps> = ({ index, d, elapsed, easing, easeStart }) => {
  const animatedProps = useAnimatedProps(() => {
    const e = elapsed.value;
    if (easing.value === 1) {
      const p = Math.min(1, Math.max(0, (e - easeStart.value) / EASE_TO_REST_MS));
      const from = barRgb(index, easeStart.value);
      const rest = CYCLE_RGB[index];
      return {
        fill: toFill([
          from[0] + (rest[0] - from[0]) * p,
          from[1] + (rest[1] - from[1]) * p,
          from[2] + (rest[2] - from[2]) * p,
        ]),
      };
    }
    return { fill: toFill(barRgb(index, e)) };
  });
  return <AnimatedPath d={d} fillRule="evenodd" fill={CYCLE_ORDER[index]} animatedProps={animatedProps} />;
};

interface Props {
  size: number;
  // true (headers): cycle forever while mounted. Default false: static, resting colours.
  loop?: boolean;
  // Launch-screen "settle" mode: cycles until this is true (and at least one full round has
  // played), then lands exactly on the resting colours and calls onSettled. Ignored if `loop`.
  settleWhen?: boolean;
  onSettled?: () => void;
  style?: ViewStyle;
}

export const ColourCycleLogo: React.FC<Props> = ({ size, loop = false, settleWhen, onSettled, style }) => {
  const reduceMotion = useReducedMotion();
  const settleMode = !loop && settleWhen !== undefined;
  const animate = (loop || settleMode) && !reduceMotion;

  const elapsed = useSharedValue(0);
  const ready = useSharedValue(0);
  // 0 = cycling, 1 = finishing the current round, 2 = easing to rest
  const mode = useSharedValue(0);
  const finishAt = useSharedValue(0);
  const easeStart = useSharedValue(0);
  const easing = useSharedValue(0);
  const settled = useSharedValue(0);

  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const notifySettled = () => onSettledRef.current?.();

  const frame = useFrameCallback((info) => {
    if (settled.value === 1) return;
    const e = info.timeSinceFirstFrame;
    if (!settleMode) {
      elapsed.value = e;
      return;
    }
    if (mode.value === 0) {
      elapsed.value = e;
      if (ready.value === 1) {
        // Always play at least one full round; after that, land on the next round boundary.
        const target = Math.max(ROUND_MS, Math.ceil(e / ROUND_MS) * ROUND_MS);
        if (target - e <= MAX_SETTLE_WAIT_MS) {
          mode.value = 1;
          finishAt.value = target;
        } else {
          mode.value = 2;
          easing.value = 1;
          easeStart.value = e;
        }
      }
    } else if (mode.value === 1) {
      if (e >= finishAt.value) {
        elapsed.value = finishAt.value; // a round boundary: exactly the resting colours
        settled.value = 1;
        runOnJS(notifySettled)();
      } else {
        elapsed.value = e;
      }
    } else {
      elapsed.value = e;
      if (e - easeStart.value >= EASE_TO_REST_MS) {
        settled.value = 1;
        runOnJS(notifySettled)();
      }
    }
  }, false);

  useEffect(() => {
    frame.setActive(animate);
    return () => frame.setActive(false);
  }, [animate]);

  useEffect(() => {
    ready.value = settleWhen ? 1 : 0;
    // No animation to wait for: report settled as soon as we are told to.
    if (settleMode && reduceMotion && settleWhen) onSettledRef.current?.();
  }, [settleWhen, settleMode, reduceMotion]);

  return (
    <View style={[{ width: size, height: size }, style]} accessibilityRole="image" accessibilityLabel="Class of Happiness logo">
      <Svg width={size} height={size} viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}>
        {MARK_BARS.map((d, i) => (
          <Bar key={i} index={i} d={d} elapsed={elapsed} easing={easing} easeStart={easeStart} />
        ))}
        {MARK_CHEEKS.map((c, i) => (
          <Circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill={MARK_CHEEK_COLOUR} />
        ))}
        <Path d={MARK_FACE} fillRule="evenodd" fill="#111111" />
      </Svg>
    </View>
  );
};
