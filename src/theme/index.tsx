import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';

import {
  breakpoints,
  colorThemes,
  maxContentWidth,
  radius,
  shadow,
  spacing,
  typography,
  type Breakpoint,
  type ColorTheme,
  type Colors,
} from './tokens';

export * from './tokens';

export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'] as const;

const MODE_STORAGE_KEY = 'settings.themeMode';
const COLOR_THEME_STORAGE_KEY = 'settings.colorTheme';

type Theme = {
  colors: Colors;
  scheme: 'light' | 'dark';
  /** The user's stored preference — distinct from `scheme`, which is the resolved value 'system' maps to. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** Which of the four palettes (default/emerald/burgundy/indigo) is active — independent of light/dark. */
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
  /**
   * False until the stored preference (or its absence) has been read from
   * AsyncStorage — root _layout.tsx keeps the native splash screen up
   * until this flips true, so a device with a stored 'dark'/'system'
   * preference never briefly paints the `mode: 'light'` default first and
   * flashes light-then-dark right after the (already scheme-correct)
   * splash screen disappears.
   */
  modeLoaded: boolean;
  /**
   * Same reasoning as modeLoaded, for colorTheme — a device with a stored
   * non-default color theme shouldn't flash 'default' first either. Note
   * that only the *default* theme's colors are what the native splash
   * screen itself is actually built with (app.config.js's SPLASH_BACKGROUND_
   * LIGHT/DARK are static, baked in at build time) — someone on 'emerald'
   * still briefly sees the default-colored splash before the app itself
   * loads and repaints in their chosen theme, same as anyone always has on
   * first cold start before modeLoaded/colorThemeLoaded resolve. There's no
   * way to make the native splash itself track an in-app preference; this
   * flag only prevents an *additional* default-then-chosen flash on top of
   * that once the JS side takes over.
   */
  colorThemeLoaded: boolean;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadow: typeof shadow;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  // Defaults to light rather than following the system, so a visitor whose OS
  // happens to be in dark mode is not surprised by an unrequested dark site —
  // 'system' is available, but it is a choice, not the starting point.
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [modeLoaded, setModeLoaded] = useState(false);

  const [colorTheme, setColorThemeState] = useState<ColorTheme>('default');
  const [colorThemeLoaded, setColorThemeLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(MODE_STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && stored && THEME_MODES.includes(stored as ThemeMode)) {
          setModeState(stored as ThemeMode);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setModeLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(COLOR_THEME_STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && stored && stored in colorThemes) {
          setColorThemeState(stored as ColorTheme);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setColorThemeLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(MODE_STORAGE_KEY, next).catch(() => {});
  }, []);

  const setColorTheme = useCallback((next: ColorTheme) => {
    setColorThemeState(next);
    AsyncStorage.setItem(COLOR_THEME_STORAGE_KEY, next).catch(() => {});
  }, []);

  const scheme = mode === 'system' ? systemScheme : mode;

  const value = useMemo<Theme>(
    () => ({
      colors: colorThemes[colorTheme][scheme],
      scheme,
      mode,
      setMode,
      colorTheme,
      setColorTheme,
      modeLoaded,
      colorThemeLoaded,
      spacing,
      radius,
      typography,
      shadow,
    }),
    [scheme, mode, setMode, colorTheme, setColorTheme, modeLoaded, colorThemeLoaded]
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): Theme {
  const theme = use(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}

/**
 * Layout information derived from window width.
 *
 * One component tree serves phone, tablet and desktop, so screens branch on
 * `breakpoint` / `isWide` rather than on Platform.OS. A phone in landscape and a
 * small tablet should lay out the same way, and this is what makes that true.
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const breakpoint: Breakpoint =
      width >= breakpoints.xl ? 'xl' : width >= breakpoints.lg ? 'lg' : width >= breakpoints.md ? 'md' : 'sm';

    return {
      width,
      height,
      breakpoint,
      /** Tablet and up — safe to show two panes or a sidebar. */
      isWide: width >= breakpoints.lg,
      /** Anything past a phone — grids can gain columns here. */
      isCompact: width < breakpoints.md,
      maxContentWidth,
    };
  }, [width, height]);
}
