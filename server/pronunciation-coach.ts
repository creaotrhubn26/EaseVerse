import { getPronunciationCoaching as geminiCoach, isGeminiAvailable } from "./gemini-coach";
import { getPronunciationCoaching as claudeCoach, isClaudeAvailable } from "./claude-coach";

export type PronounceResult = { phonetic: string; tip: string; slow: string };

export type PronounceParams = {
  word: string;
  context?: string;
  language?: string;
  accentGoal?: string;
};

export async function coachPronunciationWithFallback(
  params: PronounceParams,
): Promise<PronounceResult> {
  const providers: Array<{ name: string; available: boolean; call: typeof geminiCoach }> = [
    { name: "gemini", available: isGeminiAvailable(), call: geminiCoach },
    { name: "claude", available: isClaudeAvailable(), call: claudeCoach },
  ];

  let lastError: unknown;
  for (const provider of providers) {
    if (!provider.available) continue;
    try {
      return await provider.call(params);
    } catch (error) {
      lastError = error;
      console.warn(`Pronunciation provider ${provider.name} failed:`, error);
    }
  }

  if (lastError) {
    throw lastError;
  }
  return { phonetic: params.word, tip: "Enunciate clearly", slow: params.word };
}
