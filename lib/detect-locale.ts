import { Platform } from 'react-native';

type SupportedLanguageLabel =
  | 'English'
  | 'Spanish'
  | 'French'
  | 'German'
  | 'Italian'
  | 'Portuguese'
  | 'Japanese'
  | 'Korean';

const LANGUAGE_BY_PRIMARY_TAG: Record<string, SupportedLanguageLabel> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ja: 'Japanese',
  ko: 'Korean',
};

const ACCENT_BY_REGION: Record<string, 'US' | 'UK' | 'AU' | 'Standard'> = {
  US: 'US',
  CA: 'US',
  GB: 'UK',
  IE: 'UK',
  AU: 'AU',
  NZ: 'AU',
};

function readDeviceLocale(): string | null {
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && typeof navigator.language === 'string') {
      return navigator.language;
    }
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return null;
  }
}

export function detectInitialLanguage(): SupportedLanguageLabel {
  const locale = readDeviceLocale();
  if (!locale) return 'English';
  const primary = locale.split(/[-_]/)[0]?.toLowerCase();
  if (!primary) return 'English';
  return LANGUAGE_BY_PRIMARY_TAG[primary] ?? 'English';
}

export function detectInitialAccentGoal(): 'US' | 'UK' | 'AU' | 'Standard' {
  const locale = readDeviceLocale();
  if (!locale) return 'US';
  const region = locale.split(/[-_]/)[1]?.toUpperCase();
  if (!region) return 'US';
  return ACCENT_BY_REGION[region] ?? 'Standard';
}
