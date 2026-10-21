import type {VercelRequest,VercelResponse} from '@vercel/node';
import {requireAuth} from '../_lib/auth.js';
import {getUser,reservePracticeAnalysis} from '../_lib/users-db.js';
import {getInvitedStudioProjects} from '../_lib/creatorhub-project-links.js';
import {transcribePractice,transcriptionConfigured} from '../_lib/practice-transcription.js';
import {practiceAudioFormat} from '../../shared/practice-transcript.js';
import {matchLyricTranscript,lyricWords} from '../../shared/lyric-match.js';
export function createPracticeAnalysisHandler(deps={auth:requireAuth,user:getUser,projects:getInvitedStudioProjects,reserve:reservePracticeAnalysis,configured:transcriptionConfigured,transcribe:transcribePractice}){
 return async(req:VercelRequest,res:VercelResponse)=>{
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'method_not_allowed'});}
  const actor=await deps.auth(req,res);if(!actor)return;
  const b=req.body;
  if(!b||b.consent!==true)return res.status(400).json({error:'analysis_consent_required'});
  if(typeof b.lyrics!=='string'||!b.lyrics.trim()||b.lyrics.length>12000||typeof b.audioBase64!=='string'||!b.audioBase64||!Number.isFinite(b.durationSeconds)||b.durationSeconds<1||b.durationSeconds>180)return res.status(400).json({error:'invalid_recording'});
  if(b.audioBase64.length>4_000_000)return res.status(413).json({error:'recording_too_large'});
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(b.audioBase64))return res.status(400).json({error:'invalid_recording'});
  if(!lyricWords(b.lyrics).length||lyricWords(b.lyrics).length>2000)return res.status(400).json({error:'lyrics_too_long'});
  try{
   const user=await deps.user(actor);
   if(!user||user.status==='banned')return res.status(403).json({error:'analysis_access_required'});
   if(!['approved','admin'].includes(user.status)&&!(await deps.projects(actor)).length)return res.status(403).json({error:'analysis_access_required'});
   if(!deps.configured())return res.status(503).json({error:'transcription_unavailable'});
   const audio=Buffer.from(b.audioBase64,'base64');
   if(!practiceAudioFormat(audio))return res.status(400).json({error:'invalid_recording'});
   if(!await deps.reserve(actor))return res.status(429).json({error:'analysis_limit_reached'});
   const language=typeof b.language==='string'&&/^[a-z]{2}(?:[-_][A-Z]{2})?$/.test(b.language)?b.language.split(/[-_]/)[0]:undefined;
   const transcript=await deps.transcribe(audio,language);
   if(!lyricWords(transcript).length)return res.status(422).json({error:'no_words_detected'});
   const comparison=matchLyricTranscript(b.lyrics,transcript);
   return res.json({transcript,comparison,provider:'openai',method:'transcription_text_match',insights:{textAccuracy:comparison.score,analysisAvailable:true,pronunciationClarity:0,timingConsistency:'low',topToFix:comparison.wordsToCheck.map(word=>({word,reason:'Not matched in the transcript. Listen back and check this word.'}))},measurements:{lyricMatch:'measured',pronunciation:'not_measured',timing:'not_measured'}});
  }catch{return res.status(503).json({error:'analysis_temporarily_unavailable'});}
 };
}
export default createPracticeAnalysisHandler();
