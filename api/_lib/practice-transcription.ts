import OpenAI, {toFile} from 'openai';
import {practiceAudioFormat,usablePracticeTranscript} from '../../shared/practice-transcript.js';
export function transcriptionConfigured(): boolean {
  return Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
}
export async function transcribePractice(audio: Buffer, language?: string): Promise<string> {
  const apiKey=process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if(!apiKey)throw new Error('Transcription unavailable');
  const client=new OpenAI({apiKey,timeout:18000,maxRetries:0});
  const format=practiceAudioFormat(audio);
  if(!format)throw new Error('Unsupported recording format');
  const file=await toFile(audio,`take.${format}`);
  // Never provide the expected lyrics as an ASR prompt: that biases a match upward.
  const result=await client.audio.transcriptions.create({file,model:'whisper-1',response_format:'verbose_json',...(language?{language}:{})});
  return usablePracticeTranscript(result);
}
