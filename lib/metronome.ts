import {startClick} from './click-track';
import type {MetronomeStart} from './metronome-controller';
export const startMetronomeAudio: MetronomeStart = async ({bpm,beats,signal,onStopped}) => {
  if(signal.aborted) throw new Error('Metronome cancelled.');
  const handle=startClick({bpm,beatsPerBar:beats,accentDownbeat:true,onStopped});
  const stop=()=>handle.stop();signal.addEventListener('abort',stop,{once:true});
  try {await handle.ready;if(signal.aborted)throw new Error('Metronome cancelled.');}
  catch(error){stop();signal.removeEventListener('abort',stop);throw error;}
  return {stop:()=>{signal.removeEventListener('abort',stop);stop();}};
};
