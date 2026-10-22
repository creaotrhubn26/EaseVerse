import {useEffect,useRef,useState,useCallback} from 'react';
import {AppState} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {createMetronomeController,type MetronomeState} from './metronome-controller';
import {startMetronomeAudio} from './metronome';

export function useMetronome() {
  const [state,setState]=useState<MetronomeState>({status:'idle',bpm:null});
  const alive=useRef(true);
  const engine=useRef<ReturnType<typeof createMetronomeController>|null>(null);
  engine.current??=createMetronomeController(startMetronomeAudio,next=>{if(alive.current)setState(next);});
  const focused=useIsFocused();
  const start=useCallback((bpm:number,beats=4)=>engine.current!.start(bpm,beats),[]);
  const stop=useCallback(()=>engine.current!.stop(),[]);
  useEffect(()=>{if(!focused)stop();},[focused,stop]);
  useEffect(()=>{alive.current=true;const subscription=AppState.addEventListener('change',value=>{if(value!=='active')stop();});return()=>{alive.current=false;subscription.remove();stop();};},[stop]);
  return {...state,start,stop};
}
