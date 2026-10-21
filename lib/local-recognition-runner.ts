export type SpeechBridge={
 prepare:(locale:string)=>Promise<void>;
 state:()=>Promise<string>;
 on:(event:'start'|'result'|'end'|'error',callback:(event:any)=>void)=>{remove:()=>void};
 start:(options:{lang:string;requiresOnDeviceRecognition:true;interimResults:true;continuous:false;audioSource:{uri:string};addsPunctuation:false})=>void;
 abort:()=>void;
};
export function createLocalRecognitionRunner(bridge:SpeechBridge,timeoutMs=60000){
 let active=false;
 return async(uri:string,locale:string,signal?:AbortSignal):Promise<string>=>{
  if(active)throw new Error('Another speech analysis is running. Try again when it finishes.');
  if(!uri.startsWith('file://'))throw new Error('This recording is not available as a local audio file.');
  if(signal?.aborted)throw new Error('Analysis cancelled.');
  active=true;
  try{
   if(await bridge.state()!=='inactive')throw new Error('Speech recognition is still finishing. Please retry.');
   await bridge.prepare(locale);
   if(signal?.aborted)throw new Error('Analysis cancelled.');
   return await new Promise<string>((resolve,reject)=>{
    let final='',settled=false,begun=false;const listeners:{remove:()=>void}[]=[];
    const cleanup=()=>{clearTimeout(timer);listeners.forEach(s=>s.remove());signal?.removeEventListener('abort',cancel);};
    const fail=(message:string)=>{if(settled)return;settled=true;try{bridge.abort();}catch{}cleanup();reject(new Error(message));};
    const cancel=()=>fail('Analysis cancelled. Your recording is still saved.');
    const timer=setTimeout(()=>fail('Local transcription timed out. You can retry or choose cloud analysis.'),timeoutMs);
    listeners.push(bridge.on('start',()=>{begun=true;}));
    listeners.push(bridge.on('result',event=>{if(event.isFinal)final=event.results[0]?.transcript?.trim()??'';}));
    listeners.push(bridge.on('error',event=>fail(event.error==='no-speech'?'No words were recognised. Try a clearer vocal take.':'Local transcription could not finish. Your recording is still saved.')));
    listeners.push(bridge.on('end',()=>{if(settled||!begun)return;settled=true;cleanup();if(!final)return reject(new Error('No final words were recognised. Try again or choose cloud analysis.'));resolve(final);}));
    signal?.addEventListener('abort',cancel,{once:true});
    if(signal?.aborted)return cancel();
    try{bridge.start({lang:locale,requiresOnDeviceRecognition:true,interimResults:true,continuous:false,audioSource:{uri},addsPunctuation:false});}catch{fail('Could not start local transcription. Your recording is still saved.');}
   });
  }finally{active=false;}
 };
}
