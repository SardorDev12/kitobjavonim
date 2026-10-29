import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * The static web export's root HTML (web only — never part of the native app).
 * Besides the usual viewport and scroll reset it carries what lets a phone
 * install the site like an app: the web manifest (Android Chrome's install
 * prompt, and iOS 16.4+), the home-screen icon iOS uses (it ignores the
 * manifest's icons), and the Safari "web app" settings so the installed copy
 * opens full-screen with a status bar that matches the app.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="uz">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />

        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="theme-color" content="#213E33" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Shelfie" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
