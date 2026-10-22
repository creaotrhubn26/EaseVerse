export type LyricMatch = { score:number; expectedWords:number; recognizedWords:number; matchedWords:number; substitutions:number; missingWords:number; extraWords:number; wordsToCheck:string[] };
/** No shared words is a transcript mismatch, not evidence of a poor vocal performance. */
export function hasNoSharedLyricWords(comparison:LyricMatch|undefined):boolean{
 return !!comparison&&comparison.expectedWords>0&&comparison.recognizedWords>0&&comparison.matchedWords===0;
}
export function lyricWords(text:string):string[]{
 return (text.normalize('NFKC').replace(/^\s*\[(?:verse|chorus|pre[- ]?chorus|bridge|intro|outro|vers|refreng|bro)(?:\s+\d+)?\]\s*$/gim,'').replace(/’/g,"'").toLowerCase().match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu)??[]);
}
/** Word error alignment measures the transcript against the supplied lyrics, not vocal quality. */
export function matchLyricTranscript(lyrics:string,transcript:string):LyricMatch{
 const a=lyricWords(lyrics),b=lyricWords(transcript);
 if(!a.length||!b.length)throw new Error('No words to compare');
 if(a.length>2000||b.length>2000)throw new Error('Text is too long to compare');
 const rows=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
 for(let i=0;i<=a.length;i++)rows[i][0]=i;for(let j=0;j<=b.length;j++)rows[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)rows[i][j]=Math.min(rows[i-1][j]+1,rows[i][j-1]+1,rows[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
 let i=a.length,j=b.length,matchedWords=0,substitutions=0,missingWords=0,extraWords=0;const check:string[]=[];
 while(i||j){
  if(i&&j&&a[i-1]===b[j-1]&&rows[i][j]===rows[i-1][j-1]){matchedWords++;i--;j--;}
  else if(i&&j&&rows[i][j]===rows[i-1][j-1]+1){substitutions++;check.push(a[i-1]);i--;j--;}
  else if(i&&rows[i][j]===rows[i-1][j]+1){missingWords++;check.push(a[i-1]);i--;}
  else{extraWords++;j--;}
 }
 return {score:Math.max(0,Math.round(100*(1-rows[a.length][b.length]/a.length))),expectedWords:a.length,recognizedWords:b.length,matchedWords,substitutions,missingWords,extraWords,wordsToCheck:[...new Set(check.reverse())].slice(0,5)};
}
