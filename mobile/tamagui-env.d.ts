// Type augmentation is handled in tamagui.config.ts
// This file exists for Tamagui's babel plugin to detect the config type.

import { config } from './tamagui.config'

export type AppTamaguiConfig = typeof config

declare module 'tamagui' {
    interface TamaguiCustomConfig extends AppTamaguiConfig { }
}
