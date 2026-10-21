import {lyricWords,matchLyricTranscript} from './lyric-match';
export type TimingConsistency = 'low' | 'medium' | 'high';
export interface WordFix {word:string;reason:string}
export interface SessionInsights {
 textAccuracy:number;
 /** Legacy wire fields, not acoustic measurements. See measurements below. */
 pronunciationClarity:number;
 timingConsistency:TimingConsistency;
 analysisAvailable?:boolean;
 topToFix:WordFix[];
}
export interface SessionScoringResult {
 transcript:string;expectedWordCount:number;spokenWordCount:number;matchedWordCount:number;
 insights:SessionInsights;
 measurements:{lyricMatch:'measured'|'unavailable';pronunciation:'not_measured';timing:'not_measured'};
}
/** Compatibility adapter: recognised text cannot establish pronunciation or musical timing. */
export function buildSessionScoring({expectedLyrics,transcript}:{expectedLyrics:string;transcript:string;durationSeconds?:number}):SessionScoringResult{
 const expectedWordCount=lyricWords(expectedLyrics).length,spokenWordCount=lyricWords(transcript).length;
 const comparison=expectedWordCount&&spokenWordCount?matchLyricTranscript(expectedLyrics,transcript):null;
 return {transcript,expectedWordCount,spokenWordCount,matchedWordCount:comparison?.matchedWords??0,
  insights:{textAccuracy:comparison?.score??0,pronunciationClarity:0,timingConsistency:'low',analysisAvailable:!!comparison,
   topToFix:comparison?.wordsToCheck.map(word=>({word,reason:'Not matched in the transcript. Listen back and check this word.'}))??[]},
  measurements:{lyricMatch:comparison?'measured':'unavailable',pronunciation:'not_measured',timing:'not_measured'}};
}
