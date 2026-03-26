import { createAnimations } from '@tamagui/animations-react-native'
import { createFont, createTamagui, createTokens } from 'tamagui'

// ---------------------------------------------------------------------------
// 1. COLOR PRIMITIVES
//    Warm-shifted palette — no pure black, no pure white.
//    Named by role, not by hue, so swapping palettes never breaks semantics.
// ---------------------------------------------------------------------------

export const palette = {
    // Warm whites & off-whites — the "paper" of the notebook
    cream: '#FBF8F3',
    parchment: '#F5F0E8',
    linen: '#EDE7DC',
    sand: '#E2D9CC',

    // Warm grays — structure & borders
    fog: '#D4CBC0',
    stone: '#B5A99A',
    driftwood: '#8C7F72',
    bark: '#736659',
    walnut: '#645850',
    charcoal: '#3D352F',
    espresso: '#2A2420',
    midnight: '#1C1815',

    // Primary — golden amber, the "yellow" in YellowBook
    honeyLight: '#FDE9A8',
    honey: '#F5C842',
    honeyDark: '#D4A520',
    honeyDeep: '#B8860B',

    // Accent — warm terracotta for moments of visual contrast
    terracottaLight: '#F5D0C0',
    terracotta: '#D4805A',
    terracottaDark: '#B86040',

    // Success — sage green, earthy & celebratory
    sageLight: '#D4E8D0',
    sage: '#7DAE78',
    sageDark: '#5C8A58',

    // Caution — warm amber, informative not alarming
    amberLight: '#FDE8C8',
    amber: '#E8A94A',
    amberDark: '#C88830',

    // Destructive — muted rose, serious but soft
    roseLight: '#F5D0D0',
    rose: '#C87070',
    roseDark: '#A85050',

    // Dark mode surfaces — warm charcoals
    soot: '#1A1714',
    ash: '#242019',
    ember: '#302B23',
    smoke: '#3C362C',
    flint: '#4A433A',

    // Utility
    transparent: 'rgba(0,0,0,0)',
    shadowLight: 'rgba(42,36,32,0.06)',
    shadowMedium: 'rgba(42,36,32,0.12)',
    shadowDark: 'rgba(0,0,0,0.25)',
} as const

// ---------------------------------------------------------------------------
// 2. TOKENS
// ---------------------------------------------------------------------------

const tokens = createTokens({
    color: {
        ...palette,
    },

    size: {
        0: 0,
        0.5: 2,
        1: 4,
        1.5: 6,
        2: 8,
        2.5: 10,
        3: 12,
        3.5: 14,
        4: 16,
        5: 20,
        6: 24,
        7: 28,
        8: 32,
        9: 36,
        10: 40,
        11: 44,
        true: 44,    // default component size — meets 44px touch target
        12: 48,
        13: 52,
        14: 56,
        15: 64,
        16: 72,
        17: 80,
        18: 96,
        19: 128,
        20: 256,
    },

    space: {
        0: 0,
        0.5: 2,
        1: 4,     // xs — icon-to-label gap
        1.5: 6,
        2: 8,     // sm — between related elements
        2.5: 10,
        3: 12,    // md — card internal padding
        4: 16,    // lg — between groups
        true: 16,
        5: 20,    // screen edge padding
        6: 24,    // xl — between sections
        7: 28,
        8: 32,    // 2xl — major section breaks
        9: 40,
        10: 48,    // 3xl — screen-level vertical separation
        11: 64,
        12: 80,

        // Negative space for pull-in margins
        '-0.5': -2,
        '-1': -4,
        '-1.5': -6,
        '-2': -8,
        '-3': -12,
        '-4': -16,
        '-5': -20,
        '-6': -24,
    },

    radius: {
        0: 0,
        1: 2,
        2: 4,
        3: 6,
        4: 8,     // button radius
        true: 8,
        5: 10,
        6: 12,    // card radius
        7: 14,
        8: 16,    // large card radius
        9: 20,
        10: 24,
        11: 32,
        12: 999,   // pill / fully rounded
    },

    zIndex: {
        0: 0,
        1: 100,
        2: 200,
        3: 300,
        4: 400,
        5: 500,
    },
})

