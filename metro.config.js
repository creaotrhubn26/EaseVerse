const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes("MP4")) {
  config.resolver.assetExts.push("MP4");
}

// @vercel/blob/client statically imports `undici` for server-only use; on web
// we map it to a tiny shim that re-exports native fetch.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "undici" && platform === "web") {
    return {
      filePath: path.resolve(__dirname, "lib/shims/undici-web.js"),
      type: "sourceFile",
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
