/**
 * Design tokens.
 *
 * The palette is warm paper and ink: aged-paper backgrounds, near-black brown
 * text, and a burnt-sienna accent borrowed from cloth book spines. Book covers
 * are the loudest thing on any screen, so the surrounding chrome stays desaturated
 * and lets them carry the colour.
 */

export const palette = {
  light: {
    background: '#F7F3EA',
    surface: '#FFFDF8',
    surfaceSunken: '#F0E9DB',
    surfaceRaised: '#FFFFFF',

    border: '#E4DACA',
    borderStrong: '#D2C4AE',

    text: '#231E18',
    textMuted: '#6C6355',
    textSubtle: '#978C7B',
    textInverted: '#FFFDF8',

    primary: '#9C4A21',
    primaryHover: '#883F1B',
    primarySoft: '#F5E4D8',
    primaryOnSoft: '#7A3916',

    accent: '#B07D2A',
    accentSoft: '#F6EBD3',

    success: '#3F7047',
    successSoft: '#E2EFE2',
    danger: '#A93326',
    dangerSoft: '#F8E3E0',
    warning: '#9A6A16',
    warningSoft: '#FAEED4',

    overlay: 'rgba(35, 30, 24, 0.45)',
    skeleton: '#EAE1D2',
  },
  dark: {
    background: '#17130F',
    surface: '#211C16',
    surfaceSunken: '#100D0A',
    surfaceRaised: '#2A241D',

    border: '#393127',
    borderStrong: '#4C4235',

    text: '#F3EDE2',
    textMuted: '#B2A695',
    textSubtle: '#867C6D',
    textInverted: '#1A1611',

    primary: '#E08A57',
    primaryHover: '#EC9A6A',
    primarySoft: '#3A271B',
    primaryOnSoft: '#F0A87A',

    accent: '#D9A94F',
    accentSoft: '#33291515',

    success: '#7FB388',
    successSoft: '#22301F',
    danger: '#E58274',
    dangerSoft: '#3A211D',
    warning: '#D6A64E',
    warningSoft: '#332812',

    overlay: 'rgba(0, 0, 0, 0.6)',
    skeleton: '#2A241D',
  },
} as const;

export type ColorName = keyof typeof palette.light;
export type Colors = Record<ColorName, string>;

/** 4pt base grid. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  micro: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
} as const;

export type TypographyVariant = keyof typeof typography;

/**
 * Width breakpoints. The same component tree serves phone, tablet and desktop,
 * so layout decisions key off these rather off platform.
 */
export const breakpoints = {
  /** phones */
  sm: 0,
  /** large phones landscape, small tablets */
  md: 600,
  /** tablets */
  lg: 900,
  /** desktop */
  xl: 1200,
} as const;

export type Breakpoint = keyof typeof breakpoints;

/** Reading measure — content stops widening past this on desktop. */
export const maxContentWidth = 1120;

export const shadow = {
  card: {
    shadowColor: '#231E18',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#231E18',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;
