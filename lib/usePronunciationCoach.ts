import {useState,useCallback,useRef,useEffect} from 'react';
import {Platform} from 'react-native';
import {setAudioModeAsync,setIsAudioActiveAsync} from 'expo-audio';
import * as Speech from 'expo-speech';
import {useIsFocused} from '@react-navigation/native';
import {useApp} from '@/lib/AppContext';
import {resolveSpeechRecognitionLang} from './language';
import {playWordPronunciation,type PronunciationBridge} from './word-pronunciation';

export interface PronunciationResult {word:string;phonetic:string;tip:string;slow:string}
export type CoachState='idle'|'loading'|'playing'|'ready'|'error';
const bridge:PronunciationBridge={
 voices:()=>Speech.getAvailableVoicesAsync(),stop:()=>Speech.stop(),speak:(text,options)=>Speech.speak(text,options),
 prepare:async()=>{if(Platform.OS!=='web'){await setAudioModeAsync({allowsRecording:false,playsInSilentMode:true,shouldRouteThroughEarpiece:false});await setIsAudioActiveAsync(true);}},
};
export function usePronunciationCoach(){
 const {settings}=useApp();const focused=useIsFocused();
 const [state,setState]=useState<CoachState>('idle'),[result,setResult]=useState<PronunciationResult|null>(null),[errorMessage,setErrorMessage]=useState<string|null>(null);
 const request=useRef<AbortController|null>(null);const lastWord=useRef('');
 const dismiss=useCallback(()=>{request.current?.abort();request.current=null;setState('idle');setResult(null);setErrorMessage(null);},[]);
 useEffect(()=>{dismiss();return()=>{request.current?.abort();};},[focused,dismiss,settings.language,settings.accentGoal]);
 const pronounce=useCallback(async(word:string,_context?:string,_genre?:string)=>{
  request.current?.abort();const controller=new AbortController();request.current=controller;lastWord.current=word;
  setState('loading');setResult(null);setErrorMessage(null);
  try{
   await playWordPronunciation(word,resolveSpeechRecognitionLang(settings.language,settings.accentGoal),bridge,controller.signal,()=>{if(request.current===controller)setState('playing');});
   if(request.current!==controller||controller.signal.aborted)return;
   setResult({word,phonetic:'',slow:word,tip:'Example pronunciation from your device’s speech voice. This is not audio from your take or a pronunciation assessment.'});setState('ready');
  }catch(error){if(request.current===controller&&!controller.signal.aborted){setState('error');setErrorMessage(error instanceof Error?error.message:'Could not play the example. Try again.');}}
  finally{if(request.current===controller)request.current=null;}
 },[settings.language,settings.accentGoal]);
 const replay=useCallback(()=>pronounce(lastWord.current),[pronounce]);
 return {state,result,errorMessage,pronounce,replay,dismiss};
}
