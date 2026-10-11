#!/usr/bin/env bash
# Class of Happiness — build & submit script
#
# Runs the whole "cut a new build" pipeline from one command instead of typing
# each EAS command by hand: bumps the version numbers in app.json, builds the
# Android APK (for the website), the Android AAB (for Play Console), and the
# iOS build, then submits the iOS build to App Store Connect.
#
# Usage (run from anywhere — it cd's into frontend/ itself):
#   ./release.sh                # bump versions, build everything, submit iOS
#   ./release.sh --skip-bump    # don't touch app.json, just build with current numbers
#   ./release.sh --android-only # only the two Android builds (skip iOS entirely)
#   ./release.sh --ios-only     # only iOS build + submit
#   ./release.sh --no-submit    # build iOS but don't auto-submit to App Store Connect
#   ./release.sh --no-preview   # skip the Android APK (website) build, AAB + iOS only
#
# Flags can be combined, e.g.: ./release.sh --ios-only --no-submit
#
# What it does NOT do (still manual — no API access set up for these):
#   - Upload the new APK to classofhappiness.com (cPanel file manager)
#   - Upload the new AAB to Google Play Console's Closed testing track
#   - Anything in TestFlight/App Store Connect beyond the initial submit
# The script prints a reminder with the exact next steps at the end.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f "app.json" ] || [ ! -f "eas.json" ]; then
  echo "❌ Couldn't find app.json/eas.json in $SCRIPT_DIR — is this script sitting in frontend/?"
  exit 1
fi

SKIP_BUMP=false
ANDROID_ONLY=false
IOS_ONLY=false
NO_SUBMIT=false
NO_PREVIEW=false

for arg in "$@"; do
  case "$arg" in
    --skip-bump) SKIP_BUMP=true ;;
    --android-only) ANDROID_ONLY=true ;;
    --ios-only) IOS_ONLY=true ;;
    --no-submit) NO_SUBMIT=true ;;
    --no-preview) NO_PREVIEW=true ;;
    *)
      echo "❌ Unknown flag: $arg"
      echo "   Valid flags: --skip-bump --android-only --ios-only --no-submit --no-preview"
      exit 1
      ;;
  esac
done

if [ "$ANDROID_ONLY" = true ] && [ "$IOS_ONLY" = true ]; then
  echo "❌ --android-only and --ios-only can't both be set."
  exit 1
fi

echo "== Class of Happiness release =="
echo

# ---- 1. Bump version numbers in app.json ----------------------------------
if [ "$SKIP_BUMP" = true ]; then
  echo "-- Skipping version bump (--skip-bump) --"
  OLD_VC=$(python3 -c "import json; print(json.load(open('app.json'))['expo']['android']['versionCode'])")
  OLD_BN=$(python3 -c "import json; print(json.load(open('app.json'))['expo']['ios']['buildNumber'])")
  NEW_VC="$OLD_VC"
  NEW_BN="$OLD_BN"
else
  echo "-- Bumping version numbers --"
  read -r OLD_VC OLD_BN NEW_VC NEW_BN <<EOF
$(python3 - <<'PYEOF'
import json
with open('app.json') as f:
    data = json.load(f)
old_vc = data['expo']['android']['versionCode']
old_bn = int(data['expo']['ios']['buildNumber'])
new_vc = old_vc + 1
new_bn = old_bn + 1
data['expo']['android']['versionCode'] = new_vc
data['expo']['ios']['buildNumber'] = str(new_bn)
with open('app.json', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
print(old_vc, old_bn, new_vc, new_bn)
PYEOF
)
EOF
  echo "   android.versionCode: $OLD_VC -> $NEW_VC"
  echo "   ios.buildNumber:     $OLD_BN -> $NEW_BN"
fi
echo

# ---- 2. Builds --------------------------------------------------------------
if [ "$IOS_ONLY" != true ]; then
  if [ "$NO_PREVIEW" != true ]; then
    echo "-- Building Android APK (preview profile, for the website) --"
    eas build --platform android --profile preview --non-interactive
    echo
  else
    echo "-- Skipping Android APK build (--no-preview) --"
    echo
  fi

  echo "-- Building Android AAB (production profile, for Play Console) --"
  eas build --platform android --profile production --non-interactive
  echo
fi

if [ "$ANDROID_ONLY" != true ]; then
  echo "-- Building iOS (production profile, for App Store Connect) --"
  eas build --platform ios --profile production --non-interactive

  if [ "$NO_SUBMIT" != true ]; then
    echo
    echo "-- Submitting iOS build to App Store Connect --"
    eas submit --platform ios --profile production --latest --non-interactive
  else
    echo
    echo "-- Skipping iOS submit (--no-submit). Run this when ready:"
    echo "   eas submit --platform ios --profile production --latest"
  fi
fi

echo
echo "== Done =="
echo "Version numbers this build: android.versionCode=$NEW_VC  ios.buildNumber=$NEW_BN"
echo
echo "Still to do by hand:"
echo "  1. Download the new APK from the EAS build page and upload it to"
echo "     classofhappiness.com (cPanel) as classofhappiness.apk (same filename,"
echo "     just overwrite it — that's the stable download link)."
echo "  2. Download the new AAB and upload it to Google Play Console ->"
echo "     Closed testing -> Alpha track (same track as before, so your testers'"
echo "     12-testers/14-day progress keeps counting)."
echo "  3. Check TestFlight in App Store Connect once the submit finishes"
echo "     processing (can take 10-60 min) — it needs no extra action from you"
echo "     unless Apple flags something."
