export type PronunciationVoice={identifier:string;language:string;localService?:boolean};
export type PronunciationSpeechOptions={language:string;voice:string;rate:number;volume:number;useApplicationAudioSession:true;onStart:()=>void;onDone:()=>void;onStopped:()=>void;onError:(error:Error)=>void};
export type PronunciationBridge={voices:()=>Promise<PronunciationVoice[]>;prepare:()=>Promise<void>;stop:()=>Promise<void>;speak:(text:string,options:PronunciationSpeechOptions)=>void};
const normal=(locale:string)=>locale.toLowerCase().replace(/_/g,'-').replace(/^no(?=-|$)/,'nb');
export function choosePronunciationVoice(voices:PronunciationVoice[],locale:string):PronunciationVoice|undefined{
 const local=voices.filter(voice=>voice.localService!==false);
 return local.find(voice=>normal(voice.language)===normal(locale))??(!locale.includes('-')?local.find(voice=>normal(voice.language).split('-')[0]===normal(locale)):undefined);
}
/** Drives status from actual speech events; failed preparation never looks like playback. */
export function playWordPronunciation(text:string,locale:string,bridge:PronunciationBridge,signal:AbortSignal,onStart:()=>void,timeoutMs=15000):Promise<PronunciationVoice>{
 return new Promise((resolve,reject)=>{
  let finished=false;let timer:ReturnType<typeof setTimeout>;
  const stop=()=>{void bridge.stop().catch(()=>{});};
  const finish=(error?:Error,voice?:PronunciationVoice)=>{
   if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',abort);
   if(error)reject(error);else resolve(voice!);
  };
  const abort=()=>{finish(new Error('Pronunciation stopped.'));stop();};
  signal.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>{finish(new Error('The speech voice did not respond. Check your device’s speech voices and try again.'));stop();},timeoutMs);
  if(signal.aborted){abort();return;}
  void(async()=>{
   try{
    const word=text.trim();if(!word||word.length>120)throw new Error('Choose a word or short phrase to hear.');
    await bridge.stop();if(finished)return;
    const voices=await bridge.voices();if(finished)return;
    const voice=choosePronunciationVoice(voices,locale);
    if(!voice)throw new Error('No speech voice is available for this language. Add a voice in your device’s speech settings and try again.');
    await bridge.prepare();if(finished)return;
    bridge.speak(word,{language:voice.language,voice:voice.identifier,rate:0.8,volume:1,useApplicationAudioSession:true,
     onStart:()=>{if(!finished)onStart();},onDone:()=>finish(undefined,voice),
     onStopped:()=>finish(new Error('Pronunciation stopped. Tap the word to try again.')),
     onError:()=>{finish(new Error('Could not play the example. Check media volume and your device’s speech voice, then try again.'));stop();},
    });
   }catch(error){finish(error instanceof Error?error:new Error('Could not play the pronunciation. Try again.'));}
  })();
 });
}
