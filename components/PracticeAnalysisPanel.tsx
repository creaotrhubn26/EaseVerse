import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Text,View} from 'react-native';
import {router} from 'expo-router';
import Colors from '@/constants/colors';
import {useAuth} from '@/lib/creatorhub-auth';
import {localPracticeCapability,transcribePracticeLocally,downloadPracticeLanguage,type LocalPracticeCapability} from '@/lib/practice-recognition';
import {analyzeSessionRecording} from '@/lib/session-scoring-client';
import {matchLyricTranscript} from '@/shared/lyric-match';
import {resolveSpeechRecognitionLang,resolveSttLanguageCode} from '@/lib/language';
import type {Session} from '@/lib/types';

export function PracticeAnalysisPanel({session,language,accentGoal,onResult}:{session:Session;language:string;accentGoal:string;onResult:(patch:Partial<Session>)=>Promise<void>}){
 const {getToken,isSignedIn}=useAuth();
 const [capability,setCapability]=useState<LocalPracticeCapability|null>(null);
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[consent,setConsent]=useState(false),[showTranscript,setShowTranscript]=useState(false);
 const request=useRef<AbortController|null>(null),locked=useRef(false),generation=useRef(0);
 const locale=resolveSpeechRecognitionLang(language,accentGoal);
 useEffect(()=>{let current=true;const scope=++generation.current;setCapability(null);setBusy(null);locked.current=false;setError('');setConsent(false);void localPracticeCapability(locale).then(value=>{if(current)setCapability(value);});return()=>{current=false;generation.current=scope+1;request.current?.abort();};},[locale,session.id]);
 const save=async(transcript:string,comparison:ReturnType<typeof matchLyricTranscript>,provider:NonNullable<Session['analysis']>['provider'])=>onResult({transcript,analysis:{provider,language,analysedAt:Date.now(),comparison},insights:{textAccuracy:comparison.score,analysisAvailable:true,pronunciationClarity:0,timingConsistency:'low',topToFix:comparison.wordsToCheck.map(word=>({word,reason:'Not matched in the transcript. Listen back and check this word.'}))}});
 const analyse=async(mode:'local'|'cloud')=>{
  if(locked.current){setError('An analysis is still finishing. Please retry in a moment.');return;}
  if(!session.recordingUri){setError('Could not find the audio for this take.');return;}
  locked.current=true;setError('');setConsent(false);setBusy(mode==='local'?'Transcribing on this device…':'Transcribing in the cloud…');
  const controller=new AbortController();request.current=controller;const currentGeneration=generation.current;
  try{
   if(mode==='local'){
    const result=await transcribePracticeLocally(session.recordingUri,locale,controller.signal);
    if(!controller.signal.aborted&&currentGeneration===generation.current)await save(result.transcript,matchLyricTranscript(session.lyrics,result.transcript),result.provider);
   }else{
    const result=await analyzeSessionRecording({recordingUri:session.recordingUri,lyrics:session.lyrics,durationSeconds:session.duration,language:resolveSttLanguageCode(language),token:await getToken(),signal:controller.signal,throwOnError:true});
    if(result&&!controller.signal.aborted&&currentGeneration===generation.current)await save(result.transcript,result.comparison,'openai');
   }
  }catch(reason){if(!controller.signal.aborted&&currentGeneration===generation.current)setError(reason instanceof Error?reason.message:'Analysis could not finish.');}
  finally{if(request.current===controller){request.current=null;locked.current=false;setBusy(null);}}
 };
 const download=async()=>{
  if(locked.current)return;
  const currentGeneration=generation.current;
  locked.current=true;setBusy('Preparing the offline language model…');setError('');
  try{
   const message=await downloadPracticeLanguage(locale);
   const next=await localPracticeCapability(locale);
   if(currentGeneration===generation.current){setError(message);setCapability(next);}
  }catch(reason){if(currentGeneration===generation.current)setError(reason instanceof Error?reason.message:'Language download could not start.');}
  finally{if(currentGeneration===generation.current){locked.current=false;setBusy(null);}}
 };

 const disabled=!session.recordingUri||!session.lyrics.trim();
 return <View style={s.card} testID="practice-analysis-panel">
  <Text style={s.title}>Check this take against your lyrics</Text>
  {!!error&&<Text style={s.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>}
  <Text style={s.copy}>The result compares recognised words with your lyrics. It does not score your voice, pronunciation or musical timing.</Text>
  {disabled?<Text style={s.copy}>Add lyrics and an audio recording to compare a take.</Text>:<>
   {busy?<View accessibilityLiveRegion="polite" style={s.status}><ActivityIndicator color={Colors.gradientStart}/><Text style={s.copy}>{busy}</Text>{request.current&&<Pressable style={s.secondary} onPress={()=>request.current?.abort()} accessibilityRole="button"><Text style={s.link}>Cancel analysis</Text></Pressable>}</View>:<>
    <Text style={s.copy}>{capability?.reason??'Checking on-device transcription…'}</Text>
    {capability?.available&&<Pressable style={s.primary} onPress={()=>void analyse('local')} accessibilityRole="button" accessibilityLabel="Analyse lyrics on this device"><Text style={s.primaryText}>Analyse on this device</Text></Pressable>}
    {capability?.canDownload&&<Pressable style={s.secondary} onPress={()=>void download()} accessibilityRole="button"><Text style={s.link}>Download offline language</Text></Pressable>}
    <Pressable style={s.secondary} onPress={()=>setConsent(value=>!value)} accessibilityRole="button" aria-expanded={consent} accessibilityState={{expanded:consent}} accessibilityLabel="Choose cloud lyric analysis"><Text style={s.link}>Use cloud analysis</Text></Pressable>
   </>}
   {consent&&!busy&&<View style={s.consent}>
    <Text style={s.copy}>Send this recording to OpenAI for transcription. EaseVerse compares the recognised words with your lyrics on its server. This is a one-time analysis; your automatic cloud setting stays unchanged. It does not share the take with your producer.</Text>
    {isSignedIn?<Pressable style={s.primary} onPress={()=>void analyse('cloud')} accessibilityRole="button" accessibilityLabel="Send recording for cloud lyric analysis"><Text style={s.primaryText}>Send and analyse this take</Text></Pressable>:<Pressable style={s.primary} onPress={()=>router.push('/(auth)/sign-in')} accessibilityRole="button"><Text style={s.primaryText}>Sign in to use cloud analysis</Text></Pressable>}
    <Pressable style={s.secondary} onPress={()=>setConsent(false)} accessibilityRole="button"><Text style={s.link}>Keep it on this device</Text></Pressable>
   </View>}
  </>}
  {session.analysis&&<View style={s.result}>
   <Text style={s.copy}>Source: {session.analysis.provider==='openai'?'OpenAI transcription':session.analysis.provider==='browser-speech'?'Browser speech recognition':'On-device speech recognition'} · {session.analysis.language}</Text>
   <Text style={s.copy}>{session.analysis.comparison.matchedWords} of {session.analysis.comparison.expectedWords} words matched · {session.analysis.comparison.missingWords} missing · {session.analysis.comparison.extraWords} extra · {session.analysis.comparison.substitutions} different.</Text>
   <Text style={s.copy}>Singing and background music can confuse speech recognition. Listen back and check the transcript.</Text>
   <Pressable style={s.secondary} onPress={()=>setShowTranscript(value=>!value)} accessibilityRole="button" aria-expanded={showTranscript} accessibilityState={{expanded:showTranscript}}><Text style={s.link}>{showTranscript?'Hide recognised words':'Show recognised words'}</Text></Pressable>
   {showTranscript&&<Text style={s.copy} selectable>{session.transcript}</Text>}
  </View>}
 </View>;
}
const s=StyleSheet.create({
 card:{padding:16,gap:12,backgroundColor:Colors.surface,borderColor:Colors.borderGlass,borderWidth:1,borderRadius:16,marginBottom:20},
 title:{fontFamily:'Inter_600SemiBold',fontSize:17,lineHeight:24,color:Colors.textPrimary},
 copy:{fontFamily:'Inter_400Regular',fontSize:13,lineHeight:20,color:Colors.textSecondary,flexShrink:1},
 primary:{minHeight:48,paddingHorizontal:16,paddingVertical:12,borderRadius:12,backgroundColor:Colors.gradientStart,alignItems:'center',justifyContent:'center'},
 primaryText:{fontFamily:'Inter_700Bold',fontSize:14,lineHeight:21,color:'#111318',textAlign:'center'},
 secondary:{minHeight:44,paddingVertical:10,justifyContent:'center'},link:{fontFamily:'Inter_600SemiBold',fontSize:14,lineHeight:21,color:Colors.gradientEnd},
 consent:{gap:12,padding:14,borderRadius:12,backgroundColor:Colors.background},status:{gap:12},error:{fontFamily:'Inter_500Medium',fontSize:13,lineHeight:20,color:Colors.dangerUnderline},result:{gap:10,borderTopWidth:1,borderColor:Colors.borderGlass,paddingTop:12},
});
