const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes("MP4")) {
  config.resolver.assetExts.push("MP4");
}

// @vercel/blob/client statically imports the Node builtins `crypto`, `stream`
// and `undici` (for server-only helpers). React Native / Metro can't resolve
// those, which breaks the iOS bundle. The package already ships browser-safe
// replacements (declared in its `browser` field); point Metro at them whenever
// the import originates from @vercel/blob — on every platform, not just web.
const blobBrowserShims = {
  crypto: path.resolve(__dirname, "node_modules/@vercel/blob/dist/crypto-browser.js"),
  stream: path.resolve(__dirname, "node_modules/@vercel/blob/dist/stream-browser.js"),
  undici: path.resolve(__dirname, "node_modules/@vercel/blob/dist/undici-browser.js"),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath || "";
  if (blobBrowserShims[moduleName] && origin.includes(`${path.sep}@vercel${path.sep}blob${path.sep}`)) {
    return { filePath: blobBrowserShims[moduleName], type: "sourceFile" };
  }
  // Behold tidligere web-spesifikke undici-shim.
  if (moduleName === "undici" && platform === "web") {
    return {
      filePath: path.resolve(__dirname, "lib/shims/undici-web.js"),
      type: "sourceFile",
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
