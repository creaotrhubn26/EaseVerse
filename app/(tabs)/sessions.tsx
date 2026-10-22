import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import SwipeableSessionCard from '@/components/SwipeableSessionCard';
import { TakesSection } from '@/components/TakesSection';
import { useApp } from '@/lib/AppContext';
import { selectLibrarySessions, type SessionLibraryFilter } from '@/lib/session-library';
import { useResponsiveLayout } from '@/lib/responsive';
import type { Session } from '@/lib/types';

const artwork = require('@/assets/images/sessions-headphones-amber-v1.jpg');
const filters: {key: SessionLibraryFilter; label: string}[] = [
  {key:'latest',label:'Latest'}, {key:'match',label:'Lyrics match'}, {key:'favorites',label:'Favorites'},
];

export default function SessionsScreen() {
  const insets = useSafeAreaInsets();
  const responsive = useResponsiveLayout();
  const {sessions, toggleFavorite, removeSession, isLoading} = useApp();
  const [filter, setFilter] = useState<SessionLibraryFilter>('latest');
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null);
  const [notice, setNotice] = useState('');
  const visible = useMemo(() => selectLibrarySessions(sessions, filter, query), [sessions,filter,query]);
  const noRecordings = sessions.length === 0;
  const goToSing = () => router.push('/(tabs)');
  const clearFilters = () => {setQuery('');setFilter('latest');};

  return <View style={[s.screen,{paddingTop:insets.top}]}>
    <View style={[s.header,{paddingHorizontal:responsive.contentPadding,maxWidth:responsive.contentMaxWidth}]}>
      <View style={s.headingCopy}>
        <View style={s.headingRow}>
          <Image source={artwork} style={s.headingArt} accessible={false} />
          <Text accessibilityRole="header" style={s.title}>Sessions</Text>
        </View>
        <Text style={s.subtitle}>Listen back. Find your next step.</Text>
      </View>
      <Pressable onPress={goToSing} accessibilityRole="button" accessibilityLabel="Start a new take"
        accessibilityHint="Opens Sing. Recording starts only when you tap Record."
        style={({pressed})=>[s.newTake,pressed&&s.pressed]}>
        <Ionicons name="add" size={20} color={Colors.gradientMid}/><Text style={s.newTakeText}>New take</Text>
      </Pressable>
    </View>
    <FlatList data={isLoading ? [] : visible} keyExtractor={item=>item.id}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{width:'100%',maxWidth:responsive.contentMaxWidth,alignSelf:'center',paddingHorizontal:responsive.contentPadding,paddingBottom:Math.max(20,insets.bottom)+110,gap:12}}
      ListHeaderComponent={<View style={s.listHeader}>
        <TakesSection horizontalMargin={0} collapsible />
        <View style={s.libraryHeading}>
          <Text accessibilityRole="header" style={s.sectionTitle}>Your recordings</Text>
          <Text testID="sessions-local-count" style={s.count}>{sessions.length} {sessions.length===1?'take':'takes'} · on this device</Text>
        </View>
        {!noRecordings && <>
          <View style={s.searchBox}>
            <Ionicons name="search-outline" size={20} color={Colors.textTertiary}/>
            <TextInput value={query} onChangeText={setQuery} placeholder="Find a song or recording"
              placeholderTextColor={Colors.textTertiary} accessibilityLabel="Search your recordings"
              accessibilityHint="Searches titles, genres and tags saved on this device"
              autoCorrect={false} style={s.searchInput}/>
            {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear recording search" onPress={()=>setQuery('')} style={s.iconButton}>
              <Ionicons name="close-circle" size={20} color={Colors.textSecondary}/>
            </Pressable>}
          </View>
          <View style={s.filters} accessibilityLabel="Recording filters">
            {filters.map(item=><Pressable key={item.key} accessibilityRole="button"
              accessibilityLabel={`Filter by ${item.label}`} accessibilityState={{selected:filter===item.key}} aria-pressed={filter===item.key}
              onPress={()=>setFilter(item.key)} style={[s.filter,filter===item.key&&s.filterSelected]}>
              <Text style={[s.filterText,filter===item.key&&s.selectedText]}>{item.label}</Text>
            </Pressable>)}
          </View>
          <Text accessibilityLiveRegion="polite" aria-live="polite" style={s.resultCount}>
            {visible.length} {visible.length===1?'recording':'recordings'}{filter==='match'?' · sorted by matched lyric words':''}
          </Text>
        </>}
        {!!notice && <Text accessibilityLiveRegion="polite" aria-live="polite" style={s.notice}>{notice}</Text>}
      </View>}
      renderItem={({item})=><SwipeableSessionCard session={item}
        onPress={()=>router.push({pathname:'/session/[id]',params:{id:item.id}})}
        onFavorite={()=>toggleFavorite(item.id)} onDelete={()=>setPendingDelete(item)}/>}
      ListEmptyComponent={isLoading ? <ActivityIndicator accessibilityLabel="Loading recordings" color={Colors.gradientMid} style={s.loading}/> : noRecordings ?
        <View style={[s.emptyCard,responsive.width>=720&&s.emptyCardWide]}>
          <View style={[s.artworkBox,responsive.width>=720&&s.artworkBoxWide]}><Image source={artwork} style={s.artwork} resizeMode="cover" accessible={false}/></View>
          <View style={[s.emptyCopy,responsive.width>=720&&s.emptyCopyWide]}>
            <Text style={s.eyebrow}>YOUR RECORDING LIBRARY</Text>
            <Text accessibilityRole="header" style={s.emptyTitle}>Every take has a place.</Text>
            <Text style={s.description}>Finish a take in Sing, then come back to listen, review and save your favorites.</Text>
            <Pressable onPress={goToSing} accessibilityRole="button" accessibilityLabel="Go to Sing to record your first take"
              accessibilityHint="Opens the singing screen without starting the microphone"
              style={({pressed})=>[s.primary,pressed&&s.pressed]}>
              <Ionicons name="mic-outline" size={21} color={Colors.background}/><Text style={s.primaryText}>Record your first take</Text>
              <Ionicons name="arrow-forward" size={19} color={Colors.background}/>
            </Pressable>
          </View>
        </View> : <View style={s.noResults}>
          <Ionicons name={query.trim()?'search-outline':'heart-outline'} size={30} color={Colors.gradientMid}/>
          <Text accessibilityRole="header" style={s.sectionTitle}>{query.trim()?'No matching recordings':'No favorites yet'}</Text>
          <Text style={s.description}>{query.trim()?'Try a different title, genre or tag.':'Tap the heart on a recording to keep it here.'}</Text>
          <Pressable onPress={clearFilters} accessibilityRole="button" style={s.clearButton}><Text style={s.newTakeText}>Show all recordings</Text></Pressable>
        </View>}
    />
    <Modal visible={!!pendingDelete} transparent animationType="fade" onRequestClose={()=>setPendingDelete(null)} accessibilityViewIsModal>
      <View style={s.modalOverlay}>
        <View style={s.dialog} accessibilityViewIsModal>
          <Text accessibilityRole="header" style={s.dialogTitle}>Delete this recording?</Text>
          <Text style={s.dialogName}>{pendingDelete?.title}</Text>
          <Text style={s.description}>This removes the recording from Sessions on this device.</Text>
          <View style={s.dialogActions}>
            <Pressable onPress={()=>setPendingDelete(null)} accessibilityRole="button" style={s.cancelButton}><Text style={s.cancelText}>Keep recording</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Confirm delete recording"
              onPress={()=>{if(pendingDelete){removeSession(pendingDelete.id);setNotice('Recording removed.');}setPendingDelete(null);}}
              style={s.deleteButton}><Text style={s.deleteText}>Delete</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </View>;
}
const s=StyleSheet.create({
  screen:{flex:1,backgroundColor:Colors.background},
  header:{width:'100%',alignSelf:'center',paddingVertical:18,flexDirection:'row',alignItems:'center',gap:12},
  headingCopy:{flex:1,minWidth:0,gap:9}, headingRow:{flexDirection:'row',alignItems:'center',gap:10},
  headingArt:{width:40,height:40,borderRadius:12},title:{fontSize:28,fontFamily:'Inter_700Bold',color:Colors.textPrimary},
  subtitle:{fontSize:12,lineHeight:18,color:Colors.textTertiary},
  newTake:{minHeight:44,flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:4},
  newTakeText:{fontSize:13,color:Colors.gradientMid,fontFamily:'Inter_600SemiBold'},
  listHeader:{gap:14},libraryHeading:{gap:4,paddingTop:4},sectionTitle:{fontSize:18,color:Colors.textPrimary,fontFamily:'Inter_600SemiBold'},
  count:{fontSize:12,lineHeight:18,color:Colors.textTertiary},
  searchBox:{minHeight:48,flexDirection:'row',alignItems:'center',gap:10,backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.borderGlass,borderRadius:14,paddingLeft:14,paddingRight:4},
  searchInput:{flex:1,minWidth:0,fontSize:14,color:Colors.textPrimary,paddingVertical:13},iconButton:{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'},
  filters:{flexDirection:'row',gap:7},filter:{flex:1,minWidth:0,minHeight:44,justifyContent:'center',alignItems:'center',borderRadius:12,borderWidth:1,borderColor:Colors.borderGlass,backgroundColor:Colors.surfaceGlass,paddingHorizontal:4},
  filterSelected:{backgroundColor:Colors.accentSubtle,borderColor:Colors.accentBorder},filterText:{fontSize:12,fontFamily:'Inter_600SemiBold',color:Colors.textSecondary},selectedText:{color:Colors.gradientMid},
  resultCount:{fontSize:12,lineHeight:18,color:Colors.textTertiary},notice:{fontSize:13,color:Colors.textSecondary,paddingVertical:8},
  emptyCard:{borderRadius:24,overflow:'hidden',backgroundColor:Colors.surface,borderWidth:1,borderColor:Colors.borderGlass},
  emptyCardWide:{flexDirection:'row',minHeight:300},artworkBoxWide:{width:'44%',aspectRatio:undefined},emptyCopyWide:{flex:1,justifyContent:'center',padding:28},
  artworkBox:{width:'100%',aspectRatio:2,overflow:'hidden'},artwork:{...StyleSheet.absoluteFillObject,width:'100%',height:'100%'},
  emptyCopy:{padding:20,gap:14},eyebrow:{fontSize:10,letterSpacing:1.4,fontFamily:'Inter_600SemiBold',color:Colors.gradientMid},
  emptyTitle:{fontSize:28,lineHeight:34,fontFamily:'Inter_700Bold',color:Colors.textPrimary},description:{fontSize:14,lineHeight:22,color:Colors.textSecondary},
  primary:{minHeight:52,borderRadius:14,flexDirection:'row',alignItems:'center',gap:9,padding:14,backgroundColor:Colors.gradientStart,marginTop:4},primaryText:{flex:1,fontSize:14,fontFamily:'Inter_700Bold',color:Colors.background},
  pressed:{opacity:0.75},noResults:{padding:24,gap:12,alignItems:'flex-start',backgroundColor:Colors.surface,borderRadius:20},clearButton:{minHeight:44,justifyContent:'center'},loading:{padding:40},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.72)',justifyContent:'center',padding:20},dialog:{width:'100%',maxWidth:420,alignSelf:'center',backgroundColor:Colors.surface,borderRadius:24,borderWidth:1,borderColor:Colors.borderGlass,padding:24,gap:15},
  dialogTitle:{fontSize:22,lineHeight:28,fontFamily:'Inter_700Bold',color:Colors.textPrimary},dialogName:{fontSize:15,lineHeight:22,fontFamily:'Inter_600SemiBold',color:Colors.textSecondary},dialogActions:{flexDirection:'row',gap:12},
  cancelButton:{flex:1,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:12,borderWidth:1,borderColor:Colors.borderGlass,paddingHorizontal:8},cancelText:{fontSize:13,color:Colors.textPrimary,fontFamily:'Inter_600SemiBold'},
  deleteButton:{minWidth:84,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:Colors.dangerUnderline,paddingHorizontal:12},deleteText:{fontSize:13,color:Colors.background,fontFamily:'Inter_700Bold'},
});
