module.exports = {
    preset: "jest-expo",
    testMatch: ["**/*.test.tsx"],
    transformIgnorePatterns: [
        "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@tamagui/.*|tamagui))",
    ],
};
