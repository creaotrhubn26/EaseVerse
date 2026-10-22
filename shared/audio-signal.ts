/** Reject digital/near silence only. This is not a speech/music classifier or singing score. */
export function hasAudibleSignal(samples:Float32Array):boolean{
 if(!samples.length)return false;
 let sum=0,peak=0;
 for(const sample of samples){if(!Number.isFinite(sample))return false;sum+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
 return peak>0.0001&&Math.sqrt(sum/samples.length)>0.00001;
}