// ---------------------------------------------------------------------------
// 3. FONTS — DM Sans
//    Scale: 7 named sizes mapped to numeric keys.
//    Key "true" = default body size.
// ---------------------------------------------------------------------------

const dmSansBody = createFont({
    family: 'DMSans_400Regular',
    size: {
        1: 11,    // overline
        2: 12,    // caption
        3: 13,    // label small
        4: 14,    // label
        5: 15,    // body compact
        true: 16,   // body — default
        6: 16,
        7: 18,    // body large
        8: 20,    // heading
        9: 24,    // title
        10: 28,    // display small
        11: 32,    // display
        12: 40,    // display large
    },
    lineHeight: {
        1: 16,
        2: 18,
        3: 20,
        4: 20,
        5: 22,
        true: 24,
        6: 24,
        7: 26,
        8: 28,
        9: 32,
        10: 36,
        11: 40,
        12: 48,
    },
    weight: {
        1: '400',
        2: '400',
        3: '500',
        4: '500',
        5: '400',
        true: '400',
        6: '400',
        7: '400',
        8: '500',
        9: '600',
        10: '600',
        11: '700',
        12: '700',
    },
    letterSpacing: {
        1: 0.5,   // overline gets a little air
        2: 0.25,
        3: 0.1,
        4: 0.1,
        5: 0,
        true: 0,
        6: 0,
        7: 0,
        8: -0.2,
        9: -0.3,
        10: -0.5,
        11: -0.6,
        12: -0.8,  // display text tightens up
    },
    face: {
        400: { normal: 'DMSans_400Regular', italic: 'DMSans_400Regular_Italic' },
        500: { normal: 'DMSans_500Medium', italic: 'DMSans_500Medium_Italic' },
        600: { normal: 'DMSans_600SemiBold', italic: 'DMSans_600SemiBold_Italic' },
        700: { normal: 'DMSans_700Bold', italic: 'DMSans_700Bold_Italic' },
    },
})

const dmSansHeading = createFont({
    ...dmSansBody,
    weight: {
        1: '600',
        2: '600',
        3: '600',
        4: '600',
        5: '600',
        true: '600',
        6: '600',
        7: '600',
        8: '600',
        9: '700',
        10: '700',
        11: '700',
        12: '700',
    },
    letterSpacing: {
        1: 0.2,
        2: 0.1,
        3: 0,
        4: 0,
        5: -0.1,
        true: -0.2,
        6: -0.2,
        7: -0.3,
        8: -0.4,
        9: -0.5,
        10: -0.6,
        11: -0.8,
        12: -1.0,
    },
    lineHeight: {
        1: 16,
        2: 18,
        3: 18,
        4: 20,
        5: 22,
        true: 22,
        6: 22,
        7: 24,
        8: 26,
        9: 30,
        10: 34,
        11: 38,
        12: 46,
    },
})

// ---------------------------------------------------------------------------
// 4. THEMES
//    Every theme uses the same semantic keys so components never break.
//    Sub-themes (light_accent, dark_accent, etc.) override just what changes.
// ---------------------------------------------------------------------------

// Shared semantic keys — this is the contract every theme fulfills.

type ThemeShape = Record<string, string>

