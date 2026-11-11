import type { Theme } from "react-native-calendars/src/types";

import { palette } from "../../tamagui.config";

export const CALENDAR_TODAY_BACKGROUND_COLOR = palette.honeyLight;

export const CALENDAR_THEME: Theme = {
    calendarBackground: palette.parchment,
    monthTextColor: palette.espresso,
    dayTextColor: palette.espresso,
    textDisabledColor: palette.driftwood,
    textInactiveColor: palette.driftwood,
    textSectionTitleColor: palette.bark,
    todayBackgroundColor: CALENDAR_TODAY_BACKGROUND_COLOR,
    todayTextColor: palette.espresso,
    arrowColor: palette.walnut,
    textDayFontSize: 16,
    textMonthFontSize: 17,
    textDayHeaderFontSize: 12,
};
