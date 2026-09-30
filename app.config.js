// Dynamic config, not app.json — so the "preview" (staging) build can carry
// its own package name/bundle id, app name, and icon, distinct from
// "production". Without that, both variants collide under the same Android
// package/iOS bundle id, and installing one just overwrites the other —
// there is no way to have both apps on a device side by side.
//
// EAS Build sets APP_VARIANT from each profile's own `env` block in
// eas.json (see the "preview" profile) — this file just reads it back.
// Locally (no APP_VARIANT set) this defaults to the production identity.
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';

// Shared by android.package and ios.bundleIdentifier — Android and iOS both
// use it the same way (the OS-level app identity), so one value covers both.
const appId = IS_PREVIEW ? 'uz.homelibrary.app.preview' : 'uz.homelibrary.app';

// Also has to differ, for the same reason: two apps registering the same
// homelibrary:// link means Android can't tell which one should catch a
// Telegram sign-in redirect on a device that has both installed, and shows
// its own "open with" picker instead of going straight back into the app.
// Real users only ever have the production app, so this only ever bites a
// device used for testing both builds side by side.
const scheme = IS_PREVIEW ? 'homelibrary-staging' : 'homelibrary';

// The splash screen's background, in both light and dark mode — deliberately
// the *same* value now, not each mirroring the JS light/dark theme's own
// background the way they used to. The splash always reads as light/white
// regardless of the device's system dark-mode setting; a dark-mode device
// then fades into its real (dark) theme once the app itself loads, rather
// than opening on a dark splash. That fade is intentional, not a bug:
// _layout.tsx's SystemUI-before-hideAsync sequencing already guarantees the
// app's real background is painted before the splash is ever allowed to
// reveal it, so there's nothing to flash to mid-transition — just this one
// deliberate color change for anyone whose device is in dark mode. Shared
// with the native windowBackground fix (./plugins/withAndroidSplashWindow
// Background.js) below so the two can't drift apart from each other.
const SPLASH_BACKGROUND = '#FFFDF8';

module.exports = {
  expo: {
    name: IS_PREVIEW ? 'Shelfie (Staging)' : 'Shelfie',
    slug: 'kitobjavonim',
    owner: 'walterobrien1226',
    version: '0.5.2',
    orientation: 'default',
    icon: IS_PREVIEW ? './assets/images/icon-preview.png' : './assets/images/icon.png',
    scheme,
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: 'https://u.expo.dev/8e7dc553-6986-45cd-8587-e420e18a7609',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: appId,
      usesAppleSignIn: true,
      buildNumber: '1',
      infoPlist: {
        NSCameraUsageDescription:
          'The camera is used to take photos showing the condition of books you list for exchange or sale.',
        NSPhotoLibraryUsageDescription:
          'Photos are used to show the condition of books you list for exchange or sale.',
      },
    },
    android: {
      package: appId,
      // eas.json's "cli.appVersionSource" is "local", so this is the single
      // source of truth for Android's version code — EAS Build reads it
      // from here instead of tracking its own counter on Expo's servers.
      // Bump it by hand, in the same commit as any `version` bump above,
      // same convention as the "Bump app version to X.Y.Z" commits already
      // in history.
      versionCode: 17,
      // Only the production package is registered as a Firebase Android app
      // (google-services.json is keyed to it by package name — the Google
      // Services Gradle plugin hard-fails the build if there's no matching
      // client entry for the applicationId). The preview variant skips
      // Crashlytics rather than fail the build; it can be wired up too once
      // a second Firebase Android app is registered for
      // uz.homelibrary.app.preview.
      ...(IS_PREVIEW ? {} : { googleServicesFile: './google-services.json' }),
      adaptiveIcon: {
        backgroundColor: '#172724',
        foregroundImage: IS_PREVIEW
          ? './assets/images/android-icon-foreground-preview.png'
          : './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      permissions: ['android.permission.CAMERA'],
    },
    web: {
      output: 'static',
      bundler: 'metro',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-localization',
      'expo-secure-store',
      'expo-apple-authentication',
      'expo-updates',
      'expo-navigation-bar',
      // Android-only manifest edit (see the plugin's own comment) — no
      // effect on iOS, safe to run for both variants unconditionally.
      './plugins/withDisableForceDark',
      // See the googleServicesFile comment above — these need a matching
      // Firebase Android app to not crash on init, which only the
      // production package has today.
      ...(IS_PREVIEW ? [] : ['@react-native-firebase/app', '@react-native-firebase/crashlytics']),
      [
        'expo-splash-screen',
        {
          backgroundColor: SPLASH_BACKGROUND,
          // Deliberately no `dark: {...}` here. expo-splash-screen's own
          // plugin only writes a values-night/colors.xml override for
          // splashscreen_background when a dark color is passed in — so
          // omitting it entirely means there is no night-qualified
          // resource for Android to resolve to at all, not just one that
          // happens to hold the same value. That's the difference between
          // "should always be light" and "guaranteed to always be light
          // regardless of what the OS does with dark-mode resource
          // resolution" — the former is what shipped in versionCode 17 and
          // still rendered dark on a system-dark-mode device.
          image: IS_PREVIEW ? './assets/images/splash-icon-preview.png' : './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      ],
      // See the plugin's own comment — fixes a real white/black flash
      // between the splash screen above disappearing and React Native's
      // first frame painting, by giving the app's *real* activity theme
      // (which Android switches to the instant it decides the splash is
      // done) the same background color instead of AppCompat's default.
      // No dark variant passed here either, same reasoning as the
      // expo-splash-screen config above — see this plugin's own comment.
      ['./plugins/withAndroidSplashWindowBackground', { color: SPLASH_BACKGROUND }],
      [
        'expo-image-picker',
        {
          photosPermission: 'Photos are used to show the condition of books you list for exchange or sale.',
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      eas: {
        projectId: '8e7dc553-6986-45cd-8587-e420e18a7609',
      },
    },
  },
};