const lightTheme: ThemeShape = {
    // Surfaces
    background: palette.cream,
    backgroundHover: palette.parchment,
    backgroundPress: palette.linen,
    backgroundFocus: palette.parchment,
    backgroundStrong: palette.linen,
    backgroundTransparent: palette.transparent,

    // Surface elevation (cards, sheets, modals)
    surface: '#FFFFFF',
    surfaceWarm: '#FFFDF7',
    surfaceHover: palette.cream,
    surfacePress: palette.parchment,
    surfaceRaised: '#FFFFFF',

    // Text
    color: palette.espresso,
    colorHover: palette.midnight,
    colorPress: palette.charcoal,
    colorFocus: palette.espresso,
    colorTransparent: palette.transparent,
    colorSecondary: palette.charcoal,
    colorTertiary: palette.walnut,
    colorMuted: palette.stone,

    // Borders & dividers
    borderColor: palette.stone,
    borderColorHover: palette.driftwood,
    borderColorFocus: palette.honey,
    borderColorPress: palette.fog,
    borderColorSubtle: palette.fog,

    // Interactive — primary (honey/gold)
    accentBackground: palette.honey,
    accentBackgroundHover: palette.honeyDark,
    accentBackgroundPress: palette.honeyDeep,
    accentColor: palette.espresso,

    // Interactive — secondary (terracotta)
    secondaryBackground: palette.terracottaLight,
    secondaryBackgroundHover: palette.terracotta,
    secondaryBackgroundPress: palette.terracottaDark,
    secondaryColor: palette.espresso,

    // Semantic states
    successBackground: palette.sageLight,
    successColor: palette.sageDark,
    cautionBackground: palette.amberLight,
    cautionColor: palette.amberDark,
    destructiveBackground: palette.roseLight,
    destructiveColor: palette.roseDark,

    // Forms
    placeholderColor: palette.driftwood,
    outlineColor: 'rgba(245,200,66,0.35)',
    inputBackground: '#FFFFFF',

    // Shadows (used programmatically, not as theme vars, but handy to have)
    shadowColor: palette.shadowLight,
    shadowColorStrong: palette.shadowMedium,

    // The 1–12 scale (lightest → darkest in light mode)
    color1: palette.cream,
    color2: palette.parchment,
    color3: palette.linen,
    color4: palette.sand,
    color5: palette.fog,
    color6: palette.stone,
    color7: palette.driftwood,
    color8: palette.walnut,
    color9: palette.charcoal,
    color10: palette.espresso,
    color11: palette.midnight,
    color12: palette.midnight,
}

const darkTheme: ThemeShape = {
    // Surfaces — warm dark, never pure black
    background: palette.soot,
    backgroundHover: palette.ash,
    backgroundPress: palette.ember,
    backgroundFocus: palette.ash,
    backgroundStrong: palette.midnight,
    backgroundTransparent: palette.transparent,

    // Surface elevation — lighter = higher in dark mode
    surface: palette.ash,
    surfaceWarm: '#2A2519',
    surfaceHover: palette.ember,
    surfacePress: palette.smoke,
    surfaceRaised: palette.ember,

    // Text — warm off-whites
    color: palette.parchment,
    colorHover: palette.cream,
    colorPress: palette.linen,
    colorFocus: palette.parchment,
    colorTransparent: palette.transparent,
    colorSecondary: palette.fog,
    colorTertiary: palette.stone,
    colorMuted: palette.driftwood,

    // Borders
    borderColor: palette.smoke,
    borderColorHover: palette.flint,
    borderColorFocus: palette.honeyDark,
    borderColorPress: palette.flint,
    borderColorSubtle: palette.ember,

    // Interactive — primary (slightly desaturated in dark)
    accentBackground: palette.honeyDark,
    accentBackgroundHover: palette.honey,
    accentBackgroundPress: palette.honeyDeep,
    accentColor: palette.midnight,

    // Interactive — secondary
    secondaryBackground: palette.terracottaDark,
    secondaryBackgroundHover: palette.terracotta,
    secondaryBackgroundPress: palette.terracottaLight,
    secondaryColor: palette.cream,

    // Semantic states (desaturated for dark mode)
    successBackground: palette.sageDark,
    successColor: palette.sageLight,
    cautionBackground: palette.amberDark,
    cautionColor: palette.amberLight,
    destructiveBackground: palette.roseDark,
    destructiveColor: palette.roseLight,

    // Forms
    placeholderColor: palette.driftwood,
    outlineColor: 'rgba(212,165,32,0.25)',
    inputBackground: palette.ember,

    // Shadows
    shadowColor: 'rgba(0,0,0,0.3)',
    shadowColorStrong: palette.shadowDark,

    // 1–12 scale (reversed in dark mode: 1=darkest, 12=lightest)
    color1: palette.soot,
    color2: palette.ash,
    color3: palette.ember,
    color4: palette.smoke,
    color5: palette.flint,
    color6: palette.driftwood,
    color7: palette.stone,
    color8: palette.fog,
    color9: palette.sand,
    color10: palette.linen,
    color11: palette.parchment,
    color12: palette.cream,
}

