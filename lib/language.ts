export type SttLanguageCode = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'ja' | 'ko';

const sttCodeByLanguageLabel: Record<string, SttLanguageCode> = {
  English: 'en',
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Italian: 'it',
  Portuguese: 'pt',
  Japanese: 'ja',
  Korean: 'ko',
};

const speechRecognitionLangByLanguageLabel: Record<string, string> = {
  English: 'en-US',
  Spanish: 'es-ES',
  French: 'fr-FR',
  German: 'de-DE',
  Italian: 'it-IT',
  Portuguese: 'pt-PT',
  Japanese: 'ja-JP',
  Korean: 'ko-KR',
};

export function resolveSttLanguageCode(languageLabel: string): SttLanguageCode | undefined {
  return sttCodeByLanguageLabel[languageLabel];
}

export function resolveSpeechRecognitionLang(languageLabel: string, accentGoal: string): string {
  if (languageLabel === 'English') {
    switch (accentGoal) {
      case 'UK':
        return 'en-GB';
      case 'AU':
        return 'en-AU';
      case 'Standard':
        return 'en';
      case 'US':
      default:
        return 'en-US';
    }
  }

  return speechRecognitionLangByLanguageLabel[languageLabel] ?? 'en-US';
}

