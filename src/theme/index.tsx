import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';

import {
  breakpoints,
  maxContentWidth,
  palette,
  radius,
  shadow,
  spacing,
  typography,
  type Breakpoint,
  type Colors,
} from './tokens';

export * from './tokens';

export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system'] as const;

const STORAGE_KEY = 'settings.themeMode';

type Theme = {
  colors: Colors;
  scheme: 'light' | 'dark';
  /** The user's stored preference — distinct from `scheme`, which is the resolved value 'system' maps to. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
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

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!cancelled && stored && THEME_MODES.includes(stored as ThemeMode)) {
          setModeState(stored as ThemeMode);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const scheme = mode === 'system' ? systemScheme : mode;

  const value = useMemo<Theme>(
    () => ({
      colors: palette[scheme],
      scheme,
      mode,
      setMode,
      spacing,
      radius,
      typography,
      shadow,
    }),
    [scheme, mode, setMode]
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
