const path = require("path");
const fs = require("fs");
const { withDangerousMod, IOSConfig } = require("@expo/config-plugins");
const { generateImageAsync } = require("@expo/image-utils");

// Expo SDK 54 writes a single 1024x1024 "universal" icon into AppIcon.appiconset
// (see @expo/prebuild-config withIosIcons). iOS derives the home-screen sizes from
// it, but does NOT emit the small notification/settings/spotlight variants, so those
// contexts fall back to the gray placeholder icon. Regenerating the asset catalog
// with the explicit classic size set makes the notification-sized icons (20pt @2x/@3x)
// present in the compiled Assets.car. See https://github.com/expo/expo/issues/39655.

const APPICONSET_RELATIVE = "Images.xcassets/AppIcon.appiconset";

// The classic iOS AppIcon set. Each entry names its point size, scale, and the
// concrete pixel dimension (point size x scale) used to render and reference it.
const ICON_VARIANTS = [
    { idiom: "iphone", size: "20x20", scale: "2x", px: 40 },
    { idiom: "iphone", size: "20x20", scale: "3x", px: 60 },
    { idiom: "iphone", size: "29x29", scale: "2x", px: 58 },
    { idiom: "iphone", size: "29x29", scale: "3x", px: 87 },
    { idiom: "iphone", size: "40x40", scale: "2x", px: 80 },
    { idiom: "iphone", size: "40x40", scale: "3x", px: 120 },
    { idiom: "iphone", size: "60x60", scale: "2x", px: 120 },
    { idiom: "iphone", size: "60x60", scale: "3x", px: 180 },
    { idiom: "ipad", size: "20x20", scale: "1x", px: 20 },
    { idiom: "ipad", size: "20x20", scale: "2x", px: 40 },
    { idiom: "ipad", size: "29x29", scale: "1x", px: 29 },
    { idiom: "ipad", size: "29x29", scale: "2x", px: 58 },
    { idiom: "ipad", size: "40x40", scale: "1x", px: 40 },
    { idiom: "ipad", size: "40x40", scale: "2x", px: 80 },
    { idiom: "ipad", size: "76x76", scale: "1x", px: 76 },
    { idiom: "ipad", size: "76x76", scale: "2x", px: 152 },
    { idiom: "ipad", size: "83.5x83.5", scale: "2x", px: 167 },
    { idiom: "ios-marketing", size: "1024x1024", scale: "1x", px: 1024 },
];

function iconFilename(px) {
    return `AppIcon-${px}.png`;
}

function resolveSourceIcon(config) {
    const icon = config.ios?.icon ?? config.icon;
    return typeof icon === "string" && icon.length > 0 ? icon : null;
}

async function writeAppIconSet(config) {
    const { projectRoot, platformProjectRoot } = config.modRequest;
    const projectName =
        config.modRequest.projectName ?? IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const sourceIcon = resolveSourceIcon(config);
    if (!sourceIcon) return config;

    const appIconSetDir = path.join(platformProjectRoot, projectName, APPICONSET_RELATIVE);
    await fs.promises.mkdir(appIconSetDir, { recursive: true });

    // Drop the single-size PNG Expo's core plugin wrote; leaving it unreferenced
    // makes actool warn about an unassigned image.
    const existing = await fs.promises.readdir(appIconSetDir);
    await Promise.all(
        existing
            .filter((name) => name.endsWith(".png"))
            .map((name) => fs.promises.rm(path.join(appIconSetDir, name)))
    );

    // iOS app icons must be fully opaque; flatten any transparency onto white,
    // matching how Expo's own generator produces the "light" variant.
    const uniquePx = [...new Set(ICON_VARIANTS.map((v) => v.px))];
    await Promise.all(
        uniquePx.map(async (px) => {
            const { source } = await generateImageAsync(
                { projectRoot, cacheType: `yellowbook-appicon-${px}` },
                {
                    src: sourceIcon,
                    name: iconFilename(px),
                    width: px,
                    height: px,
                    removeTransparency: true,
                    resizeMode: "cover",
                    backgroundColor: "#ffffff",
                }
            );
            await fs.promises.writeFile(path.join(appIconSetDir, iconFilename(px)), source);
        })
    );

    const contents = {
        images: ICON_VARIANTS.map(({ idiom, size, scale, px }) => ({
            filename: iconFilename(px),
            idiom,
            scale,
            size,
        })),
        info: { author: "expo", version: 1 },
    };
    await fs.promises.writeFile(
        path.join(appIconSetDir, "Contents.json"),
        JSON.stringify(contents, null, 2)
    );

    return config;
}

// Regenerate the iOS AppIcon set with explicit sizes so notifications, Settings, and
// Spotlight render the app icon instead of the default gray placeholder.
module.exports = function withIosAppIconSizes(config) {
    return withDangerousMod(config, ["ios", writeAppIconSet]);
};
