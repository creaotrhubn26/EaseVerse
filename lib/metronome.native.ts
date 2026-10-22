import {requireOptionalNativeModule} from 'expo-modules-core';
import {AudioModule,setIsAudioActiveAsync} from 'expo-audio';
import type {MetronomeStart} from './metronome-controller';
type NativeClick={start:(id:string,bpm:number,beats:number)=>Promise<void>;stop:(id:string)=>Promise<void>;addListener:(name:'stopped',fn:(event:{id:string;message:string})=>void)=>{remove:()=>void}};
export const startMetronomeAudio: MetronomeStart = async ({id,bpm,beats,signal,onStopped}) => {
  const engine=requireOptionalNativeModule<NativeClick>('EaseVerseMetronome');
  if(!engine)throw new Error('Update EaseVerse to use the native metronome.');
  const stop=()=>{void engine.stop(id).catch(()=>undefined);};
  const listener=engine.addListener('stopped',event=>{if(event.id===id&&!signal.aborted)onStopped(event.message);});
  signal.addEventListener('abort',stop,{once:true});
  try {
    // Never set playback-only mode here: that stops an active iOS recorder.
    // This configures a session, not a microphone recording or permission request.
    await AudioModule.setAudioModeAsync({allowsRecording:true,playsInSilentMode:true,shouldRouteThroughEarpiece:false});
    await setIsAudioActiveAsync(true);
    if(signal.aborted)throw new Error('Metronome cancelled.');
    await engine.start(id,bpm,beats);
    if(signal.aborted)throw new Error('Metronome cancelled.');
    return {stop:()=>{listener.remove();signal.removeEventListener('abort',stop);stop();}};
  } catch(error){listener.remove();signal.removeEventListener('abort',stop);stop();throw error;}
};
