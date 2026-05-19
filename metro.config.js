const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes("MP4")) {
  config.resolver.assetExts.push("MP4");
}

module.exports = config;
