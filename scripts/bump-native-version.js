#!/usr/bin/env node
//
// Bumps app.config.js's android.versionCode and/or ios.buildNumber by 1,
// in place. Used by .github/workflows/eas-build.yml right before a
// production build, so each production build gets a version code EAS has
// never used before, without relying on EAS's own "remote" appVersionSource
// counter — that counter tracked builds independently of what Google Play
// actually had on record and drifted out of sync with it (see the "Switch
// Android version code to local, manual tracking" commit). Git, via this
// file, is the only source of truth now.
//
// Usage: node scripts/bump-native-version.js <android|ios|all>

const fs = require('fs');
const path = require('path');

const platform = process.argv[2];
if (!['android', 'ios', 'all'].includes(platform)) {
  console.error('Usage: node scripts/bump-native-version.js <android|ios|all>');
  process.exit(1);
}

const configPath = path.join(__dirname, '..', 'app.config.js');
let content = fs.readFileSync(configPath, 'utf8');
const bumped = {};

if (platform === 'android' || platform === 'all') {
  const match = content.match(/versionCode:\s*(\d+),/);
  if (!match) {
    console.error('Could not find android.versionCode in app.config.js');
    process.exit(1);
  }
  const next = Number(match[1]) + 1;
  content = content.replace(/versionCode:\s*\d+,/, `versionCode: ${next},`);
  bumped.android = next;
}

if (platform === 'ios' || platform === 'all') {
  const match = content.match(/buildNumber:\s*'(\d+)',/);
  if (!match) {
    console.error("Could not find ios.buildNumber in app.config.js");
    process.exit(1);
  }
  const next = Number(match[1]) + 1;
  content = content.replace(/buildNumber:\s*'\d+',/, `buildNumber: '${next}',`);
  bumped.ios = next;
}

fs.writeFileSync(configPath, content);

for (const [key, value] of Object.entries(bumped)) {
  console.log(`${key}=${value}`);
}
