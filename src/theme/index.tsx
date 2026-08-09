import { createContext, use, useMemo, type ReactNode } from 'react';
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

type Theme = {
  colors: Colors;
  scheme: 'light' | 'dark';
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  shadow: typeof shadow;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  const value = useMemo<Theme>(
    () => ({
      colors: palette[scheme],
      scheme,
      spacing,
      radius,
      typography,
      shadow,
    }),
    [scheme]
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
      /** Columns for a cover grid at this width. */
      gridColumns: width >= breakpoints.xl ? 6 : width >= breakpoints.lg ? 5 : width >= breakpoints.md ? 4 : 3,
    };
  }, [width, height]);
}
