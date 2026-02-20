// tamagui.config.ts
import { createTamagui, createFont, isWeb } from 'tamagui'
import { defaultConfig } from '@tamagui/config/v5'
import { createV5Theme, defaultChildrenThemes } from '@tamagui/themes/v5'
import { yellow, yellowDark } from '@tamagui/colors'
import { createAnimations } from '@tamagui/animations-react-native'

/**
 * YellowBook Design System
 * - Warm paper surfaces
 * - Soft ink text
 * - Sunlight accent (used intentionally, not everywhere)
 * - Breathable typography + spacing
 * - Gentle motion
 */

// -----------------------------
// 1) Motion (subtle, human)
// -----------------------------
const animations = createAnimations({
    '0ms': { type: 'timing', duration: 0 },
    '80ms': { type: 'timing', duration: 80 },
    '120ms': { type: 'timing', duration: 120 },
    '180ms': { type: 'timing', duration: 180 },
    '240ms': { type: 'timing', duration: 240 },
    '320ms': { type: 'timing', duration: 320 },

    // Springs: calm and reassuring, never “toy bouncy”
    gentle: { damping: 22, stiffness: 220, mass: 0.9 },
    calm: { damping: 28, stiffness: 180, mass: 1.0 },
    quick: { damping: 26, stiffness: 520, mass: 0.85 },
})

// -----------------------------
// 2) Typography (DM Sans)
// -----------------------------
// Expo Google Fonts commonly register like:
// DMSans_400Regular, DMSans_500Medium, DMSans_700Bold, plus _Italic variants.
const dmSansFamily = isWeb
    ? 'DM Sans, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'
    : 'DMSans_400Regular'

const bodySizes = {
    1: 12,
    2: 13,
    3: 15,
    4: 16,
    true: 16, // default
    5: 18,
    6: 20,
    7: 22,
    8: 24,
    9: 28,
    10: 32,
    11: 36,
    12: 40,
    13: 48,
    14: 56,
    15: 64,
    16: 72,
} as const

const bodyLineHeight = (size: number) => {
    // Breathable reading rhythm for “notebook” feel
    // Slightly tighter as sizes get large
    const ratio = 1.52 - Math.max(0, (size - 18) * 0.006)
    return Math.round(size * ratio)
}

const headingLineHeight = (size: number) => {
    // Headings should feel “designed” but still warm
    const ratio = 1.18 - Math.max(0, (size - 24) * 0.004)
    return Math.round(size * ratio + 4)
}

const bodyFont = createFont({
    family: dmSansFamily,
    size: bodySizes,
    lineHeight: Object.fromEntries(
        Object.entries(bodySizes).map(([k, v]) => [k, bodyLineHeight(Number(v))])
    ),
    // Weight tokens (mapped to real families via `face`)
    weight: {
        1: '400',
        4: '500',
        7: '700',
    },
    // Subtle tracking: slightly open at small sizes, neutral at default, gently tight at large
    letterSpacing: {
        1: 0.2,
        3: 0.1,
        4: 0,
        8: -0.2,
        12: -0.35,
    },
    // Critical for Android: map weights/styles to loaded font family names
    face: isWeb
        ? undefined
        : {
            400: { normal: 'DMSans_400Regular', italic: 'DMSans_400Regular_Italic' },
            500: { normal: 'DMSans_500Medium', italic: 'DMSans_500Medium_Italic' },
            700: { normal: 'DMSans_700Bold', italic: 'DMSans_700Bold_Italic' },
        },
})

const headingFont = createFont({
    ...bodyFont,
    // Headings: a touch tighter + heavier by default
    lineHeight: Object.fromEntries(
        Object.entries(bodySizes).map(([k, v]) => [k, headingLineHeight(Number(v))])
    ),
    weight: {
        1: '500',
        4: '700',
        7: '700',
    },
    letterSpacing: {
        1: 0.1,
        4: -0.15,
        8: -0.35,
        12: -0.55,
    },
})

// -----------------------------
// 3) Themes (paper + ink + sunlight)
// -----------------------------
// Palettes are 12-step gradients: background -> foreground.
// The goal is “warm, calm, real-world paper,” not “bright white UI”.
const lightPaperPalette = [
    '#FFFCF5', // paper
    '#FFF7E8',
    '#FFF1D8',
    '#FFE9C6',
    '#FFE0AD',
    '#FFD58F',
    '#F6C46B',
    '#E7AD4A',
    '#C98A2D',
    '#9E651A',
    '#623D0E',
    '#241A0A', // ink
] as const

const darkPaperPalette = [
    '#0E0C08', // warm charcoal
    '#14110C',
    '#1B1610',
    '#241D14',
    '#2E2519',
    '#3A2E1F',
    '#4D3C29',
    '#6A523A',
    '#9C7F58',
    '#C9B28A',
    '#EEE1C5',
    '#FFF6DE', // warm “paper light”
] as const

const generatedThemes = createV5Theme({
    lightPalette: [...lightPaperPalette],
    darkPalette: [...darkPaperPalette],

    // Keep the nice defaults (blue/green/etc) but add a brand-friendly “sunlight” theme.
    childrenThemes: {
        ...defaultChildrenThemes,
        sunlight: { light: yellow, dark: yellowDark },
    },
})

// Add slightly warmer, softer shadows globally.
// (We keep this tiny to avoid blowing up the config/compile.)
const themes = Object.fromEntries(
    Object.entries(generatedThemes).map(([name, theme]) => {
        const isDark = name.startsWith('dark')
        return [
            name,
            {
                ...theme,
                shadowColor: isDark ? 'rgba(0,0,0,0.65)' : 'rgba(36,26,10,0.14)',
            },
        ]
    })
)

// -----------------------------
// 4) Tokens (spacing + radius tuned for mobile calm)
// -----------------------------
const tokens = {
    ...defaultConfig.tokens,

    // More “page-like” padding + comfortable touch targets.
    // We keep the existing keys and *just* nudge defaults upward where it matters.
    space: {
        ...defaultConfig.tokens.space,
        // ensure a comfy default spacing token exists
        true: 16,
    },

    // Softer corners by default: cards feel like pages, buttons feel friendly.
    radius: {
        ...defaultConfig.tokens.radius,
        true: 16,
        // add a couple extra “modern mobile” radii
        7: 20,
        8: 28,
    },
} as const

// -----------------------------
// 5) Create config
// -----------------------------
import { shorthands } from '@tamagui/shorthands'

export const config = createTamagui({
    ...defaultConfig,
    tokens,
    themes,
    animations,
    shorthands,

    fonts: {
        body: bodyFont,
        heading: headingFont,
    },

    settings: {
        ...defaultConfig.settings,

        // Strong opinion: default to body font everywhere.
        defaultFont: 'body',

        // Avoid jank on scheme toggles; feels “calm” instead of flickery.
        fastSchemeChange: true,

        // Expo/RN-first ergonomics
        styleCompat: 'react-native',
    },
})

export default config