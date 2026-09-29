/**
 * Design tokens.
 *
 * Four selectable color themes (Settings → Appearance → Color theme), each
 * still warm-paper-and-ink underneath: background, surface, border and text
 * are identical across all four (and between light/dark within a theme, the
 * same relationship the original already had) — only primary/accent, the
 * "book binding" color, actually changes. success/danger/warning also stay
 * fixed across themes on purpose: they're status colors, not brand identity,
 * and should mean the same thing regardless of which theme is active.
 *
 * 'default' is the original, unchanged palette — burnt-sienna primary,
 * ochre accent, aged paper. The other three were proposed as an explicit
 * alternative-and-let-people-pick request:
 * - 'emerald': forest-green cloth binding, gilt page-edge gold accent.
 * - 'burgundy': wine-leather binding, the same gilt gold.
 * - 'indigo': fountain-pen-ink blue, the same gilt gold — the most
 *   contemporary-reading of the three, least "obviously a book" at a glance.
 */

const neutrals = {
  light: {
    // Deliberately identical to `surface`, not just close to it — this was
    // briefly '#F5EFE4' (an aged-paper tan) to match the native splash
    // screen's own configured color, but every card/the tab bar/etc. use
    // `surface` underneath, and against a visibly tan page background
    // instead of the near-white it used to be, that tiny, previously
    // invisible gap between the two read as two different background
    // colors split across the screen. Matching them exactly is what "one
    // color" actually requires; see app.config.js's SPLASH_BACKGROUND_LIGHT
    // (kept in sync with this value) for the native side of that fix. Only
    // 'default' actually drives the native splash — see ThemeProvider's own
    // comment on colorTheme for why the other three can't.
    background: '#FFFDF8',
    surface: '#FFFDF8',
    surfaceSunken: '#F0E9DB',
    surfaceRaised: '#FFFFFF',

    border: '#E4DACA',
    borderStrong: '#D2C4AE',

    text: '#231E18',
    textMuted: '#6C6355',
    textSubtle: '#978C7B',
    textInverted: '#FFFDF8',

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
    // Same fix as light.background above — identical to `surface`.
    background: '#211C16',
    surface: '#211C16',
    surfaceSunken: '#100D0A',
    surfaceRaised: '#2A241D',

    border: '#393127',
    borderStrong: '#4C4235',

    text: '#F3EDE2',
    textMuted: '#B2A695',
    textSubtle: '#867C6D',
    textInverted: '#1A1611',

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

// The shared "gilt page edge" gold the three new themes all use for accent —
// only their primary ("binding color") actually differs from one another.
const gilt = {
  light: { accent: '#C9A24B', accentSoft: '#F5EBD3' },
  dark: { accent: '#E0C179', accentSoft: '#33290F' },
} as const;

export const colorThemes = {
  // The original palette, unchanged — burnt-sienna primary, ochre accent.
  default: {
    light: {
      ...neutrals.light,
      primary: '#9C4A21',
      primaryHover: '#883F1B',
      primarySoft: '#F5E4D8',
      primaryOnSoft: '#7A3916',
      accent: '#B07D2A',
      accentSoft: '#F6EBD3',
    },
    dark: {
      ...neutrals.dark,
      primary: '#E08A57',
      primaryHover: '#EC9A6A',
      primarySoft: '#3A271B',
      primaryOnSoft: '#F0A87A',
      accent: '#D9A94F',
      accentSoft: '#33291515',
    },
  },
  // Forest-green cloth binding.
  emerald: {
    light: {
      ...neutrals.light,
      ...gilt.light,
      primary: '#1F5C4A',
      primaryHover: '#174A3B',
      primarySoft: '#E1EEE7',
      primaryOnSoft: '#164536',
    },
    dark: {
      ...neutrals.dark,
      ...gilt.dark,
      primary: '#5CAF8E',
      primaryHover: '#6FC29F',
      primarySoft: '#1B3229',
      primaryOnSoft: '#8FD6B6',
    },
  },
  // Wine-leather binding, brass hardware.
  burgundy: {
    light: {
      ...neutrals.light,
      ...gilt.light,
      primary: '#7A2635',
      primaryHover: '#5E1E2A',
      primarySoft: '#F1E1E3',
      primaryOnSoft: '#5C1D29',
    },
    dark: {
      ...neutrals.dark,
      ...gilt.dark,
      primary: '#D97A88',
      primaryHover: '#E4909C',
      primarySoft: '#331A1F',
      primaryOnSoft: '#F0AEB7',
    },
  },
  // Fountain-pen ink, linen dust jacket — the most contemporary-reading of
  // the three, least "obviously a book" at a glance.
  indigo: {
    light: {
      ...neutrals.light,
      ...gilt.light,
      primary: '#2B3A67',
      primaryHover: '#1F2B4D',
      primarySoft: '#E1E4EF',
      primaryOnSoft: '#202C51',
    },
    dark: {
      ...neutrals.dark,
      ...gilt.dark,
      primary: '#7C8FC9',
      primaryHover: '#93A4D6',
      primarySoft: '#1C2338',
      primaryOnSoft: '#B7C2E6',
    },
  },
} as const;

export type ColorTheme = keyof typeof colorThemes;
export const COLOR_THEMES: readonly ColorTheme[] = ['default', 'emerald', 'burgundy', 'indigo'] as const;

export type ColorName = keyof typeof colorThemes.default.light;
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