// Sub-themes — activated via <Theme name="accent">, <Theme name="success">, etc.

const light_accent: ThemeShape = {
    ...lightTheme,
    background: palette.honey,
    backgroundHover: palette.honeyDark,
    backgroundPress: palette.honeyDeep,
    backgroundFocus: palette.honeyDark,
    color: palette.espresso,
    colorHover: palette.midnight,
    borderColor: palette.honeyDark,
}

const dark_accent: ThemeShape = {
    ...darkTheme,
    background: palette.honeyDark,
    backgroundHover: palette.honey,
    backgroundPress: palette.honeyDeep,
    backgroundFocus: palette.honey,
    color: palette.midnight,
    colorHover: palette.espresso,
    borderColor: palette.honeyDeep,
}

const light_secondary: ThemeShape = {
    ...lightTheme,
    background: palette.terracottaLight,
    backgroundHover: palette.terracotta,
    backgroundPress: palette.terracottaDark,
    color: palette.espresso,
    borderColor: palette.terracotta,
}

const dark_secondary: ThemeShape = {
    ...darkTheme,
    background: palette.terracottaDark,
    backgroundHover: palette.terracotta,
    backgroundPress: palette.terracottaLight,
    color: palette.cream,
    borderColor: palette.terracotta,
}

const light_success: ThemeShape = {
    ...lightTheme,
    background: palette.sageLight,
    backgroundHover: palette.sage,
    backgroundPress: palette.sageDark,
    color: palette.sageDark,
    borderColor: palette.sage,
}

const dark_success: ThemeShape = {
    ...darkTheme,
    background: palette.sageDark,
    backgroundHover: palette.sage,
    backgroundPress: palette.sageLight,
    color: palette.sageLight,
    borderColor: palette.sage,
}

const light_caution: ThemeShape = {
    ...lightTheme,
    background: palette.amberLight,
    backgroundHover: palette.amber,
    backgroundPress: palette.amberDark,
    color: palette.amberDark,
    borderColor: palette.amber,
}

const dark_caution: ThemeShape = {
    ...darkTheme,
    background: palette.amberDark,
    backgroundHover: palette.amber,
    backgroundPress: palette.amberLight,
    color: palette.amberLight,
    borderColor: palette.amber,
}

const light_destructive: ThemeShape = {
    ...lightTheme,
    background: palette.roseLight,
    backgroundHover: palette.rose,
    backgroundPress: palette.roseDark,
    color: palette.roseDark,
    borderColor: palette.rose,
}

const dark_destructive: ThemeShape = {
    ...darkTheme,
    background: palette.roseDark,
    backgroundHover: palette.rose,
    backgroundPress: palette.roseLight,
    color: palette.roseLight,
    borderColor: palette.rose,
}

// ---------------------------------------------------------------------------
// 5. ANIMATIONS
//    Calm, functional motion. No bouncing, no playful springs.
//    Timing-based for predictable feel; gentle springs for sheets only.
// ---------------------------------------------------------------------------

