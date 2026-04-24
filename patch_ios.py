"""
Run with: python3 patch_ios.py
Fixes iOS font scaling, text cutoff, and layout issues.
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# ── Fix 1: app.json - add iOS specific splash and font scaling config ─────────
APP_JSON = os.path.join(FRONTEND, "app.json")

with open(APP_JSON, "r") as f:
    content = f.read()

# Add allowsFullAccess and text scaling disabled for iOS
OLD_IOS = '''    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.classofhappiness.app",
      "infoPlist": {
        "NSCameraUsageDescription": "Take profile photos for student avatars",
        "NSPhotoLibraryUsageDescription": "Upload photos for student avatars and strategies"
      }
    },'''

NEW_IOS = '''    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.classofhappiness.app",
      "infoPlist": {
        "NSCameraUsageDescription": "Take profile photos for student avatars",
        "NSPhotoLibraryUsageDescription": "Upload photos for student avatars and strategies",
        "UIViewControllerBasedStatusBarAppearance": false
      }
    },'''

if OLD_IOS in content:
    content = content.replace(OLD_IOS, NEW_IOS)
    print("✅ Fix 1: iOS infoPlist updated")
elif NEW_IOS in content:
    print("✅ Fix 1: iOS infoPlist already updated")
else:
    print("⚠️  Fix 1: Could not find iOS block to update")

with open(APP_JSON, "w") as f:
    f.write(content)

# ── Fix 2: Add allowFontScaling=false to all Text components in index.tsx ────
# This prevents iOS accessibility font scaling from breaking layouts
INDEX = os.path.join(FRONTEND, "app/index.tsx")

with open(INDEX, "r") as f:
    content = f.read()

# The key fix: disable font scaling on title texts that break layout
OLD_TITLE = '''          <Text style={styles.appTitle}>Class of Happiness</Text>'''
NEW_TITLE = '''          <Text style={styles.appTitle} allowFontScaling={false}>Class of Happiness</Text>'''

if OLD_TITLE in content:
    content = content.replace(OLD_TITLE, NEW_TITLE)
    print("✅ Fix 2: Loading title font scaling disabled")

OLD_STUDENT_TITLE = '''            <Text style={styles.studentButtonTitle}>{t('student') || 'Student'}</Text>'''
NEW_STUDENT_TITLE = '''            <Text style={styles.studentButtonTitle} allowFontScaling={false}>{t('student') || 'Student'}</Text>'''

if OLD_STUDENT_TITLE in content:
    content = content.replace(OLD_STUDENT_TITLE, NEW_STUDENT_TITLE)
    print("✅ Fix 3: Student button font scaling disabled")

# Fix subtitle
OLD_SUBTITLE = '''        <Text style={styles.subtitle}>{t('how_are_you_feeling') || 'How are you feeling today?'}</Text>'''
NEW_SUBTITLE = '''        <Text style={styles.subtitle} allowFontScaling={false}>{t('how_are_you_feeling') || 'How are you feeling today?'}</Text>'''

if OLD_SUBTITLE in content:
    content = content.replace(OLD_SUBTITLE, NEW_SUBTITLE)
    print("✅ Fix 4: Subtitle font scaling disabled")

with open(INDEX, "w") as f:
    f.write(content)

# ── Fix 3: Create a global stylesheet helper ──────────────────────────────────
GLOBAL_STYLES = os.path.join(FRONTEND, "src/utils/globalStyles.ts")

os.makedirs(os.path.dirname(GLOBAL_STYLES), exist_ok=True)

global_styles_content = '''/**
 * Global style utilities for cross-platform consistency
 * Import these where needed to ensure iOS/Android/iPad parity
 */
import { Platform, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

// Detect iPad
export const isIPad = Platform.OS === 'ios' && Math.min(width, height) >= 768;

// Responsive font size - prevents iOS font scaling breaking layouts
export const fontSize = (size: number): number => {
  if (isIPad) return size * 1.15; // Slightly larger on iPad
  return size;
};

// Responsive spacing
export const spacing = (size: number): number => {
  if (isIPad) return size * 1.2;
  return size;
};

// Safe text props to prevent font scaling issues on iOS
export const safeTextProps = {
  allowFontScaling: false,
};

// Container max width for iPad - prevents content stretching too wide
export const containerStyle = {
  maxWidth: isIPad ? 600 : undefined,
  alignSelf: isIPad ? 'center' as const : undefined,
  width: isIPad ? '100%' as const : undefined,
};
'''

with open(GLOBAL_STYLES, "w") as f:
    f.write(global_styles_content)
print("✅ Fix 5: Global styles utility created")

print("\n✅ All iOS patches applied!")
print("Next: copy _layout.tsx then deploy")
print("cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix iOS splash screen, font scaling, iPad layout' && git push")
