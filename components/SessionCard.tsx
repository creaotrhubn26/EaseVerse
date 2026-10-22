import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { getGenreProfile } from '@/constants/genres';
import { sessionLyricMatch } from '@/lib/session-library';
import type { Session } from '@/lib/types';

interface SessionCardProps {
  session: Session;
  onPress: () => void;
  onFavorite: () => void;
  onDelete: () => void;
}
function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  return `${Math.floor(seconds/60)}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
}
function recordedAt(timestamp: number) {
  if(!Number.isFinite(timestamp))return 'Date unavailable';
  return new Date(timestamp).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
}
export default function SessionCard({session,onPress,onFavorite,onDelete}: SessionCardProps) {
  const match=sessionLyricMatch(session);
  const genre=session.genre ? getGenreProfile(session.genre) : null;
  return <View style={s.card}>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open session ${session.title}`}
      accessibilityHint={`Recorded ${recordedAt(session.date)}. ${clock(session.duration)}. Opens playback and feedback.`}
      style={({pressed})=>[s.open,pressed&&s.pressed]}>
      <View style={s.playIcon}><Ionicons name={session.recordingUri?'play-outline':'document-text-outline'} size={24} color={Colors.gradientMid}/></View>
      <View style={s.copy}>
        <Text style={s.title} numberOfLines={2}>{session.title}</Text>
        <Text style={s.date}>{recordedAt(session.date)} · {clock(session.duration)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary}/>
    </Pressable>
    <View style={s.footer}>
      <View style={s.details}>
        {genre && <Text style={s.genre}>{genre.label}</Text>}
        <Text style={s.match}>{match!==null ? `${Math.round(match)}% lyrics match` : session.lyrics?.trim() ? 'Text match unavailable' : 'Voice memo · no lyrics'}</Text>
        {session.tags?.length>0 && <Text numberOfLines={2} style={s.tags}>{session.tags.join(' · ')}</Text>}
      </View>
      <Pressable onPress={onFavorite} accessibilityRole="button"
        accessibilityLabel={session.favorite?`Remove ${session.title} from favorites`:`Add ${session.title} to favorites`}
        accessibilityState={{selected:session.favorite}} aria-pressed={session.favorite} style={s.action}>
        <Ionicons name={session.favorite?'heart':'heart-outline'} size={22} color={session.favorite?Colors.gradientMid:Colors.textTertiary}/>
      </Pressable>
      <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel={`Delete recording ${session.title}`}
        accessibilityHint="Asks for confirmation before removing this recording" style={s.action}>
        <Ionicons name="trash-outline" size={20} color={Colors.textTertiary}/>
      </Pressable>
    </View>
  </View>;
}
const s=StyleSheet.create({
  card:{backgroundColor:Colors.surface,borderRadius:20,borderWidth:1,borderColor:Colors.borderGlass,overflow:'hidden'},
  open:{minHeight:88,padding:16,flexDirection:'row',alignItems:'center',gap:12},
  playIcon:{width:44,height:44,borderRadius:14,backgroundColor:Colors.accentSubtle,alignItems:'center',justifyContent:'center'},
  copy:{flex:1,minWidth:0,gap:6},title:{color:Colors.textPrimary,fontSize:16,lineHeight:23,fontFamily:'Inter_600SemiBold'},date:{color:Colors.textTertiary,fontSize:11,lineHeight:17},
  footer:{borderTopWidth:1,borderTopColor:Colors.borderGlass,marginHorizontal:16,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:4},
  details:{flex:1,minWidth:0,gap:4},genre:{fontSize:10,color:Colors.gradientMid,fontFamily:'Inter_600SemiBold'},match:{fontSize:12,lineHeight:18,color:Colors.textSecondary},tags:{fontSize:11,lineHeight:17,color:Colors.textTertiary},
  action:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center',borderRadius:12},pressed:{opacity:0.75},
});