const animations = createAnimations({
    // Core UI transitions
    fast: { type: 'timing', duration: 150 },
    medium: { type: 'timing', duration: 250 },
    slow: { type: 'timing', duration: 350 },

    // Micro-interactions (button press, toggle, checkbox)
    micro: { type: 'timing', duration: 120 },

    // Entrances (cards appearing, list items loading)
    enter: { type: 'timing', duration: 250 },

    // Exits (dismissing, removing) — faster than entrances
    exit: { type: 'timing', duration: 150 },

    // Bottom sheets & modals — gentle spring, no bounce
    sheet: {
        type: 'spring',
        damping: 28,
        mass: 0.9,
        stiffness: 220,
    },

    // Tooltip / popover appearance
    tooltip: {
        type: 'spring',
        damping: 22,
        mass: 0.6,
        stiffness: 200,
    },

    // Skeleton / loading pulse
    pulse: { type: 'timing', duration: 1200 },

    // Fallback / instant
    '0ms': { type: 'timing', duration: 0 },
})

// ---------------------------------------------------------------------------
// 6. MEDIA QUERIES
// ---------------------------------------------------------------------------

const media = {
    // Input modality
    touchable: { pointer: 'coarse' as const },
    hoverable: { hover: 'hover' as const },

    // Breakpoints — mobile-first
    xs: { minWidth: 460 },
    sm: { minWidth: 640 },
    md: { minWidth: 768 },
    lg: { minWidth: 1024 },
    xl: { minWidth: 1280 },

    // Height-based (useful for small phones / landscape)
    short: { maxHeight: 680 },
}

// ---------------------------------------------------------------------------
// 7. SHORTHANDS
// ---------------------------------------------------------------------------

const shorthands = {
    // Layout
    bg: 'backgroundColor',
    p: 'padding',
    pt: 'paddingTop',
    pr: 'paddingRight',
    pb: 'paddingBottom',
    pl: 'paddingLeft',
    px: 'paddingHorizontal',
    py: 'paddingVertical',
    m: 'margin',
    mt: 'marginTop',
    mr: 'marginRight',
    mb: 'marginBottom',
    ml: 'marginLeft',
    mx: 'marginHorizontal',
    my: 'marginVertical',

    // Sizing
    w: 'width',
    h: 'height',
    minW: 'minWidth',
    maxW: 'maxWidth',
    minH: 'minHeight',
    maxH: 'maxHeight',

    // Flex
    fd: 'flexDirection',
    fw: 'flexWrap',
    grow: 'flexGrow',
    shrink: 'flexShrink',
    basis: 'flexBasis',
    items: 'alignItems',
    justify: 'justifyContent',
    self: 'alignSelf',

    // Border
    br: 'borderRadius',
    bw: 'borderWidth',
    bc: 'borderColor',

    // Position
    pos: 'position',
    z: 'zIndex',

    // Opacity
    o: 'opacity',
} as const

// ---------------------------------------------------------------------------
// 8. CONFIG
// ---------------------------------------------------------------------------

export const config = createTamagui({
    tokens,
    themes: {
        light: lightTheme,
        dark: darkTheme,
        light_accent,
        dark_accent,
        light_secondary,
        dark_secondary,
        light_success,
        dark_success,
        light_caution,
        dark_caution,
        light_destructive,
        dark_destructive,
    },
    fonts: {
        body: dmSansBody,
        heading: dmSansHeading,
    },
    animations,
    media,
    shorthands,
    settings: {
        defaultFont: 'body',
        styleCompat: 'react-native',
        fastSchemeChange: true,
        shouldAddPrefersColorThemes: false,
        onlyAllowShorthands: false,
        mediaQueryDefaultActive: {
            touchable: true,    // mobile-first: assume touch by default
        },
    },
})

export default config

// Type augmentation — drives autocomplete for every $token reference
export type AppConfig = typeof config

declare module 'tamagui' {
    interface TamaguiCustomConfig extends AppConfig { }
}
