import React, {useMemo,useRef,useState} from 'react';
import {PanResponder,Platform,StyleSheet,Text,View} from 'react-native';
import Colors from '@/constants/colors';

type Props={progress:number;duration?:number;interactive?:boolean;onSeek?:(progress:number)=>void};
const clamp=(value:number)=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
const clock=(value:number)=>`${Math.floor(value/60)}:${Math.floor(value%60).toString().padStart(2,'0')}`;

/** An honest playback timeline. No waveform is drawn without decoded audio peaks. */
export default function WaveformTimeline({progress,duration=0,interactive=false,onSeek}:Props){
  const [width,setWidth]=useState(0),[scrub,setScrub]=useState<number|null>(null),[focused,setFocused]=useState(false);
  const pending=useRef<number|null>(null);
  const ready=interactive&&Number.isFinite(duration)&&duration>0;
  const value=clamp(scrub??progress);
  const update=(x:number)=>{const next=width?clamp(x/width):0;pending.current=next;setScrub(next);};
  const pan=useMemo(()=>PanResponder.create({
    onStartShouldSetPanResponder:()=>ready,
    onMoveShouldSetPanResponder:(_,gesture)=>ready&&Math.abs(gesture.dx)>Math.abs(gesture.dy),
    onPanResponderGrant:event=>update(event.nativeEvent.locationX),
    onPanResponderMove:event=>update(event.nativeEvent.locationX),
    onPanResponderRelease:()=>{if(pending.current!==null)onSeek?.(pending.current);pending.current=null;setScrub(null);},
    onPanResponderTerminate:()=>{pending.current=null;setScrub(null);},
  // update reads the measured track width; no playback position is captured at gesture start.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }),[ready,width,onSeek]);
  return <View style={s.wrapper}>
    <View {...pan.panHandlers} onLayout={event=>setWidth(event.nativeEvent.layout.width)}
      accessibilityRole="adjustable" accessibilityLabel="Playback position"
      accessibilityState={{disabled:!ready}}
      accessibilityValue={{min:0,max:duration||1,now:value*duration,text:`${clock(value*duration)} of ${clock(duration)}`}}
      aria-valuemin={0} aria-valuemax={duration||1} aria-valuenow={value*duration}
      onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
      {...(Platform.OS==='web'?{tabIndex:ready?0:-1,onKeyDown:(event:React.KeyboardEvent)=>{
        if(!ready)return;
        const seconds=event.key==='Home'?0:event.key==='End'?duration:event.key==='ArrowRight'||event.key==='ArrowUp'?value*duration+5:event.key==='ArrowLeft'||event.key==='ArrowDown'?value*duration-5:null;
        if(seconds===null)return;event.preventDefault();onSeek?.(clamp(seconds/duration));
      }}:{})}
      accessibilityActions={ready?[{name:'increment',label:'Forward five seconds'},{name:'decrement',label:'Back five seconds'}]:[]}
      onAccessibilityAction={event=>{if(ready)onSeek?.(clamp(value+(event.nativeEvent.actionName==='increment'?5:-5)/duration));}}
      style={[s.seekTarget,focused&&s.focused]}>
      <View style={s.track}><View style={[s.fill,{width:`${value*100}%`}]}/></View>
      <View style={[s.thumb,{left:`${value*100}%`}]}/>
    </View>
    <View style={s.times}><Text style={s.time}>{clock(value*duration)}</Text><Text style={s.time}>{duration>0?clock(duration):'—'}</Text></View>
  </View>;
}
const s=StyleSheet.create({
  wrapper:{gap:0},seekTarget:{height:44,justifyContent:'center',borderRadius:12,borderWidth:2,borderColor:'transparent'},focused:{borderColor:Colors.gradientMid},
  track:{height:6,borderRadius:4,backgroundColor:Colors.borderGlass,overflow:'hidden',borderWidth:1,borderColor:Colors.textTertiary},fill:{height:'100%',backgroundColor:Colors.gradientMid},
  thumb:{position:'absolute',width:12,height:12,borderRadius:6,backgroundColor:Colors.gradientMid,marginLeft:-6,borderWidth:2,borderColor:Colors.background},
  times:{flexDirection:'row',justifyContent:'space-between'},time:{fontSize:12,color:Colors.textSecondary,fontVariant:['tabular-nums']},
});
