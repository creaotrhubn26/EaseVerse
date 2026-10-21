export type LocalPracticeCapability={available:boolean;locale:string;canDownload:boolean;reason:string};
export type LocalPracticeTranscript={transcript:string;provider:'apple-speech'|'android-speech'};
export async function localPracticeCapability(locale:string):Promise<LocalPracticeCapability>{return {available:false,locale,canDownload:false,reason:'Local transcription is available in the native app on supported devices.'};}
export async function transcribePracticeLocally(_uri:string,_locale:string,_signal?:AbortSignal):Promise<LocalPracticeTranscript>{throw new Error('Local transcription is unavailable in this browser.');}
export async function downloadPracticeLanguage(_locale:string):Promise<string>{throw new Error('No local language download is available here.');}
