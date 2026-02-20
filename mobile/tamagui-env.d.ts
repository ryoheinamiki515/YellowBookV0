import { config } from './tamagui.config'

export type AppTamaguiConfig = typeof config

declare module 'tamagui' {
    interface TamaguiCustomConfig extends AppTamaguiConfig { }
}
