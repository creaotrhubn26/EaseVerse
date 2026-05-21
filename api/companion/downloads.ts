import type { VercelRequest, VercelResponse } from "@vercel/node";

const MAC_DMG_URL =
  process.env.COMPANION_DOWNLOAD_MAC_DMG ||
  "https://mzwnzsczjuvu1w1a.public.blob.vercel-storage.com/downloads/easeverse-companion-0.1.0-mac-x64.dmg";
const MAC_ARM_DMG_URL = process.env.COMPANION_DOWNLOAD_MAC_ARM_DMG || null;
const WINDOWS_MSI_URL = process.env.COMPANION_DOWNLOAD_WIN_MSI || null;
const LINUX_APPIMAGE_URL = process.env.COMPANION_DOWNLOAD_LINUX || null;

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  return res.status(200).json({
    version: "0.1.0",
    downloads: [
      MAC_ARM_DMG_URL
        ? {
            platform: "macOS",
            arch: "Apple Silicon (arm64)",
            url: MAC_ARM_DMG_URL,
            filename: "easeverse-companion-0.1.0-mac-arm64.dmg",
          }
        : null,
      MAC_DMG_URL
        ? {
            platform: "macOS",
            arch: "Intel (x64)",
            url: MAC_DMG_URL,
            filename: "easeverse-companion-0.1.0-mac-x64.dmg",
            size_mb: 3.4,
          }
        : null,
      WINDOWS_MSI_URL
        ? {
            platform: "Windows",
            arch: "x64",
            url: WINDOWS_MSI_URL,
            filename: "easeverse-companion-0.1.0-win-x64.msi",
          }
        : null,
      LINUX_APPIMAGE_URL
        ? {
            platform: "Linux",
            arch: "x64",
            url: LINUX_APPIMAGE_URL,
            filename: "easeverse-companion-0.1.0-linux-x86_64.AppImage",
          }
        : null,
    ].filter(Boolean),
    repo: "https://github.com/creaotrhubn26/EaseVerse",
    notes: [
      "Mac build is unsigned — right-click the .app and choose Open the first time to bypass Gatekeeper.",
      "Windows / Linux installers ship via GitHub Actions when the companion-v* tag is pushed.",
    ],
  });
}
