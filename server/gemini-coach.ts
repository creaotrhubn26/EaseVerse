/**
 * Google Gemini Integration (Free Tier)
 * Uses Gemini 2.5 Flash for pronunciation coaching
 * Free tier: 15 requests/min, 1.5M requests/day
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI: GoogleGenerativeAI | null = null;

/**
 * Initialize Gemini client
 */
function getGeminiClient(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY not configured');
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * Get pronunciation coaching for a word using Gemini Flash
 */
export async function getPronunciationCoaching(params: {
  word: string;
  context?: string;
  language?: string;
  accentGoal?: string;
}): Promise<{ phonetic: string; tip: string; slow: string }> {
  try {
    const client = getGeminiClient();
    
    // Use Gemini 2.5 Flash (fast and free)
    const model = client.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 500, // Increased for complete JSON response
      },
    });

    const languageHint = params.language?.trim() || 'English';
    const accentHint = params.accentGoal?.trim();
    
    const contextPrompt = params.context
      ? `Word: "${params.word}" in lyric line: "${params.context}".${accentHint ? ` Accent goal: ${accentHint}.` : ''}`
      : `Word: "${params.word}".${accentHint ? ` Accent goal: ${accentHint}.` : ''}`;

    const prompt = `You are a vocal pronunciation coach for singers. For this word, provide pronunciation guidance.

${contextPrompt}

Return a complete valid JSON object with these three keys:
- "phonetic": The phonetic spelling (IPA or simplified like "BYOO-tuh-ful")
- "tip": A brief coaching tip in ${languageHint} (under 15 words)
- "slow": Syllable breakdown (like "beau-ti-ful" or "love")

JSON:`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    
    // Check if response was blocked or truncated
    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      const candidate = candidates[0];
      console.log('Gemini finish reason:', candidate.finishReason);
      console.log('Gemini safety ratings:', candidate.safetyRatings);
    }
    
    // Wait for complete response
    const text = response.text().trim();

    console.log('Gemini raw response:', text); // Debug logging

    // Try to parse JSON, handling both plain JSON and markdown-wrapped JSON
    let jsonText = text;
    
    // Remove markdown code blocks if present
    if (text.includes('```json')) {
      const match = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (match) {
        jsonText = match[1].trim();
      } else {
        // Incomplete markdown block - extract what we have
        const partialMatch = text.match(/```json\s*([\s\S]*)/);
        if (partialMatch) {
          jsonText = partialMatch[1].trim().replace(/```$/, '').trim();
        }
      }
    } else if (text.includes('```')) {
      const match = text.match(/```\s*([\s\S]*?)\s*```/);
      if (match) {
        jsonText = match[1].trim();
      } else {
        // Incomplete markdown block
        const partialMatch = text.match(/```\s*([\s\S]*)/);
        if (partialMatch) {
          jsonText = partialMatch[1].trim().replace(/```$/, '').trim();
        }
      }
    }

    console.log('Extracted JSON text:', jsonText); // Debug extracted JSON

    try {
      const parsed = JSON.parse(jsonText);
      
      // Validate required fields
      if (parsed.phonetic && parsed.tip && parsed.slow) {
        console.log('Gemini coaching success:', parsed);
        return {
          phonetic: String(parsed.phonetic).substring(0, 120),
          tip: String(parsed.tip).substring(0, 160),
          slow: String(parsed.slow).substring(0, 120),
        };
      } else {
        console.warn('Gemini response missing required fields:', parsed);
        throw new Error('Invalid response structure');
      }
    } catch (parseError) {
      console.warn('Failed to parse Gemini response as JSON. Raw text:', text);
      console.warn('Parse error:', parseError);
      throw parseError; // Re-throw to use fallback
    }
  } catch (error) {
    console.error('Gemini pronunciation error:', error);
    
    // Return graceful fallback
    return {
      phonetic: params.word.toUpperCase(),
      tip: 'Enunciate clearly and maintain steady airflow',
      slow: params.word,
    };
  }
}

/**
 * Check if Gemini is configured and available
 */
export function isGeminiAvailable(): boolean {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    return Boolean(apiKey);
  } catch {
    return false;
  }
}

/**
 * Test Gemini connection
 */
export async function testGeminiConnection(): Promise<boolean> {
  try {
    const result = await getPronunciationCoaching({
      word: 'test',
      language: 'en-US',
    });
    return Boolean(result.phonetic);
  } catch {
    return false;
  }
}
