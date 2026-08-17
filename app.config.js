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

module.exports = {
  expo: {
    name: IS_PREVIEW ? 'Kitobjavonim (Staging)' : 'Kitobjavonim',
    slug: 'home-library',
    owner: 'sardordev23',
    version: '0.1.0',
    orientation: 'default',
    icon: IS_PREVIEW ? './assets/images/icon-preview.png' : './assets/images/icon.png',
    scheme: 'homelibrary',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: 'https://u.expo.dev/212fd706-666a-4cc5-8be7-bcb524ad9a82',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: appId,
      usesAppleSignIn: true,
      infoPlist: {
        NSCameraUsageDescription:
          "The camera is used to scan a book's ISBN barcode so its details can be filled in automatically.",
        NSPhotoLibraryUsageDescription:
          'Photos are used to show the condition of books you list for exchange or sale.',
      },
    },
    android: {
      package: appId,
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
      // See the googleServicesFile comment above — these need a matching
      // Firebase Android app to not crash on init, which only the
      // production package has today.
      ...(IS_PREVIEW ? [] : ['@react-native-firebase/app', '@react-native-firebase/crashlytics']),
      [
        'expo-splash-screen',
        {
          backgroundColor: '#F5EFE4',
          dark: { backgroundColor: '#1A1714' },
          image: IS_PREVIEW ? './assets/images/splash-icon-preview.png' : './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      ],
      [
        'expo-camera',
        {
          cameraPermission:
            "The camera is used to scan a book's ISBN barcode so its details can be filled in automatically.",
        },
      ],
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
        projectId: '212fd706-666a-4cc5-8be7-bcb524ad9a82',
      },
    },
  },
};
