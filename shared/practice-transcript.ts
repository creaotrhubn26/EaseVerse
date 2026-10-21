/** Provider diagnostics reject silence/uncertain segments; these are not vocal scores. */
export function usablePracticeTranscript(result:{duration?:number;segments?:{text:string;no_speech_prob:number;avg_logprob:number;compression_ratio:number}[]}):string{
 if(!Number.isFinite(result.duration)||result.duration!<=0||result.duration!>181)return '';
 return (result.segments??[]).filter(segment=>
  Number.isFinite(segment.avg_logprob)&&segment.avg_logprob>=-1&&
  Number.isFinite(segment.compression_ratio)&&segment.compression_ratio<=2.4&&
  Number.isFinite(segment.no_speech_prob)&&segment.no_speech_prob<0.6
 ).map(segment=>segment.text.trim()).filter(Boolean).join(' ').trim();
}
export function practiceAudioFormat(audio:Uint8Array):'wav'|'m4a'|'webm'|null{
 const ascii=(start:number,end:number)=>String.fromCharCode(...audio.slice(start,end));
 if(audio.length<44)return null;
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE')return 'wav';
 if(ascii(4,8)==='ftyp')return 'm4a';
 if(audio[0]===0x1a&&audio[1]===0x45&&audio[2]===0xdf&&audio[3]===0xa3)return 'webm';
 return null;
}
