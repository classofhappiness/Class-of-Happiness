import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const ZONE_COLORS = { blue:'#4A90D9', green:'#4CAF50', yellow:'#FFC107', red:'#F44336' };
const ZONE_LABELS = { blue:'Low Energy', green:'Steady', yellow:'Stressed', red:'Overloaded' };
const ZONES = ['blue','green','yellow','red'];

async function apiCall(endpoint, token, options={}) {
  const headers = { 'Content-Type':'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api${endpoint}`, { headers, ...options });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function MiniBarChart({ data, color, label }) {
  const max = Math.max(...data, 1);
  const days = ['S','M','T','W','T','F','S'];
  return (
    <View style={{ backgroundColor:'#F8F9FA', borderRadius:10, padding:10, marginTop:10 }}>
      <Text style={{ fontSize:12, fontWeight:'600', color:'#555', marginBottom:6 }}>{label}</Text>
      <View style={{ flexDirection:'row', gap:4, alignItems:'flex-end', height:50 }}>
        {data.map((val,i) => (
          <View key={i} style={{ flex:1, alignItems:'center', gap:2 }}>
            <View style={{ width:'100%', height:40, justifyContent:'flex-end', borderRadius:4, backgroundColor:'#E8E8E8' }}>
              <View style={{ width:'100%', height:`${Math.round((val/max)*100)}%`, backgroundColor:color, borderRadius:4, minHeight:3 }}/>
            </View>
            <Text style={{ fontSize:8, color:'#AAA' }}>{days[i]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StatCard({ label, value, icon, color, graphData, graphLabel }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity style={[styles.statCard, { borderTopColor:color }]} onPress={() => setExpanded(!expanded)} activeOpacity={0.8}>
      <MaterialIcons name={icon} size={26} color={color}/>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={16} color={'#CCC'} style={{ marginTop:4 }}/>
      {expanded && <MiniBarChart data={graphData||[0,0,0,0,0,0,0]} color={color} label={graphLabel||label}/>}
    </TouchableOpacity>
  );
}

function ColourTrends({ stats }) {
  return (
    <View style={styles.colourTrends}>
      {ZONES.map(zone => {
        const count = stats?.zone_counts?.[zone] ?? 0;
        const total = stats ? Object.values(stats.zone_counts||{}).reduce((a,b)=>a+b,0) : 1;
        const pct = total > 0 ? Math.round((count/total)*100) : 0;
        return (
          <View key={zone} style={styles.colourRow}>
            <View style={[styles.colourDot,{backgroundColor:ZONE_COLORS[zone]}]}/>
            <Text style={styles.colourLabel}>{ZONE_LABELS[zone]}</Text>
            <View style={styles.colourBarBg}>
              <View style={[styles.colourBar,{width:`${pct}%`,backgroundColor:ZONE_COLORS[zone]}]}/>
            </View>
            <Text style={styles.colourPct}>{pct}%</Text>
          </View>
        );
      })}
    </View>
  );
}

function StrategyManager({ authToken, isSuperAdmin }) {
  const [stratType, setStratType] = useState('teacher');
  const [strategies, setStrategies] = useState([]);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newZone, setNewZone] = useState('blue');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadStrategies(); }, [stratType]);

  const loadStrategies = async () => {
    setLoading(true);
    try {
      if (stratType === 'teacher') {
        const d = await apiCall('/admin/teacher-strategies', authToken);
        setStrategies(Array.isArray(d) ? d : []);
      } else {
        const zones = ['blue','green','yellow','red'];
        const all = await Promise.all(zones.map(z => apiCall(`/strategies/${z}`, authToken).catch(()=>[])));
        setStrategies(all.flat());
      }
    } catch { setStrategies([]); }
    finally { setLoading(false); }
  };

  const save = async () => {
    if (!newName.trim()) { Alert.alert('Name required'); return; }
    try {
      const endpoint = stratType==='teacher' ? '/admin/teacher-strategies' : '/strategies';
      if (editing) {
        await apiCall(`${endpoint}/${editing.id}`, authToken, { method:'PUT', body:JSON.stringify({name:newName,description:newDesc,zone:newZone,icon:'star'}) });
      } else {
        await apiCall(endpoint, authToken, { method:'POST', body:JSON.stringify({name:newName,description:newDesc,zone:newZone,icon:'star'}) });
      }
      setNewName(''); setNewDesc(''); setEditing(null);
      Alert.alert('✅ Saved');
      loadStrategies();
    } catch { Alert.alert('Error','Could not save.'); }
  };

  const del = (s) => {
    Alert.alert('Delete', `Delete "${s.name}"?`, [
      { text:'Cancel', style:'cancel' },
      { text:'Delete', style:'destructive', onPress: async () => {
        try {
          const endpoint = stratType==='teacher' ? '/admin/teacher-strategies' : '/strategies';
          await apiCall(`${endpoint}/${s.id}`, authToken, { method:'DELETE' });
          loadStrategies();
        } catch { Alert.alert('Error','Could not delete.'); }
      }},
    ]);
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Strategies</Text>
      <Text style={styles.sectionSubtitle}>
        {isSuperAdmin ? 'Changes apply to ALL schools globally. You can add, edit and delete.' : 'Add strategies for your school. Cannot edit global ones.'}
      </Text>
      <View style={styles.typeRow}>
        {['teacher','student'].map(t => (
          <TouchableOpacity key={t} style={[styles.typeChip, stratType===t && styles.typeChipActive]} onPress={()=>setStratType(t)}>
            <Text style={[styles.typeChipText, stratType===t && styles.typeChipTextActive]}>
              {t==='teacher'?'👩‍🏫 Teacher':'🧒 Student'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.addStratBox}>
        <Text style={styles.addStratTitle}>{editing?'Edit':'Add'} {stratType} Strategy</Text>
        <View style={styles.zoneRow}>
          {ZONES.map(z => (
            <TouchableOpacity key={z} style={[styles.zoneChip,{backgroundColor:ZONE_COLORS[z],opacity:newZone===z?1:0.35}]} onPress={()=>setNewZone(z)}>
              <Text style={styles.zoneChipText}>{z[0].toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={styles.input} placeholder="Strategy name..." value={newName} onChangeText={setNewName} placeholderTextColor="#AAA"/>
        <TextInput style={styles.input} placeholder="Description..." value={newDesc} onChangeText={setNewDesc} placeholderTextColor="#AAA"/>
        <View style={{flexDirection:'row',gap:8}}>
          <TouchableOpacity style={[styles.addBtn,{flex:1}]} onPress={save}>
            <MaterialIcons name={editing?'save':'add'} size={18} color="white"/>
            <Text style={styles.addBtnText}>{editing?'Save Changes':'Add Strategy'}</Text>
          </TouchableOpacity>
          {editing && (
            <TouchableOpacity style={[styles.addBtn,{backgroundColor:'#E0E0E0',flex:0.4}]} onPress={()=>{setEditing(null);setNewName('');setNewDesc('');}}>
              <Text style={[styles.addBtnText,{color:'#666'}]}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {loading ? <ActivityIndicator color="#5C6BC0" style={{marginTop:20}}/> : (
        <>
          <Text style={styles.sectionTitle}>{stratType==='teacher'?'Teacher':'Student'} Strategies ({strategies.length})</Text>
          {strategies.map((s,i) => (
            <View key={s.id||i} style={styles.stratCard}>
              <View style={[styles.stratDot,{backgroundColor:ZONE_COLORS[s.zone]||'#999'}]}/>
              <View style={styles.stratInfo}>
                <Text style={styles.stratName}>{s.name}</Text>
                <Text style={styles.stratDesc}>{s.description}</Text>
              </View>
              <View style={[styles.zonePill,{backgroundColor:(ZONE_COLORS[s.zone]||'#999')+ '30'}]}>
                <Text style={[styles.zonePillText,{color:ZONE_COLORS[s.zone]||'#999'}]}>{s.zone}</Text>
              </View>
              {isSuperAdmin && (
                <>
                  <TouchableOpacity onPress={()=>{setEditing(s);setNewName(s.name);setNewDesc(s.description||'');setNewZone(s.zone||'blue');}} style={{marginLeft:6}}>
                    <MaterialIcons name="edit" size={18} color="#5C6BC0"/>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={()=>del(s)} style={{marginLeft:6}}>
                    <MaterialIcons name="delete" size={18} color="#F44336"/>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function SuperAdminDashboard({ authToken, user }) {
  const [activeTab, setActiveTab] = useState('analytics');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [showUnlinkModal, setShowUnlinkModal] = useState(false);
  const [unlinkEmail, setUnlinkEmail] = useState('');
  const [unlinkType, setUnlinkType] = useState('teacher');

  useEffect(() => { if (activeTab==='analytics') loadStats(); }, [activeTab]);

  const loadStats = async () => {
    setLoading(true);
    try { const d = await apiCall('/admin/stats', authToken); setStats(d); } catch { setStats(null); }
    finally { setLoading(false); }
  };

  const unlinkUser = async () => {
    if (!unlinkEmail.trim()) { Alert.alert('Enter email'); return; }
    try {
      await apiCall('/admin/unlink-user', authToken, { method:'POST', body:JSON.stringify({email:unlinkEmail.trim(),type:unlinkType}) });
      Alert.alert('✅ Unlinked', `${unlinkEmail} has been unlinked.`);
      setShowUnlinkModal(false); setUnlinkEmail('');
    } catch { Alert.alert('Error','Could not unlink. Check the email is correct.'); }
  };

  return (
    <>
      <View style={styles.tabBar}>
        {[{id:'analytics',icon:'bar-chart',label:'Analytics'},{id:'strategies',icon:'lightbulb',label:'Strategies'},{id:'settings',icon:'settings',label:'App Info'}].map(tab => (
          <TouchableOpacity key={tab.id} style={[styles.tab, activeTab===tab.id && styles.tabActive]} onPress={()=>setActiveTab(tab.id)}>
            <MaterialIcons name={tab.icon} size={20} color={activeTab===tab.id?'#3949AB':'#999'}/>
            <Text style={[styles.tabLabel, activeTab===tab.id && {color:'#3949AB',fontWeight:'700'}]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && <ActivityIndicator size="large" color="#3949AB" style={{marginTop:40}}/>}

        {!loading && activeTab==='analytics' && (
          <View>
            <Text style={styles.sectionTitle}>Global Analytics</Text>
            <Text style={styles.sectionSubtitle}>Tap any card to see a weekly graph. No individual names or comments shown.</Text>
            <View style={styles.statsGrid}>
              <StatCard label="Students" value={stats?.total_students??'—'} icon="child-care" color="#4CAF50" graphData={stats?.student_daily||[0,0,0,0,0,0,0]} graphLabel="Student check-ins/day"/>
              <StatCard label="Teachers" value={stats?.total_teachers??'—'} icon="school" color="#FFC107" graphData={stats?.teacher_daily||[0,0,0,0,0,0,0]} graphLabel="Teacher check-ins/day"/>
              <StatCard label="Check-ins" value={stats?.checkins_today??'—'} icon="favorite" color="#4A90D9" graphData={stats?.checkin_daily||[0,0,0,0,0,0,0]} graphLabel="Total check-ins/day"/>
              <StatCard label="Schools" value={stats?.total_schools??'—'} icon="account-balance" color="#9C27B0" graphData={stats?.school_daily||[0,0,0,0,0,0,0]} graphLabel="Active schools/day"/>
            </View>
            <Text style={[styles.sectionTitle,{marginTop:20}]}>Emotion Colour Trends</Text>
            <ColourTrends stats={stats}/>
            <View style={styles.infoBox}>
              <MaterialIcons name="shield" size={16} color="#3949AB"/>
              <Text style={[styles.infoText,{color:'#3949AB'}]}>
                Support requests this month: {stats?.support_requests??'—'}{'\n'}
                Top teacher strategy: {stats?.top_teacher_strategy??'—'}{'\n'}
                Privacy: no individual comments visible here.
              </Text>
            </View>
          </View>
        )}

        {!loading && activeTab==='strategies' && <StrategyManager authToken={authToken} isSuperAdmin={true}/>}

        {!loading && activeTab==='settings' && (
          <View>
            <Text style={styles.sectionTitle}>App Info</Text>
            {[
              {icon:'info',title:'Version',desc:'Class of Happiness v2.0 — April 2026'},
              {icon:'people',title:'Total Users',desc:`${stats?.total_users??'—'} registered globally`},
              {icon:'account-balance',title:'Active Schools',desc:`${stats?.total_schools??'—'} schools`},
              {icon:'attach-money',title:'Pricing',desc:'Free → Family €3.99/mo → School €399-1499/yr'},
            ].map((item,i) => (
              <View key={i} style={styles.settingCard}>
                <MaterialIcons name={item.icon} size={24} color="#3949AB"/>
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
                <Text style={styles.settingDesc}>Remove a parent-teacher link following a complaint or verified request.</Text>
                <TouchableOpacity style={[styles.saveBtn,{backgroundColor:'#F44336',marginTop:8}]} onPress={()=>setShowUnlinkModal(true)}>
                  <Text style={styles.saveBtnText}>Unlink a User</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <Modal visible={showUnlinkModal} transparent animationType="slide" onRequestClose={()=>setShowUnlinkModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <Text style={styles.modalTitle}>Unlink User</Text>
              <TouchableOpacity onPress={()=>setShowUnlinkModal(false)}>
                <MaterialIcons name="close" size={24} color="#666"/>
              </TouchableOpacity>
            </View>
            <Text style={{fontSize:13,color:'#666',marginBottom:16,lineHeight:20}}>
              This will remove the parent-teacher link. Use only following a formal complaint or verified request.
            </Text>
            <View style={styles.typeRow}>
              {['teacher','parent'].map(t => (
                <TouchableOpacity key={t} style={[styles.typeChip, unlinkType===t && styles.typeChipActive]} onPress={()=>setUnlinkType(t)}>
                  <Text style={[styles.typeChipText, unlinkType===t && styles.typeChipTextActive]}>
                    {t==='teacher'?'👩‍🏫 Teacher':'👨‍👩‍👧 Parent'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.input} placeholder="User email address..." value={unlinkEmail} onChangeText={setUnlinkEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#AAA"/>
            <TouchableOpacity style={[styles.addBtn,{backgroundColor:'#F44336'}]} onPress={unlinkUser}>
              <MaterialIcons name="link-off" size={18} color="white"/>
              <Text style={styles.addBtnText}>Confirm Unlink</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function SchoolAdminDashboard({ authToken, user }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [wellbeingEmail, setWellbeingEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [students, setStudents] = useState([]);

  useEffect(() => { loadData(); }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab==='overview') {
        try { const d = await apiCall('/admin/stats', authToken); setStats(d); } catch {}
        try { const d = await apiCall('/students', authToken); setStudents(Array.isArray(d)?d:[]); } catch { setStudents([]); }
      } else if (activeTab==='alerts') {
        try { const d = await apiCall('/admin/wellbeing-alerts', authToken); setAlerts(Array.isArray(d)?d:[]); } catch { setAlerts([]); }
      } else if (activeTab==='settings') {
        try { const d = await apiCall('/admin/settings', authToken); setWellbeingEmail(d.wellbeing_email||''); } catch {}
      }
    } finally { setLoading(false); }
  };

  const saveEmail = async () => {
    if (!wellbeingEmail.trim()) return;
    setSavingEmail(true);
    try {
      await apiCall('/admin/settings', authToken, { method:'POST', body:JSON.stringify({key:'wellbeing_email',value:wellbeingEmail.trim()}) });
      Alert.alert('✅ Saved', `Alerts will go to ${wellbeingEmail}`);
    } catch { Alert.alert('Error','Could not save.'); }
    finally { setSavingEmail(false); }
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  return (
    <>
      <View style={styles.tabBar}>
        {[{id:'overview',icon:'bar-chart',label:'Overview'},{id:'alerts',icon:'notifications-active',label:'Alerts'},{id:'strategies',icon:'lightbulb',label:'Strategies'},{id:'settings',icon:'settings',label:'Settings'}].map(tab => (
          <TouchableOpacity key={tab.id} style={[styles.tab, activeTab===tab.id && styles.tabActive]} onPress={()=>setActiveTab(tab.id)}>
            <MaterialIcons name={tab.icon} size={20} color={activeTab===tab.id?'#5C6BC0':'#999'}/>
            <Text style={[styles.tabLabel, activeTab===tab.id && styles.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && <ActivityIndicator size="large" color="#5C6BC0" style={{marginTop:40}}/>}

        {!loading && activeTab==='overview' && (
          <View>
            <Text style={styles.sectionTitle}>School Overview</Text>
            <Text style={styles.sectionSubtitle}>Tap any card to see a weekly graph.</Text>
            <View style={styles.statsGrid}>
              <StatCard label="Students" value={stats?.total_students??students.length} icon="child-care" color="#4CAF50" graphData={stats?.student_daily||[0,0,0,0,0,0,0]} graphLabel="Student check-ins/day"/>
              <StatCard label="Teachers" value={stats?.total_teachers??'—'} icon="school" color="#FFC107" graphData={stats?.teacher_daily||[0,0,0,0,0,0,0]} graphLabel="Teacher check-ins/day"/>
              <StatCard label="Check-ins" value={stats?.checkins_today??'—'} icon="favorite" color="#4A90D9" graphData={stats?.checkin_daily||[0,0,0,0,0,0,0]} graphLabel="Total check-ins/day"/>
              <StatCard label="Active" value={stats?.active_users??'—'} icon="people" color="#9C27B0" graphData={stats?.active_daily||[0,0,0,0,0,0,0]} graphLabel="Active users/day"/>
            </View>
            <Text style={[styles.sectionTitle,{marginTop:16}]}>Emotion Colour Trends</Text>
            <ColourTrends stats={stats}/>
            <Text style={[styles.sectionTitle,{marginTop:16}]}>Students ({students.length})</Text>
            {students.slice(0,30).map((s,i) => (
              <View key={s.id||i} style={styles.personCard}>
                <View style={[styles.avatar,{backgroundColor:'#4CAF50'}]}>
                  <Text style={styles.avatarText}>{s.name?.[0]||'?'}</Text>
                </View>
                <View style={styles.personInfo}>
                  <Text style={styles.personName}>{s.name}</Text>
                  <Text style={styles.personSub}>Class: {s.classroom_id||'—'}</Text>
                </View>
                {s.last_zone && (
                  <View style={[styles.zonePill,{backgroundColor:(ZONE_COLORS[s.last_zone]||'#999')+'30'}]}>
                    <Text style={[styles.zonePillText,{color:ZONE_COLORS[s.last_zone]||'#999'}]}>{s.last_zone}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {!loading && activeTab==='alerts' && (
          <View>
            <Text style={styles.sectionTitle}>Teacher Wellbeing Alerts</Text>
            <View style={styles.infoBox}>
              <MaterialIcons name="lock" size={16} color="#5C6BC0"/>
              <Text style={styles.infoText}>Private support requests. Handle with care and confidentiality.</Text>
            </View>
            {alerts.length===0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="check-circle" size={48} color="#4CAF50"/>
                <Text style={styles.emptyText}>No alerts — teachers are doing well! 🌟</Text>
              </View>
            ) : alerts.map((alert,i) => (
              <View key={alert.id||i} style={[styles.alertCard, alert.status==='resolved' && styles.alertResolved]}>
                <View style={styles.alertHeader}>
                  <View style={[styles.alertDot,{backgroundColor:ZONE_COLORS[alert.zone]||'#999'}]}/>
                  <Text style={styles.alertName}>{alert.teacher_name}</Text>
                  <Text style={styles.alertTime}>{formatDate(alert.created_at)}</Text>
                </View>
                <Text style={styles.alertMessage}>{alert.message}</Text>
                <View style={[styles.alertBadge,{backgroundColor:alert.status==='resolved'?'#E8F5E9':'#FFF3E0'}]}>
                  <Text style={[styles.alertBadgeText,{color:alert.status==='resolved'?'#4CAF50':'#FF9800'}]}>
                    {alert.status==='resolved'?'✅ Resolved':'⏳ Pending'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {!loading && activeTab==='strategies' && <StrategyManager authToken={authToken} isSuperAdmin={false}/>}

        {!loading && activeTab==='settings' && (
          <View>
            <Text style={styles.sectionTitle}>School Settings</Text>
            <View style={styles.settingCard}>
              <MaterialIcons name="email" size={24} color="#5C6BC0"/>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Wellbeing Alert Email</Text>
                <Text style={styles.settingDesc}>When a teacher taps "Support", this email is notified.</Text>
                <TextInput style={styles.emailInput} placeholder="principal@school.edu" value={wellbeingEmail} onChangeText={setWellbeingEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#AAA"/>
                <TouchableOpacity style={[styles.saveBtn, savingEmail && {opacity:0.6}]} onPress={saveEmail} disabled={savingEmail}>
                  <Text style={styles.saveBtnText}>{savingEmail?'Saving...':'Save Email'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.settingCard}>
              <MaterialIcons name="school" size={24} color="#888"/>
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>School Name</Text>
                <Text style={styles.settingDesc}>{user?.school_name||'Contact support to update your school name'}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </>
  );
}

export default function AdminDashboardScreen() {
  const { user } = useApp();
  const [authToken, setAuthToken] = useState(null);
  useEffect(() => { AsyncStorage.getItem('session_token').then(t => setAuthToken(t)); }, []);

  const isSuperAdmin = user?.role === 'superadmin';
  const isSchoolAdmin = user?.role === 'school_admin' || user?.role === 'admin';
  const headerColor = isSuperAdmin ? '#3949AB' : '#5C6BC0';
  const headerLabel = isSuperAdmin ? '👑 Super Admin — All Schools' : '🏫 School Admin — ' + (user?.school_name||'My School');

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
  statCard:{width:'47%',backgroundColor:'white',borderRadius:14,padding:14,alignItems:'center',borderTopWidth:4,elevation:2,shadowColor:'#000',shadowOffset:{width:0,height:1},shadowOpacity:0.08,shadowRadius:3},
  statValue:{fontSize:28,fontWeight:'bold',color:'#333',marginTop:6},
  statLabel:{fontSize:11,color:'#888',marginTop:3,textAlign:'center'},
  colourTrends:{backgroundColor:'white',borderRadius:14,padding:14,marginBottom:16,gap:10},
  colourRow:{flexDirection:'row',alignItems:'center',gap:8},
  colourDot:{width:14,height:14,borderRadius:7},
  colourLabel:{fontSize:12,color:'#555',width:82},
  colourBarBg:{flex:1,height:10,backgroundColor:'#F0F0F0',borderRadius:5,overflow:'hidden'},
  colourBar:{height:10,borderRadius:5},
  colourPct:{fontSize:11,color:'#888',width:35,textAlign:'right'},
  personCard:{flexDirection:'row',alignItems:'center',backgroundColor:'white',borderRadius:12,padding:10,marginBottom:6,gap:10},
  avatar:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center'},
  avatarText:{color:'white',fontWeight:'bold',fontSize:15},
  personInfo:{flex:1},
  personName:{fontSize:14,fontWeight:'600',color:'#333'},
  personSub:{fontSize:12,color:'#888'},
  infoBox:{flexDirection:'row',backgroundColor:'#E8EAF6',borderRadius:10,padding:12,gap:8,marginBottom:16,alignItems:'flex-start'},
  infoText:{fontSize:13,color:'#5C6BC0',flex:1,lineHeight:20},
  emptyState:{alignItems:'center',paddingVertical:40},
  emptyText:{fontSize:15,color:'#999',textAlign:'center',marginTop:12},
  alertCard:{backgroundColor:'white',borderRadius:12,padding:14,marginBottom:10,borderLeftWidth:4,borderLeftColor:'#FF9800'},
  alertResolved:{borderLeftColor:'#4CAF50',opacity:0.8},
  alertHeader:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8},
  alertDot:{width:12,height:12,borderRadius:6},
  alertName:{flex:1,fontSize:15,fontWeight:'600',color:'#333'},
  alertTime:{fontSize:12,color:'#999'},
  alertMessage:{fontSize:14,color:'#555',lineHeight:20,marginBottom:8},
  alertBadge:{alignSelf:'flex-start',paddingHorizontal:10,paddingVertical:4,borderRadius:10},
  alertBadgeText:{fontSize:12,fontWeight:'600'},
  addStratBox:{backgroundColor:'white',borderRadius:14,padding:16,marginBottom:16,elevation:2,shadowColor:'#000',shadowOffset:{width:0,height:1},shadowOpacity:0.08,shadowRadius:3},
  addStratTitle:{fontSize:15,fontWeight:'600',color:'#333',marginBottom:12},
  input:{backgroundColor:'#F5F5F5',borderRadius:10,padding:12,fontSize:14,color:'#333',marginBottom:10},
  zoneRow:{flexDirection:'row',gap:8,marginBottom:12},
  zoneChip:{flex:1,paddingVertical:10,borderRadius:8,alignItems:'center'},
  zoneChipText:{color:'white',fontWeight:'bold',fontSize:13},
  addBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',backgroundColor:'#5C6BC0',borderRadius:10,padding:12,gap:8},
  addBtnText:{color:'white',fontWeight:'600',fontSize:14},
  stratCard:{flexDirection:'row',alignItems:'center',backgroundColor:'white',borderRadius:12,padding:12,marginBottom:8,gap:10},
  stratDot:{width:14,height:14,borderRadius:7},
  stratInfo:{flex:1},
  stratName:{fontSize:14,fontWeight:'600',color:'#333'},
  stratDesc:{fontSize:12,color:'#888',marginTop:2},
  zonePill:{paddingHorizontal:8,paddingVertical:4,borderRadius:8},
  zonePillText:{fontSize:11,fontWeight:'600',textTransform:'capitalize'},
  typeRow:{flexDirection:'row',gap:10,marginBottom:14},
  typeChip:{flex:1,paddingVertical:10,borderRadius:10,backgroundColor:'#F0F0F0',alignItems:'center'},
  typeChipActive:{backgroundColor:'#E8EAF6',borderWidth:2,borderColor:'#5C6BC0'},
  typeChipText:{fontSize:14,color:'#888',fontWeight:'500'},
  typeChipTextActive:{color:'#5C6BC0',fontWeight:'700'},
  settingCard:{flexDirection:'row',backgroundColor:'white',borderRadius:14,padding:16,marginBottom:12,gap:12,alignItems:'flex-start'},
  settingInfo:{flex:1},
  settingTitle:{fontSize:15,fontWeight:'600',color:'#333',marginBottom:4},
  settingDesc:{fontSize:13,color:'#666',lineHeight:18,marginBottom:10},
  emailInput:{backgroundColor:'#F5F5F5',borderRadius:10,padding:12,fontSize:14,color:'#333',marginBottom:10},
  saveBtn:{backgroundColor:'#5C6BC0',borderRadius:10,padding:12,alignItems:'center'},
  saveBtnText:{color:'white',fontWeight:'600',fontSize:14},
  noAccess:{flex:1,alignItems:'center',justifyContent:'center',padding:40},
  noAccessText:{fontSize:15,color:'#999',textAlign:'center',marginTop:16,lineHeight:22},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'flex-end'},
  modalContent:{backgroundColor:'white',borderTopLeftRadius:24,borderTopRightRadius:24,padding:24,paddingBottom:40},
  modalTitle:{fontSize:18,fontWeight:'bold',color:'#333'},
});
