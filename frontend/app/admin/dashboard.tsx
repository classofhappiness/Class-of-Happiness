import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const ZONE_COLORS: Record<string,string> = { blue:'#4A90D9', green:'#4CAF50', yellow:'#FFC107', red:'#F44336' };
const ZONE_LABELS: Record<string,string> = { blue:'Low Energy', green:'Steady', yellow:'Stressed', red:'Overloaded' };
const ZONES = ['blue','green','yellow','red'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

async function apiCall(endpoint: string, token: string|null, options: any = {}) {
  const headers: any = { 'Content-Type':'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api${endpoint}`, { headers, ...options });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function MiniBar({ data, color }: { data:number[], color:string }) {
  const max = Math.max(...data, 1);
  return (
    <View style={{ flexDirection:'row', gap:3, alignItems:'flex-end', height:44, marginTop:8 }}>
      {data.map((v,i) => (
        <View key={i} style={{ flex:1, alignItems:'center', gap:2 }}>
          <View style={{ width:'100%', height:36, justifyContent:'flex-end', backgroundColor:'#F0F0F0', borderRadius:4 }}>
            <View style={{ width:'100%', height:`${Math.round((v/max)*100)}%` as any, backgroundColor:color, borderRadius:4, minHeight:3 }}/>
          </View>
          <Text style={{ fontSize:8, color:'#AAA' }}>{DAYS[i][0]}</Text>
        </View>
      ))}
    </View>
  );
}

function StatCard({ label, value, icon, color, graphData, detail }: any) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity style={[styles.statCard,{borderTopColor:color}]} onPress={()=>setOpen(!open)} activeOpacity={0.8}>
      <MaterialIcons name={icon} size={24} color={color}/>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <MaterialIcons name={open?'expand-less':'expand-more'} size={14} color="#CCC" style={{marginTop:2}}/>
      {open && (
        <View style={{width:'100%'}}>
          <MiniBar data={graphData||[0,0,0,0,0,0,0]} color={color}/>
          {detail ? <Text style={{fontSize:10,color:'#888',marginTop:6,lineHeight:14}}>{detail}</Text> : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

function ColourRow({ zone, count, total }: { zone:string, count:number, total:number }) {
  const pct = total > 0 ? Math.round((count/total)*100) : 0;
  return (
    <View style={styles.colourRow}>
      <View style={[styles.colourDot,{backgroundColor:ZONE_COLORS[zone]}]}/>
      <Text style={styles.colourLabel}>{ZONE_LABELS[zone]}</Text>
      <View style={styles.colourBarBg}>
        <View style={[styles.colourBar,{width:`${pct}%` as any,backgroundColor:ZONE_COLORS[zone]}]}/>
      </View>
      <Text style={styles.colourPct}>{pct}%</Text>
      <Text style={[styles.colourPct,{width:30,color:'#AAA'}]}>{count}</Text>
    </View>
  );
}

function StrategyManager({ authToken, isSuperAdmin }: { authToken:string|null, isSuperAdmin:boolean }) {
  const [type, setType] = useState<'teacher'|'student'>('teacher');
  const [strats, setStrats] = useState<any[]>([]);
  const [zone, setZone] = useState('blue');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, [type]);

  const load = async () => {
    setLoading(true);
    try {
      if (type === 'teacher') {
        const d = await apiCall('/admin/teacher-strategies', authToken);
        setStrats(Array.isArray(d) ? d.map((s:any)=>({...s,zone:s.zone||'blue'})) : []);
      } else {
        // Load all zones using correct endpoint format
        const all = await Promise.all(ZONES.map(z =>
          apiCall(`/strategies?zone=${z}`, authToken)
            .then((d:any[]) => (Array.isArray(d)?d:[]).map(s => ({...s, zone: s.zone||s.feeling_colour||z})))
            .catch(()=>[])
        ));
        // Flatten and deduplicate
        const flat = all.flat();
        const seen = new Set();
        setStrats(flat.filter((s:any) => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        }));
      }
    } catch { setStrats([]); }
    finally { setLoading(false); }
  };

  const save = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    const ep = type==='teacher' ? '/admin/teacher-strategies' : '/strategies';
    try {
      if (editing) {
        await apiCall(`${ep}/${editing.id}`, authToken, { method:'PUT', body:JSON.stringify({name,description:desc,zone,icon:'star'}) });
      } else {
        await apiCall(ep, authToken, { method:'POST', body:JSON.stringify({name,description:desc,zone,icon:'star'}) });
      }
      setName(''); setDesc(''); setEditing(null);
      Alert.alert('Saved'); load();
    } catch { Alert.alert('Error','Could not save strategy.'); }
  };

  const del = (s: any) => {
    Alert.alert('Delete',`Delete "${s.name}"?`,[
      {text:'Cancel',style:'cancel'},
      {text:'Delete',style:'destructive',onPress:async()=>{
        const ep = type==='teacher' ? '/admin/teacher-strategies' : '/strategies';
        try { await apiCall(`${ep}/${s.id}`,authToken,{method:'DELETE'}); load(); }
        catch { Alert.alert('Error','Could not delete.'); }
      }},
    ]);
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Strategies</Text>
      <Text style={styles.sectionSubtitle}>{isSuperAdmin ? 'Global — affect ALL schools. Add, edit and delete.' : 'Add strategies for your school. Cannot edit global ones.'}</Text>
      <View style={styles.typeRow}>
        {(['teacher','student'] as const).map(t => (
          <TouchableOpacity key={t} style={[styles.typeChip,type===t&&styles.typeChipActive]} onPress={()=>setType(t)}>
            <Text style={[styles.typeChipText,type===t&&styles.typeChipTextActive]}>{t==='teacher'?'👩‍🏫 Teacher':'🧒 Student'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.addStratBox}>
        <Text style={styles.addStratTitle}>{editing?'Edit':'Add'} {type} strategy</Text>
        <View style={styles.zoneRow}>
          {ZONES.map(z => (
            <TouchableOpacity key={z} style={[styles.zoneChip,{backgroundColor:ZONE_COLORS[z],opacity:zone===z?1:0.3}]} onPress={()=>setZone(z)}>
              <Text style={styles.zoneChipText}>{z[0].toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={styles.input} placeholder="Strategy name..." value={name} onChangeText={setName} placeholderTextColor="#AAA"/>
        <TextInput style={styles.input} placeholder="Description..." value={desc} onChangeText={setDesc} placeholderTextColor="#AAA"/>
        <View style={{flexDirection:'row',gap:8}}>
          <TouchableOpacity style={[styles.addBtn,{flex:1}]} onPress={save}>
            <MaterialIcons name={editing?'save':'add'} size={18} color="white"/>
            <Text style={styles.addBtnText}>{editing?'Save':'Add Strategy'}</Text>
          </TouchableOpacity>
          {editing && (
            <TouchableOpacity style={[styles.addBtn,{backgroundColor:'#E0E0E0',paddingHorizontal:16,flex:0}]} onPress={()=>{setEditing(null);setName('');setDesc('');}}>
              <Text style={[styles.addBtnText,{color:'#666'}]}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {loading ? <ActivityIndicator color="#5C6BC0" style={{marginTop:16}}/> : (
        <>
          <Text style={styles.sectionTitle}>{type==='teacher'?'Teacher':'Student'} Strategies ({strats.length})</Text>
          {strats.length===0 && <Text style={styles.emptyText}>No strategies yet. Add one above.</Text>}
          {strats.map((s,i) => (
            <View key={s.id||i} style={styles.stratCard}>
              <View style={[styles.stratDot,{backgroundColor:ZONE_COLORS[s.zone]||'#999'}]}/>
              <View style={styles.stratInfo}>
                <Text style={styles.stratName}>{s.name}</Text>
                {s.description ? <Text style={styles.stratDesc}>{s.description}</Text> : null}
              </View>
              <View style={[styles.zonePill,{backgroundColor:(ZONE_COLORS[s.zone]||'#999')+'25'}]}>
                <Text style={[styles.zonePillText,{color:ZONE_COLORS[s.zone]||'#999'}]}>{s.zone}</Text>
              </View>
              {isSuperAdmin ? (
                <>
                  <TouchableOpacity onPress={()=>{
                    setEditing(s);
                    setName(s.name||'');
                    setDesc(s.description||'');
                    setZone(s.zone||s.feeling_colour||'blue');
                    // Scroll hint
                    Alert.alert('Edit Mode', `Editing "${s.name}" — update the form above and tap Save.`);
                  }} style={{marginLeft:8}}>
                    <MaterialIcons name="edit" size={18} color="#5C6BC0"/>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={()=>del(s)} style={{marginLeft:8}}>
                    <MaterialIcons name="delete" size={18} color="#F44336"/>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={{marginLeft:8,opacity:0.3}}>
                  <MaterialIcons name="lock" size={16} color="#999"/>
                </View>
              )}
            </View>
          ))}
        </>
      )}
    </View>
  );
}


// ── World Wall ───────────────────────────────────────────────────────────────
function WorldWall({ authToken }: { authToken:string|null }) {
  const [schools, setSchools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiCall('/schools/world-wall', authToken)
      .then(d => setSchools(Array.isArray(d)?d:[]))
      .catch(()=>setSchools([]))
      .finally(()=>setLoading(false));
  }, []);

  if (loading) return <ActivityIndicator color="#5C6BC0" style={{marginVertical:12}}/>;

  if (schools.length === 0) return (
    <View style={[styles.infoBox,{backgroundColor:'#F3E5F5'}]}>
      <Text style={{fontSize:24}}>🌱</Text>
      <Text style={[styles.infoText,{color:'#7B1FA2'}]}>
        Be the first school to join! Schools appear here once they register their profile in Settings.
      </Text>
    </View>
  );

  return (
    <View style={{backgroundColor:'white',borderRadius:14,padding:14,marginBottom:8}}>
      <Text style={{fontSize:12,color:'#888',marginBottom:10}}>
        {schools.length} school{schools.length!==1?'s':''} using Class of Happiness 🎉
      </Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        {schools.map((s,i)=>(
          <View key={i} style={{
            backgroundColor:'#F8F9FA',borderRadius:12,padding:10,
            alignItems:'center',minWidth:80,borderWidth:1,borderColor:'#E8EAF6'
          }}>
            <Text style={{fontSize:28}}>{s.flag||'🌍'}</Text>
            <Text style={{fontSize:11,fontWeight:'600',color:'#333',textAlign:'center',marginTop:4}}>{s.name}</Text>
            {s.city ? <Text style={{fontSize:10,color:'#888',textAlign:'center'}}>{s.city}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function SuperAdminDashboard({ authToken, user }: { authToken:string|null, user:any }) {
  const [tab, setTab] = useState<'analytics'|'strategies'|'settings'>('analytics');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [showUnlink, setShowUnlink] = useState(false);
  const [unlinkEmail, setUnlinkEmail] = useState('');
  const [unlinkType, setUnlinkType] = useState<'teacher'|'parent'>('teacher');

  useEffect(() => { if (tab==='analytics') loadStats(); }, [tab]);

  const loadStats = async () => {
    setLoading(true);
    try { const d = await apiCall('/admin/stats', authToken); setStats(d); } catch { setStats(null); }
    finally { setLoading(false); }
  };

  const doUnlink = async () => {
    if (!unlinkEmail.trim()) { Alert.alert('Enter email'); return; }
    try {
      await apiCall('/admin/unlink-user', authToken, { method:'POST', body:JSON.stringify({email:unlinkEmail.trim(),type:unlinkType}) });
      Alert.alert('Unlinked',`${unlinkEmail} has been unlinked.`);
      setShowUnlink(false); setUnlinkEmail('');
    } catch { Alert.alert('Error','Could not unlink. Check the email is correct.'); }
  };

  const zc = stats?.zone_counts||{};
  const tzc = Object.values(zc).reduce((a:any,b:any)=>a+b,0) as number;
  const tc = stats?.teacher_zone_counts||{};
  const ttc = Object.values(tc).reduce((a:any,b:any)=>a+b,0) as number;

  return (
    <>
      <View style={styles.tabBar}>
        {[{id:'analytics',icon:'bar-chart',label:'Analytics'},{id:'strategies',icon:'lightbulb',label:'Strategies'},{id:'settings',icon:'settings',label:'App Info'}].map(t=>(
          <TouchableOpacity key={t.id} style={[styles.tab,tab===t.id&&styles.tabActive]} onPress={()=>setTab(t.id as any)}>
            <MaterialIcons name={t.icon as any} size={20} color={tab===t.id?'#3949AB':'#999'}/>
            <Text style={[styles.tabLabel,tab===t.id&&{color:'#3949AB',fontWeight:'700'}]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && <ActivityIndicator size="large" color="#3949AB" style={{marginTop:40}}/>}

        {!loading && tab==='analytics' && (
          <View>
            <Text style={styles.sectionTitle}>Global Analytics</Text>
            <Text style={styles.sectionSubtitle}>Tap any card to expand. No individual names or comments shown.</Text>
            <View style={styles.statsGrid}>
              <StatCard label="Students" value={stats?.total_students??'—'} icon="child-care" color="#4CAF50"
                graphData={stats?.student_daily||[0,0,0,0,0,0,0]}
                detail={`Avg daily: ${stats?.avg_student_daily??'—'} · Peak: ${stats?.peak_student_day??'—'}`}/>
              <StatCard label="Teachers" value={stats?.total_teachers??'—'} icon="school" color="#FFC107"
                graphData={stats?.teacher_daily||[0,0,0,0,0,0,0]}
                detail={`Support requests this month: ${stats?.support_requests??'—'}`}/>
              <StatCard label="Check-ins Today" value={stats?.checkins_today??'—'} icon="favorite" color="#4A90D9"
                graphData={stats?.checkin_daily||[0,0,0,0,0,0,0]}
                detail={`Total all time: ${stats?.total_checkins??'—'}`}/>
              <StatCard label="Schools" value={stats?.total_schools??'—'} icon="account-balance" color="#9C27B0"
                graphData={stats?.school_daily||[0,0,0,0,0,0,0]}
                detail={`Avg session: ${stats?.avg_session_mins??'—'} mins`}/>
            </View>

            <Text style={[styles.sectionTitle,{marginTop:20}]}>Student Emotion Colours — All Schools</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(z=><ColourRow key={z} zone={z} count={zc[z]??0} total={tzc}/>)}
            </View>

            <Text style={[styles.sectionTitle,{marginTop:16}]}>Teacher Emotion Colours — All Schools</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(z=><ColourRow key={z} zone={z} count={tc[z]??0} total={ttc}/>)}
            </View>

            <Text style={[styles.sectionTitle,{marginTop:16}]}>Strategy & Engagement Stats</Text>
            <View style={styles.colourTrends}>
              {[
                {label:'Most used student strategy',value:stats?.top_strategy??'—',icon:'lightbulb',color:'#4CAF50'},
                {label:'Most used teacher strategy',value:stats?.top_teacher_strategy??'—',icon:'school',color:'#FFC107'},
                {label:'Teacher support requests this month',value:stats?.support_requests??'—',icon:'notifications-active',color:'#F44336'},
                {label:'Total creatures collected',value:stats?.total_creatures??'—',icon:'pets',color:'#9C27B0'},
                {label:'Avg check-ins to evolve creature',value:stats?.avg_checkins_to_evolve??'—',icon:'trending-up',color:'#4A90D9'},
                {label:'Students with 7+ day streak',value:stats?.streak_students??'—',icon:'local-fire-department',color:'#FF9800'},
                {label:'Avg student session length',value:`${stats?.avg_session_mins??'—'} mins`,icon:'timer',color:'#5C6BC0'},
              ].map((item,i)=>(
                <View key={i} style={{flexDirection:'row',alignItems:'center',paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#F5F5F5',gap:10}}>
                  <MaterialIcons name={item.icon as any} size={18} color={item.color}/>
                  <Text style={{flex:1,fontSize:12,color:'#555'}}>{item.label}</Text>
                  <Text style={{fontSize:14,fontWeight:'700',color:item.color}}>{item.value}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.sectionTitle,{marginTop:16}]}>🌍 Schools Around the World</Text>
            <Text style={styles.sectionSubtitle}>Every school using Class of Happiness. Tap a school to see their data.</Text>
            <WorldWall authToken={authToken}/>

            <Text style={[styles.sectionTitle,{marginTop:16}]}>Schools Breakdown</Text>
            <Text style={styles.sectionSubtitle}>Emotion colour data per school this week.</Text>
            {(stats?.schools_breakdown||[]).length===0 ? (
              <View style={styles.infoBox}>
                <MaterialIcons name="info" size={16} color="#5C6BC0"/>
                <Text style={styles.infoText}>School breakdown appears here as schools register their profile in Settings.</Text>
              </View>
            ) : (stats?.schools_breakdown||[]).map((school:any,i:number)=>(
              <View key={i} style={styles.schoolCard}>
                <View style={styles.schoolHeader}>
                  <MaterialIcons name="account-balance" size={18} color="#5C6BC0"/>
                  <Text style={styles.schoolName}>{school.name||'Unknown School'}</Text>
                  <Text style={styles.schoolStat}>{school.total_checkins} check-ins</Text>
                </View>
                {school.description ? <Text style={styles.schoolDesc}>{school.description}</Text> : null}
                <View style={{flexDirection:'row',gap:6,marginTop:8,flexWrap:'wrap'}}>
                  {ZONES.filter(z=>school.zone_counts?.[z]>0).map(z=>(
                    <View key={z} style={[styles.zonePill,{backgroundColor:ZONE_COLORS[z]+'25'}]}>
                      <Text style={[styles.zonePillText,{color:ZONE_COLORS[z]}]}>{ZONE_LABELS[z]}: {school.zone_counts[z]}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {!loading && tab==='strategies' && <StrategyManager authToken={authToken} isSuperAdmin={true}/>}

        {!loading && tab==='settings' && (
          <View>
            <Text style={styles.sectionTitle}>App Info & Controls</Text>
            {[
              {icon:'info',title:'Version',desc:'Class of Happiness v2.0 — April 2026',color:'#5C6BC0'},
              {icon:'people',title:'Total Registered Users',desc:`${stats?.total_users??'—'} users globally`,color:'#4CAF50'},
              {icon:'account-balance',title:'Active Schools',desc:`${stats?.total_schools??'—'} schools`,color:'#9C27B0'},
              {icon:'timer',title:'Avg Session Time',desc:`Students: ${stats?.avg_student_session??'—'} mins · Teachers: ${stats?.avg_teacher_session??'—'} mins`,color:'#FF9800'},
              {icon:'attach-money',title:'Pricing',desc:'Free → Family €3.99/mo → School €399–1,499/yr',color:'#4A90D9'},
            ].map((item,i)=>(
              <View key={i} style={styles.settingCard}>
                <MaterialIcons name={item.icon as any} size={24} color={item.color}/>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>{item.title}</Text>
                  <Text style={styles.settingDesc}>{item.desc}</Text>
                </View>
              </View>
            ))}
            <View style={[styles.settingCard,{borderLeftWidth:4,borderLeftColor:'#F44336'}]}>
              <MaterialIcons name="link-off" size={24} color="#F44336"/>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingTitle,{color:'#F44336'}]}>Unlink Parent / Teacher</Text>
                <Text style={styles.settingDesc}>Remove a parent-teacher connection following a complaint or verified request.</Text>
                <TouchableOpacity style={[styles.saveBtn,{backgroundColor:'#F44336',marginTop:8}]} onPress={()=>setShowUnlink(true)}>
                  <Text style={styles.saveBtnText}>Unlink a User</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <Modal visible={showUnlink} transparent animationType="slide" onRequestClose={()=>setShowUnlink(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <Text style={styles.modalTitle}>Unlink User</Text>
              <TouchableOpacity onPress={()=>setShowUnlink(false)}><MaterialIcons name="close" size={24} color="#666"/></TouchableOpacity>
            </View>
            <Text style={{fontSize:13,color:'#888',marginBottom:16,lineHeight:20}}>Use only following a formal complaint or verified request.</Text>
            <View style={styles.typeRow}>
              {(['teacher','parent'] as const).map(t=>(
                <TouchableOpacity key={t} style={[styles.typeChip,unlinkType===t&&styles.typeChipActive]} onPress={()=>setUnlinkType(t)}>
                  <Text style={[styles.typeChipText,unlinkType===t&&styles.typeChipTextActive]}>{t==='teacher'?'👩‍🏫 Teacher':'👨‍👩‍👧 Parent'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="User email..." value={unlinkEmail} onChangeText={setUnlinkEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#AAA"/>
            <TouchableOpacity style={[styles.addBtn,{backgroundColor:'#F44336'}]} onPress={doUnlink}>
              <MaterialIcons name="link-off" size={18} color="white"/>
              <Text style={styles.addBtnText}>Confirm Unlink</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}


// ── School Settings Tab ────────────────────────────────────────────────────
const COUNTRY_FLAGS = [
  {flag:'🇵🇹',name:'Portugal'},{flag:'🇦🇺',name:'Australia'},
  {flag:'🇬🇧',name:'United Kingdom'},{flag:'🇺🇸',name:'United States'},
  {flag:'🇪🇸',name:'Spain'},{flag:'🇫🇷',name:'France'},
  {flag:'🇩🇪',name:'Germany'},{flag:'🇮🇹',name:'Italy'},
  {flag:'🇳🇿',name:'New Zealand'},{flag:'🇮🇪',name:'Ireland'},
  {flag:'🇿🇦',name:'South Africa'},{flag:'🇨🇦',name:'Canada'},
  {flag:'🇧🇷',name:'Brazil'},{flag:'🇯🇵',name:'Japan'},
  {flag:'🌍',name:'Other'},
];
const SCHOOL_TYPES = ['International','Public','Private','Charter','Faith-based'];
const CURRICULA = ['IB (International Baccalaureate)','National','Cambridge','Montessori','Mixed/Other'];

function SchoolSettingsTab({ authToken, user, wellbeingEmail, setWellbeingEmail, saveSettings, savingSettings }: any) {
  const [profile, setProfile] = useState({
    school_name: user?.school_name || '',
    country: '', city: '', school_type: 'International',
    curriculum: 'National', student_count: '',
    contact_name: '', contact_email: user?.email || '',
    how_heard: '', country_flag: '🌍',
  });
  const [saving, setSaving] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [generatingCode, setGeneratingCode] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    apiCall('/school/profile', authToken)
      .then(d => {
        if (d && d.school_name) setProfile(prev => ({...prev,...d}));
      })
      .catch(()=>{})
      .finally(()=>setLoadingProfile(false));
  }, []);

  const saveProfile = async () => {
    if (!profile.school_name || !profile.country || !profile.city) {
      Alert.alert('Required fields', 'Please fill in school name, country and city.');
      return;
    }
    setSaving(true);
    try {
      await apiCall('/school/register', authToken, {
        method: 'POST', body: JSON.stringify({...profile, contact_email: wellbeingEmail||profile.contact_email})
      });
      // Also save wellbeing email
      await apiCall('/admin/settings', authToken, {method:'POST',body:JSON.stringify({key:'wellbeing_email',value:wellbeingEmail})});
      Alert.alert('Profile Saved!', 'Your school profile has been updated. It''s now visible to the Class of Happiness team.');
    } catch { Alert.alert('Error', 'Could not save profile.'); }
    finally { setSaving(false); }
  };

  const generateCode = async () => {
    setGeneratingCode(true);
    try {
      const d = await apiCall('/school/generate-invite-code', authToken, { method: 'POST' });
      setInviteCode(d.code);
      Alert.alert('Invite Code Ready!',
        `Share this unique code with your teachers:\n\n${d.code}\n\nValid for 90 days. Each teacher enters this in their Settings to join your school.`
      );
    } catch { Alert.alert('Error', 'Could not generate code.'); }
    finally { setGeneratingCode(false); }
  };

  if (loadingProfile) return <ActivityIndicator color="#5C6BC0" style={{marginTop:40}}/>;

  return (
    <ScrollView contentContainerStyle={{padding:16,paddingBottom:40}}>
      <Text style={styles.sectionTitle}>School Profile</Text>
      <Text style={styles.sectionSubtitle}>
        This information helps the Class of Happiness team support your school. 
        Your school also appears on the global schools wall in the app. 🌍
      </Text>

      {/* Country Flag selector */}
      <Text style={styles.inputLabel}>Country</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:12}}>
        <View style={{flexDirection:'row',gap:8}}>
          {COUNTRY_FLAGS.map(c => (
            <TouchableOpacity key={c.flag}
              style={{alignItems:'center',padding:8,borderRadius:10,
                backgroundColor: profile.country_flag===c.flag ? '#E8EAF6' : '#F5F5F5',
                borderWidth: profile.country_flag===c.flag ? 2 : 0,
                borderColor:'#5C6BC0'}}
              onPress={()=>setProfile(p=>({...p,country_flag:c.flag,country:c.name}))}>
              <Text style={{fontSize:28}}>{c.flag}</Text>
              <Text style={{fontSize:9,color:'#666',marginTop:2,textAlign:'center'}}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Text style={styles.inputLabel}>School Name *</Text>
      <TextInput style={styles.input} placeholder="e.g. St Patrick's International School"
        value={profile.school_name} onChangeText={v=>setProfile(p=>({...p,school_name:v}))} placeholderTextColor="#AAA"/>

      <Text style={styles.inputLabel}>City *</Text>
      <TextInput style={styles.input} placeholder="e.g. Lisbon"
        value={profile.city} onChangeText={v=>setProfile(p=>({...p,city:v}))} placeholderTextColor="#AAA"/>

      <Text style={styles.inputLabel}>School Type</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:12}}>
        {SCHOOL_TYPES.map(t=>(
          <TouchableOpacity key={t}
            style={{paddingHorizontal:12,paddingVertical:6,borderRadius:16,
              backgroundColor: profile.school_type===t ? '#5C6BC0' : '#F0F0F0'}}
            onPress={()=>setProfile(p=>({...p,school_type:t}))}>
            <Text style={{fontSize:12,color:profile.school_type===t?'white':'#666',fontWeight:'500'}}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.inputLabel}>Curriculum</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:12}}>
        {CURRICULA.map(c=>(
          <TouchableOpacity key={c}
            style={{paddingHorizontal:12,paddingVertical:6,borderRadius:16,
              backgroundColor: profile.curriculum===c ? '#5C6BC0' : '#F0F0F0'}}
            onPress={()=>setProfile(p=>({...p,curriculum:c}))}>
            <Text style={{fontSize:12,color:profile.curriculum===c?'white':'#666',fontWeight:'500'}}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.inputLabel}>Approximate Number of Students</Text>
      <TextInput style={styles.input} placeholder="e.g. 450" keyboardType="numeric"
        value={profile.student_count} onChangeText={v=>setProfile(p=>({...p,student_count:v}))} placeholderTextColor="#AAA"/>

      <Text style={styles.inputLabel}>Your Name (Principal / Wellbeing Lead)</Text>
      <TextInput style={styles.input} placeholder="e.g. Dr Sarah Murphy"
        value={profile.contact_name} onChangeText={v=>setProfile(p=>({...p,contact_name:v}))} placeholderTextColor="#AAA"/>

      <Text style={styles.inputLabel}>Wellbeing Alert Email</Text>
      <TextInput style={styles.input} placeholder="principal@school.edu"
        value={wellbeingEmail} onChangeText={setWellbeingEmail}
        keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#AAA"/>

      <Text style={styles.inputLabel}>How did you hear about Class of Happiness?</Text>
      <TextInput style={styles.input} placeholder="e.g. Teacher Facebook group, colleague recommendation..."
        value={profile.how_heard} onChangeText={v=>setProfile(p=>({...p,how_heard:v}))} placeholderTextColor="#AAA"/>

      <TouchableOpacity style={[styles.addBtn,saving&&{opacity:0.6},{marginBottom:20}]} onPress={saveProfile} disabled={saving}>
        <MaterialIcons name="save" size={18} color="white"/>
        <Text style={styles.addBtnText}>{saving?'Saving...':'Save School Profile'}</Text>
      </TouchableOpacity>

      {/* Invite Code Section */}
      <Text style={styles.sectionTitle}>Teacher Invite Code</Text>
      <Text style={styles.sectionSubtitle}>
        Generate a unique code for YOUR school. Share it with your teachers so they can join your school in the app.
        Each school gets a different code.
      </Text>
      {inviteCode ? (
        <View style={{backgroundColor:'#E8EAF6',borderRadius:12,padding:16,alignItems:'center',marginBottom:12}}>
          <Text style={{fontSize:28,fontWeight:'bold',color:'#3949AB',letterSpacing:3}}>{inviteCode}</Text>
          <Text style={{fontSize:12,color:'#666',marginTop:6,textAlign:'center'}}>
            Share this with your teachers. Valid for 90 days.{'\n'}They enter it in Settings → Join School.
          </Text>
        </View>
      ) : null}
      <TouchableOpacity style={[styles.addBtn,generatingCode&&{opacity:0.6}]} onPress={generateCode} disabled={generatingCode}>
        <MaterialIcons name="vpn-key" size={18} color="white"/>
        <Text style={styles.addBtnText}>{generatingCode?'Generating...':inviteCode?'Generate New Code':'Generate Invite Code'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function SchoolAdminDashboard({ authToken, user }: { authToken:string|null, user:any }) {
  const [tab, setTab] = useState<'overview'|'alerts'|'strategies'|'settings'>('overview');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [wellbeingEmail, setWellbeingEmail] = useState('');
  const [schoolName, setSchoolName] = useState(user?.school_name||'');
  const [schoolDesc, setSchoolDesc] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => { loadData(); }, [tab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (tab==='overview') {
        try { const d = await apiCall('/admin/stats', authToken); setStats(d); } catch {}
        try { const d = await apiCall('/students', authToken); setStudents(Array.isArray(d)?d:[]); } catch { setStudents([]); }
      } else if (tab==='alerts') {
        try { const d = await apiCall('/admin/wellbeing-alerts', authToken); setAlerts(Array.isArray(d)?d:[]); } catch { setAlerts([]); }
      } else if (tab==='settings') {
        try {
          const d = await apiCall('/admin/settings', authToken);
          setWellbeingEmail(d.wellbeing_email||'');
          setSchoolName(d.school_name||user?.school_name||'');
          setSchoolDesc(d.school_description||'');
        } catch {}
      }
    } finally { setLoading(false); }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await Promise.all([
        apiCall('/admin/settings',authToken,{method:'POST',body:JSON.stringify({key:'wellbeing_email',value:wellbeingEmail.trim()})}),
        apiCall('/admin/settings',authToken,{method:'POST',body:JSON.stringify({key:'school_name',value:schoolName.trim()})}),
        apiCall('/admin/settings',authToken,{method:'POST',body:JSON.stringify({key:'school_description',value:schoolDesc.trim()})}),
      ]);
      Alert.alert('Settings Saved');
    } catch { Alert.alert('Error','Could not save.'); }
    finally { setSavingSettings(false); }
  };

  const formatDate = (iso:string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const zc = stats?.zone_counts||{};
  const tzc = Object.values(zc).reduce((a:any,b:any)=>a+b,0) as number;
  const tc = stats?.teacher_zone_counts||{};
  const ttc = Object.values(tc).reduce((a:any,b:any)=>a+b,0) as number;
  const atRisk = students.filter(s=>s.last_zone==='red'||s.last_zone==='yellow').slice(0,5);

  return (
    <>
      <View style={styles.tabBar}>
        {[{id:'overview',icon:'bar-chart',label:'Overview'},{id:'alerts',icon:'notifications-active',label:'Alerts'},{id:'strategies',icon:'lightbulb',label:'Strategies'},{id:'settings',icon:'settings',label:'Settings'}].map(t=>(
          <TouchableOpacity key={t.id} style={[styles.tab,tab===t.id&&styles.tabActive]} onPress={()=>setTab(t.id as any)}>
            <MaterialIcons name={t.icon as any} size={20} color={tab===t.id?'#5C6BC0':'#999'}/>
            <Text style={[styles.tabLabel,tab===t.id&&styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && <ActivityIndicator size="large" color="#5C6BC0" style={{marginTop:40}}/>}

        {!loading && tab==='overview' && (
          <View>
            <Text style={styles.sectionTitle}>School Overview</Text>
            <Text style={styles.sectionSubtitle}>Tap any card to see a weekly graph.</Text>
            <View style={styles.statsGrid}>
              <StatCard label="Students" value={stats?.total_students??students.length} icon="child-care" color="#4CAF50"
                graphData={stats?.student_daily||[0,0,0,0,0,0,0]} detail={`Total check-ins: ${stats?.total_checkins??'—'}`}/>
              <StatCard label="Teachers" value={stats?.total_teachers??'—'} icon="school" color="#FFC107"
                graphData={stats?.teacher_daily||[0,0,0,0,0,0,0]} detail={`Support requests: ${stats?.support_requests??'—'}`}/>
              <StatCard label="Check-ins" value={stats?.checkins_today??'—'} icon="favorite" color="#4A90D9"
                graphData={stats?.checkin_daily||[0,0,0,0,0,0,0]} detail={`Avg session: ${stats?.avg_session_mins??'—'} mins`}/>
              <StatCard label="Active Users" value={stats?.active_users??'—'} icon="people" color="#9C27B0"
                graphData={stats?.active_daily||[0,0,0,0,0,0,0]} detail={`Creatures collected: ${stats?.total_creatures??'—'}`}/>
            </View>

            <Text style={[styles.sectionTitle,{marginTop:16}]}>Student Emotion Trends</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(z=><ColourRow key={z} zone={z} count={zc[z]??0} total={tzc}/>)}
            </View>

            <Text style={[styles.sectionTitle,{marginTop:16}]}>Teacher Emotion Trends</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(z=><ColourRow key={z} zone={z} count={tc[z]??0} total={ttc}/>)}
            </View>

            {atRisk.length>0 && (
              <>
                <Text style={[styles.sectionTitle,{marginTop:16,color:'#F44336'}]}>Needs Attention</Text>
                <Text style={styles.sectionSubtitle}>Students whose last check-in was stressed or overloaded.</Text>
                {atRisk.map((s,i)=>(
                  <View key={i} style={[styles.personCard,{borderLeftWidth:3,borderLeftColor:ZONE_COLORS[s.last_zone]||'#999'}]}>
                    <View style={[styles.avatar,{backgroundColor:ZONE_COLORS[s.last_zone]||'#F44336'}]}>
                      <Text style={styles.avatarText}>{s.name?.[0]||'?'}</Text>
                    </View>
                    <View style={styles.personInfo}>
                      <Text style={styles.personName}>{s.name}</Text>
                      <Text style={styles.personSub}>Last: {ZONE_LABELS[s.last_zone]||s.last_zone}</Text>
                    </View>
                    <View style={[styles.zonePill,{backgroundColor:ZONE_COLORS[s.last_zone]+'25'}]}>
                      <Text style={[styles.zonePillText,{color:ZONE_COLORS[s.last_zone]}]}>{s.last_zone}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}

            <Text style={[styles.sectionTitle,{marginTop:16}]}>All Students ({students.length})</Text>
            {students.slice(0,30).map((s,i)=>(
              <View key={s.id||i} style={styles.personCard}>
                <View style={[styles.avatar,{backgroundColor:ZONE_COLORS[s.last_zone]||'#4CAF50'}]}>
                  <Text style={styles.avatarText}>{s.name?.[0]||'?'}</Text>
                </View>
                <View style={styles.personInfo}>
                  <Text style={styles.personName}>{s.name}</Text>
                  <Text style={styles.personSub}>Class: {s.classroom_id||'—'}</Text>
                </View>
                {s.last_zone && (
                  <View style={[styles.zonePill,{backgroundColor:ZONE_COLORS[s.last_zone]+'25'}]}>
                    <Text style={[styles.zonePillText,{color:ZONE_COLORS[s.last_zone]}]}>{s.last_zone}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {!loading && tab==='alerts' && (
          <View>
            <Text style={styles.sectionTitle}>Teacher Wellbeing Alerts</Text>
            <View style={styles.infoBox}>
              <MaterialIcons name="lock" size={16} color="#5C6BC0"/>
              <Text style={styles.infoText}>Private support requests. Handle with care and confidentiality.</Text>
            </View>
            {alerts.length===0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="check-circle" size={48} color="#4CAF50"/>
                <Text style={styles.emptyText}>No alerts — teachers are doing well!</Text>
              </View>
            ) : alerts.map((a,i)=>(
              <View key={a.id||i} style={[styles.alertCard,a.status==='resolved'&&styles.alertResolved]}>
                <View style={styles.alertHeader}>
                  <View style={[styles.alertDot,{backgroundColor:ZONE_COLORS[a.zone]||'#999'}]}/>
                  <Text style={styles.alertName}>{a.teacher_name}</Text>
                  <Text style={styles.alertTime}>{formatDate(a.created_at)}</Text>
                </View>
                <Text style={styles.alertMessage}>{a.message}</Text>
                <View style={[styles.alertBadge,{backgroundColor:a.status==='resolved'?'#E8F5E9':'#FFF3E0'}]}>
                  <Text style={[styles.alertBadgeText,{color:a.status==='resolved'?'#4CAF50':'#FF9800'}]}>
                    {a.status==='resolved'?'Resolved':'Pending'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {!loading && tab==='strategies' && <StrategyManager authToken={authToken} isSuperAdmin={false}/>}

        {!loading && tab==='settings' && (
          <SchoolSettingsTab
            authToken={authToken}
            user={user}
            wellbeingEmail={wellbeingEmail}
            setWellbeingEmail={setWellbeingEmail}
            saveSettings={saveSettings}
            savingSettings={savingSettings}
          />
        )}
      </ScrollView>
    </>
  );
}

export default function AdminDashboardScreen() {
  const { user } = useApp();
  const [authToken, setAuthToken] = useState<string|null>(null);
  useEffect(() => { AsyncStorage.getItem('session_token').then(t=>setAuthToken(t)); }, []);

  const isSuperAdmin = user?.role==='superadmin';
  const isSchoolAdmin = user?.role==='school_admin'||user?.role==='admin';
  const headerColor = isSuperAdmin ? '#3949AB' : '#5C6BC0';
  const headerLabel = isSuperAdmin ? '👑 Super Admin — All Schools' : '🏫 School Admin — '+(user?.school_name||'My School');

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header,{backgroundColor:headerColor}]}>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <Text style={styles.headerSub}>{user?.name||user?.email}</Text>
        <Text style={styles.headerRole}>{headerLabel}</Text>
      </View>
      {isSuperAdmin && <SuperAdminDashboard authToken={authToken} user={user}/>}
      {isSchoolAdmin && !isSuperAdmin && <SchoolAdminDashboard authToken={authToken} user={user}/>}
      {!isSuperAdmin && !isSchoolAdmin && (
        <View style={styles.noAccess}>
          <MaterialIcons name="lock" size={48} color="#CCC"/>
          <Text style={styles.noAccessText}>No admin access. Go to Settings to enter your admin code.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#F8F9FA'},
  header:{padding:20,paddingBottom:16},
  headerTitle:{fontSize:22,fontWeight:'bold',color:'white'},
  headerSub:{fontSize:13,color:'rgba(255,255,255,0.8)',marginTop:2},
  headerRole:{fontSize:12,color:'rgba(255,255,255,0.7)',marginTop:2},
  tabBar:{flexDirection:'row',backgroundColor:'white',borderBottomWidth:1,borderBottomColor:'#E0E0E0'},
  tab:{flex:1,alignItems:'center',paddingVertical:10,gap:3},
  tabActive:{borderBottomWidth:2,borderBottomColor:'#5C6BC0'},
  tabLabel:{fontSize:10,color:'#999',fontWeight:'500'},
  tabLabelActive:{color:'#5C6BC0',fontWeight:'700'},
  scroll:{padding:16,paddingBottom:40},
  sectionTitle:{fontSize:17,fontWeight:'bold',color:'#333',marginBottom:6,marginTop:12},
  sectionSubtitle:{fontSize:12,color:'#888',marginBottom:12,lineHeight:18},
  statsGrid:{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:8},
  statCard:{width:'47%',backgroundColor:'white',borderRadius:14,padding:12,alignItems:'center',borderTopWidth:4,elevation:2,shadowColor:'#000',shadowOffset:{width:0,height:1},shadowOpacity:0.08,shadowRadius:3},
  statValue:{fontSize:26,fontWeight:'bold',color:'#333',marginTop:4},
  statLabel:{fontSize:11,color:'#888',marginTop:2,textAlign:'center'},
  colourTrends:{backgroundColor:'white',borderRadius:14,padding:14,marginBottom:8,gap:10},
  colourRow:{flexDirection:'row',alignItems:'center',gap:8},
  colourDot:{width:12,height:12,borderRadius:6},
  colourLabel:{fontSize:12,color:'#555',width:78},
  colourBarBg:{flex:1,height:10,backgroundColor:'#F0F0F0',borderRadius:5,overflow:'hidden'},
  colourBar:{height:10,borderRadius:5},
  colourPct:{fontSize:11,color:'#555',width:32,textAlign:'right'},
  personCard:{flexDirection:'row',alignItems:'center',backgroundColor:'white',borderRadius:12,padding:10,marginBottom:6,gap:10},
  avatar:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center'},
  avatarText:{color:'white',fontWeight:'bold',fontSize:14},
  personInfo:{flex:1},
  personName:{fontSize:14,fontWeight:'600',color:'#333'},
  personSub:{fontSize:11,color:'#888'},
  infoBox:{flexDirection:'row',backgroundColor:'#E8EAF6',borderRadius:10,padding:12,gap:8,marginBottom:8,alignItems:'flex-start'},
  infoText:{fontSize:13,color:'#5C6BC0',flex:1,lineHeight:20},
  emptyState:{alignItems:'center',paddingVertical:40},
  emptyText:{fontSize:14,color:'#999',textAlign:'center',marginTop:8},
  alertCard:{backgroundColor:'white',borderRadius:12,padding:14,marginBottom:10,borderLeftWidth:4,borderLeftColor:'#FF9800'},
  alertResolved:{borderLeftColor:'#4CAF50',opacity:0.8},
  alertHeader:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8},
  alertDot:{width:12,height:12,borderRadius:6},
  alertName:{flex:1,fontSize:14,fontWeight:'600',color:'#333'},
  alertTime:{fontSize:11,color:'#999'},
  alertMessage:{fontSize:13,color:'#555',lineHeight:18,marginBottom:8},
  alertBadge:{alignSelf:'flex-start',paddingHorizontal:10,paddingVertical:4,borderRadius:10},
  alertBadgeText:{fontSize:11,fontWeight:'600'},
  addStratBox:{backgroundColor:'white',borderRadius:14,padding:16,marginBottom:14,elevation:2,shadowColor:'#000',shadowOffset:{width:0,height:1},shadowOpacity:0.08,shadowRadius:3},
  addStratTitle:{fontSize:15,fontWeight:'600',color:'#333',marginBottom:12},
  inputLabel:{fontSize:12,fontWeight:'600',color:'#666',marginBottom:5},
  input:{backgroundColor:'#F5F5F5',borderRadius:10,padding:12,fontSize:14,color:'#333',marginBottom:10},
  zoneRow:{flexDirection:'row',gap:8,marginBottom:12},
  zoneChip:{flex:1,paddingVertical:10,borderRadius:8,alignItems:'center'},
  zoneChipText:{color:'white',fontWeight:'bold',fontSize:13},
  addBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',backgroundColor:'#5C6BC0',borderRadius:10,padding:12,gap:8},
  addBtnText:{color:'white',fontWeight:'600',fontSize:14},
  stratCard:{flexDirection:'row',alignItems:'center',backgroundColor:'white',borderRadius:12,padding:12,marginBottom:8,gap:10},
  stratDot:{width:12,height:12,borderRadius:6},
  stratInfo:{flex:1},
  stratName:{fontSize:14,fontWeight:'600',color:'#333'},
  stratDesc:{fontSize:11,color:'#888',marginTop:2},
  zonePill:{paddingHorizontal:7,paddingVertical:3,borderRadius:8},
  zonePillText:{fontSize:11,fontWeight:'600',textTransform:'capitalize'},
  typeRow:{flexDirection:'row',gap:10,marginBottom:14},
  typeChip:{flex:1,paddingVertical:10,borderRadius:10,backgroundColor:'#F0F0F0',alignItems:'center'},
  typeChipActive:{backgroundColor:'#E8EAF6',borderWidth:2,borderColor:'#5C6BC0'},
  typeChipText:{fontSize:14,color:'#888',fontWeight:'500'},
  typeChipTextActive:{color:'#5C6BC0',fontWeight:'700'},
  settingCard:{flexDirection:'row',backgroundColor:'white',borderRadius:14,padding:16,marginBottom:12,gap:12,alignItems:'flex-start'},
  settingInfo:{flex:1},
  settingTitle:{fontSize:15,fontWeight:'600',color:'#333',marginBottom:4},
  settingDesc:{fontSize:13,color:'#666',lineHeight:18,marginBottom:8},
  saveBtn:{backgroundColor:'#5C6BC0',borderRadius:10,padding:12,alignItems:'center'},
  saveBtnText:{color:'white',fontWeight:'600',fontSize:14},
  noAccess:{flex:1,alignItems:'center',justifyContent:'center',padding:40},
  noAccessText:{fontSize:15,color:'#999',textAlign:'center',marginTop:16,lineHeight:22},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'},
  modalContent:{backgroundColor:'white',borderTopLeftRadius:24,borderTopRightRadius:24,padding:24,paddingBottom:40},
  modalTitle:{fontSize:18,fontWeight:'bold',color:'#333'},
  schoolCard:{backgroundColor:'white',borderRadius:12,padding:14,marginBottom:10,elevation:2,shadowColor:'#000',shadowOffset:{width:0,height:1},shadowOpacity:0.08,shadowRadius:3},
  schoolHeader:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:4},
  schoolName:{flex:1,fontSize:14,fontWeight:'600',color:'#333'},
  schoolStat:{fontSize:11,color:'#888'},
  schoolDesc:{fontSize:12,color:'#666',lineHeight:18},
});
