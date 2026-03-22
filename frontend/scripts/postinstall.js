/**
 * Post-install script to ensure react-native-worklets is not installed
 * and react-native-reanimated stays at version 3.x (compatible with Expo Go without New Architecture)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Running post-install fixes for Expo Go compatibility...');

// Check if worklets is installed and remove it
const workletsPath = path.join(__dirname, 'node_modules', 'react-native-worklets');
if (fs.existsSync(workletsPath)) {
  console.log('Removing react-native-worklets (incompatible with New Architecture disabled)...');
  try {
    fs.rmSync(workletsPath, { recursive: true, force: true });
    console.log('Successfully removed react-native-worklets');
  } catch (e) {
    console.log('Could not remove worklets:', e.message);
  }
}

// Check reanimated version
const reanimatedPkgPath = path.join(__dirname, 'node_modules', 'react-native-reanimated', 'package.json');
if (fs.existsSync(reanimatedPkgPath)) {
  const reanimatedPkg = JSON.parse(fs.readFileSync(reanimatedPkgPath, 'utf8'));
  const version = reanimatedPkg.version;
  console.log(`react-native-reanimated version: ${version}`);
  
  // If version 4.x is installed, we have a problem
  if (version.startsWith('4.')) {
    console.log('WARNING: react-native-reanimated 4.x detected! This requires New Architecture.');
    console.log('For Expo Go compatibility, please use version 3.x');
  }
}

console.log('Post-install fixes complete.');
