const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// react-native-pager-view is native-only (see web-stubs/react-native-pager-view.js
// for the full story) and must never be bundled for web — this is the
// resolver-level guarantee that holds regardless of which bundle pass
// (client, or Expo Router's static-render pass) asks for it, since relying
// on (tabs)/_layout.web.tsx alone wasn't enough to keep it out of every pass.
const { resolveRequest: defaultResolveRequest } = config.resolver;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-pager-view') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'web-stubs/react-native-pager-view.js'),
    };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
