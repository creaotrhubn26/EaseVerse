// Enable only after the deployed provider and consent flow pass production E2E.
// A saved preference from an older build must not enable an unavailable service.
export const CLOUD_PRACTICE_ANALYSIS_ENABLED =
  process.env.EXPO_PUBLIC_CLOUD_PRACTICE_ANALYSIS_ENABLED === '1';
