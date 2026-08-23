// Stub for react-native-pager-view on web.
//
// The real package can't be bundled for web at all — its native component
// registration statically imports react-native's native-only
// codegenNativeCommands internals, which Metro refuses to bundle for any web
// target. (tabs)/_layout.web.tsx already avoids importing the real package
// (it keeps the classic Tabs navigator instead of the swipeable PagerView),
// but Expo Router's static-render pass (web.output: 'static') doesn't seem
// to honor that per-file .web.tsx override the same way the client bundle
// does, and still resolves the native _layout.tsx — so metro.config.js
// redirects any web-platform require of this package here instead, ensuring
// it resolves to something harmless no matter which bundle pass asks for it.
// Nothing on web ever actually renders this.
const React = require('react');
const { View } = require('react-native');

function PagerView(props) {
  return React.createElement(View, props, props.children);
}
PagerView.displayName = 'PagerView';

module.exports = PagerView;
module.exports.default = PagerView;
