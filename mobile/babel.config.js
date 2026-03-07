module.exports = function (api) {
    api.cache(true);
    const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
    const isUnsupportedNode = !Number.isNaN(nodeMajor) && nodeMajor >= 23;
    const tamaguiPlugin = [
        '@tamagui/babel-plugin',
        {
            config: './tamagui.config.ts',
            components: ['tamagui'],
        },
    ];

    return {
        presets: ['babel-preset-expo'],
        plugins: isUnsupportedNode ? [] : [tamaguiPlugin],
    };
};
