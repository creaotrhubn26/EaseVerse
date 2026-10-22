import {Platform} from 'react-native';
import {ExpoSpeechRecognitionModule as Speech} from 'expo-speech-recognition';
import type {LocalPracticeCapability,LocalPracticeTranscript} from './practice-recognition';
import {createLocalRecognitionRunner} from './local-recognition-runner';
const normal=(value:string)=>value.toLowerCase().replace('_','-').replace(/^no(?=-|$)/,'nb');
export async function localPracticeCapability(locale:string):Promise<LocalPracticeCapability>{
 try{
  if(Platform.OS==='android'&&Number(Platform.Version)<33)return {available:false,locale,canDownload:false,reason:'Local analysis of saved recordings requires Android 13 or later.'};
  if(!Speech.isRecognitionAvailable()||(Platform.OS==='android'&&!Speech.supportsOnDeviceRecognition()))return {available:false,locale,canDownload:false,reason:'On-device speech recognition is not available on this phone.'};
  const supported=await Speech.getSupportedLocales({});
  const installed=supported.installedLocales.find(value=>normal(value)===normal(locale))??(!locale.includes('-')?supported.installedLocales.find(value=>normal(value).split('-')[0]===normal(locale)):undefined);
  return {available:!!installed,locale:installed??locale,canDownload:Platform.OS==='android'&&Number(Platform.Version)>=33&&!installed,reason:installed?'On-device transcription is available for this language.':'The offline speech model for this language is not installed.'};
 }catch{return {available:false,locale,canDownload:false,reason:'Could not check the local speech model. Try again.'};}
}
export async function downloadPracticeLanguage(locale:string):Promise<string>{
 if(Platform.OS!=='android')throw new Error('Language download is unavailable here.');
 const result=await Speech.androidTriggerOfflineModelDownload({locale});return result.message;
}
const run=createLocalRecognitionRunner({
 state:()=>Speech.getStateAsync(),
 prepare:async locale=>{
  const capability=await localPracticeCapability(locale);if(!capability.available)throw new Error(capability.reason);
  const permission=await Speech.requestMicrophonePermissionsAsync();if(!permission.granted)throw new Error('Microphone permission was not granted. Your recording is still saved.');
 },
 on:(event,callback)=>Speech.addListener(event,callback),
 start:options=>Speech.start(options),
 abort:()=>Speech.abort(),
});
export async function transcribePracticeLocally(uri:string,locale:string,signal?:AbortSignal):Promise<LocalPracticeTranscript>{
 const capability=await localPracticeCapability(locale);
 if(!capability.available)throw new Error(capability.reason);
 const transcript=await run(uri,capability.locale,signal);
 return {transcript,provider:Platform.OS==='ios'?'apple-speech':'android-speech'};
}
