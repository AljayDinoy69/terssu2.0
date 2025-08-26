import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert, Animated, Dimensions, ScrollView, Image, Modal } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { createResponder, deleteAccount, getCurrentUser, listAllReports, listUsers, logout } from '../utils/auth';
import { API_BASE_URL } from '../utils/api';
import { playNotificationSound } from '../utils/sound';
import { isSoundEnabled, setSoundEnabled } from '../utils/settings';

export type AdminDashProps = NativeStackScreenProps<RootStackParamList, 'AdminDashboard'>;

type Notif = { id: string; title: string; time: number; kind: 'new' | 'update' };

const { width } = Dimensions.get('window');

export default function AdminDashboard({ navigation }: AdminDashProps) {
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: 'responder123' });
  const [activeTab, setActiveTab] = useState<'users' | 'reports' | 'analytics'>('users');
  const [userQuery, setUserQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'responder' | 'user'>('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(true);
  const [detailUser, setDetailUser] = useState<any | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(null);
  const [userSort, setUserSort] = useState<'name_asc' | 'name_desc' | 'role' | 'email'>('name_asc');
  const prevPendingRef = useRef<number>(0);
  const didInitRef = useRef<boolean>(false);
  const sseActiveRef = useRef<boolean>(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const unseenRef = useRef(0);
  const [unseen, setUnseen] = useState(0);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const headerScale = useRef(new Animated.Value(0.9)).current;
  const formScale = useRef(new Animated.Value(0.9)).current;
  const statsScale = useRef(new Animated.Value(0.9)).current;
  const listAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const refreshAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance animations
    Animated.sequence([
      // Header animation
      Animated.timing(headerScale, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      // Content fade and slide
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      // Staggered sections
      Animated.stagger(150, [
        Animated.spring(statsScale, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.spring(formScale, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(listAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Pulse animation for urgent reports
    const urgentReports = reports.filter(r => isPending(r.status));
    const pendingCount = urgentReports.length;
    if (sseActiveRef.current) {
      // When SSE is active, we avoid the count-based sound to prevent double beeps
      prevPendingRef.current = pendingCount;
      didInitRef.current = true;
    } else if (!didInitRef.current) {
      // Skip sound on initial load to avoid false alert
      prevPendingRef.current = pendingCount;
      didInitRef.current = true;
    } else if (pendingCount > prevPendingRef.current) {
      // New pending reports detected -> play notification sound
      playNotificationSound();
      prevPendingRef.current = pendingCount;
    } else {
      prevPendingRef.current = pendingCount;
    }
    if (urgentReports.length > 0) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [reports]);

  // SSE subscription (with polling fallback)
  useEffect(() => {
    let es: any = null;
    let pollTimer: any = null;

    const start = async () => {
      try {
        if (typeof (global as any).EventSource !== 'undefined') {
          es = new (global as any).EventSource(`${API_BASE_URL}/events`);
          es.onopen = () => { sseActiveRef.current = true; };
          es.onmessage = async (ev: MessageEvent) => {
            try {
              const evt = JSON.parse((ev as any).data);
              if (!evt || !evt.type) return;
              if (evt.type === 'report:new') {
                await load();
                playNotificationSound();
                const now = Date.now();
                const id = `new-${evt.report?._id || now}`;
                const item: Notif = { id, title: 'New report received', time: now, kind: 'new' };
                setNotifs(prev => [item, ...prev].slice(0, 30));
                unseenRef.current += 1; setUnseen(unseenRef.current);
              } else if (evt.type === 'report:update') {
                await load();
                const now = Date.now();
                const id = `upd-${evt.report?._id || now}`;
                const item: Notif = { id, title: 'Report status updated', time: now, kind: 'update' };
                setNotifs(prev => [item, ...prev].slice(0, 30));
                unseenRef.current += 1; setUnseen(unseenRef.current);
              }
            } catch {}
          };
          es.onerror = () => {
            // If the connection drops, fallback to polling
            sseActiveRef.current = false;
            try { es.close(); } catch {}
            es = null;
            pollTimer = setInterval(load, 10000);
          };
        } else {
          // Fallback polling every 10s
          pollTimer = setInterval(load, 10000);
        }
      } catch {
        // Any error -> fallback polling
        pollTimer = setInterval(load, 10000);
      }
    };

    start();

    return () => {
      sseActiveRef.current = false;
      if (es) { try { es.close(); } catch {} }
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  const load = async () => {
    // Refresh animation
    Animated.sequence([
      Animated.timing(refreshAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(refreshAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    const me = await getCurrentUser();
    if (!me || me.role !== 'admin') return navigation.replace('Login');
    // Load sound preference
    try {
      const pref = await isSoundEnabled();
      setSoundEnabledState(pref);
    } catch {}
    setUsers(await listUsers());
    const all = await listAllReports();
    setReports([...all].sort((a, b) => Number(b?.createdAt ?? 0) - Number(a?.createdAt ?? 0)));
  };

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation]);

  const onCreateResponder = async () => {
    // Button press animation
    Animated.sequence([
      Animated.timing(formScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(formScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    if (!form.name || !form.email || !form.phone) return Alert.alert('Missing fields');
    await createResponder(form);
    setForm({ name: '', email: '', phone: '', password: 'responder123' });
    await load();
  };

  const onDelete = async (id: string) => {
    await deleteAccount(id);
    await load();
  };

  const onLogout = async () => {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  const getStatsData = () => {
    const totalUsers = users.filter(u => u.role === 'user').length;
    const totalResponders = users.filter(u => u.role === 'responder').length;
    const pendingReports = reports.filter(r => r.status?.toLowerCase() === 'pending').length;
    const resolvedReports = reports.filter(r => r.status?.toLowerCase() === 'resolved').length;
    
    return { totalUsers, totalResponders, pendingReports, resolvedReports };
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending': return '#ff9800';
      case 'in-progress': return '#2196f3';
      case 'resolved': return '#4caf50';
      default: return '#999';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending': return '⏳';
      case 'in-progress': return '🚀';
      case 'resolved': return '✅';
      default: return '❓';
    }
  };

  const isPending = (status?: string) => status?.toLowerCase() === 'pending';

  const getRoleIcon = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'admin': return '⚡';
      case 'responder': return '🚑';
      case 'user': return '👤';
      default: return '❓';
    }
  };

const stats = getStatsData();

const renderUserCard = ({ item }: { item: any; index: number }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <View style={styles.roleContainer}>
        <Text style={styles.roleIcon}>{getRoleIcon(item.role)}</Text>
        <View style={[styles.roleBadge, { backgroundColor: item.role === 'admin' ? '#d90429' : '#667eea' }]}>
          <Text style={styles.roleBadgeText}>{item.role?.toUpperCase?.() || 'UNKNOWN'}</Text>
        </View>
      </View>
    </View>

    <Text style={styles.cardTitle}>{item.name}</Text>
    {!!item.email && <Text style={styles.cardMeta}>📧 {item.email}</Text>}
    {!!item.phone && <Text style={styles.cardMeta}>📱 {item.phone}</Text>}

    <View style={styles.actionRow}>
      <TouchableOpacity
        style={styles.viewBtn}
        onPress={() => setDetailUser(item)}
        activeOpacity={0.85}
      >
        <Text style={styles.viewBtnText}>👁️ View Details</Text>
      </TouchableOpacity>
      {item.role !== 'admin' && (
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => setConfirmTarget({ id: item.id, name: item.name })}
          activeOpacity={0.85}
        >
          <Text style={styles.deleteBtnText}>🗑️ Delete</Text>
        </TouchableOpacity>
      )}
    </View>
  </View>
);

const renderReportCard = ({ item }: { item: any; index: number }) => (
  <View style={[styles.card, styles.reportCard]}>
    <View style={styles.reportHeader}>
      <Text style={styles.reportType}>{item.type}</Text>
      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
        <Text style={styles.statusText}>
          {getStatusIcon(item.status)} {item.status?.toUpperCase?.() || 'UNKNOWN'}
        </Text>
      </View>
    </View>

    {!!item.chiefComplaint && (
      <Text style={styles.reportDescription} numberOfLines={2} ellipsizeMode="tail">
        🆘 Chief Complaint: {item.chiefComplaint}
      </Text>
    )}
    {!!item.description && (
      <Text style={styles.reportDescription} numberOfLines={3} ellipsizeMode="tail">
        📝 {item.description}
      </Text>
    )}
    {item.photoUri ? (
      <Image source={{ uri: item.photoUri }} style={styles.thumbnail} resizeMode="cover" />
    ) : null}

    <View style={styles.reportDetails}>
      {!!item.fullName && (
        <Text style={styles.reportMeta} numberOfLines={1} ellipsizeMode="tail">
          🙍 Full Name: {item.fullName}
        </Text>
      )}
      {!!item.contactNo && (
        <Text style={styles.reportMeta} numberOfLines={1} ellipsizeMode="tail">
          📞 Contact: {item.contactNo}
        </Text>
      )}
      {!!item.personsInvolved && (
        <Text style={styles.reportMeta} numberOfLines={1} ellipsizeMode="tail">
          👥 Persons Involved: {item.personsInvolved}
        </Text>
      )}
      <Text style={styles.reportMeta} numberOfLines={1} ellipsizeMode="tail">
        👨‍⚕️ Responder: {item.responderId}
      </Text>
      <Text style={styles.reportMeta} numberOfLines={1} ellipsizeMode="tail">
        👤 Reporter: {item.userId || 'Anonymous'}
      </Text>
      <Text style={styles.reportMeta}>
        📅 Created: {item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}
      </Text>
    </View>
  </View>
);

  return (
    <View style={styles.container}>
      <View style={styles.backgroundPattern} />
      
      {/* Header */}
      <Animated.View style={[styles.header, { transform: [{ scale: headerScale }] }]}> 
        <View style={styles.headerContent}>
          <Text style={styles.title}>⚡ Admin Dashboard</Text>
          <Text style={styles.subtitle}>Emergency Response Control</Text>
        </View>
        <View style={styles.headerActions}>
          <View style={{ position: 'relative' }}>
            <TouchableOpacity
              style={styles.bellBtn}
              onPress={() => { setNotifOpen(o => !o); if (!notifOpen) { unseenRef.current = 0; setUnseen(0); } }}
              activeOpacity={0.8}
            >
              <Text style={styles.bellIcon}>🔔</Text>
              {unseen > 0 && (
                <View style={styles.badge}><Text style={styles.badgeText}>{unseen}</Text></View>
              )}
            </TouchableOpacity>
            {notifOpen && (
              <View style={styles.dropdown}>
                {notifs.length === 0 ? (
                  <Text style={styles.emptyText}>No notifications yet</Text>
                ) : (
                  notifs.map(n => (
                    <View key={n.id} style={styles.notifItem}>
                      <Text style={[styles.notifDot, { color: n.kind === 'new' ? '#ffd166' : '#66d9ef' }]}>•</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.notifTitle}>{n.title}</Text>
                        <Text style={styles.notifTime}>{new Date(n.time).toLocaleTimeString()}</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.menuBtn} onPress={() => setMenuOpen(v => !v)} activeOpacity={0.8}>
            <Text style={styles.menuBtnText}>☰</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Menu Overlay */}
      {menuOpen && (
        <View style={styles.menuOverlay} pointerEvents="box-none">
          <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuContainer}>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); Alert.alert('Profile', 'Coming soon'); }}>
              <Text style={styles.menuItemText}>👤 Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); Alert.alert('Settings', 'Coming soon'); }}>
              <Text style={styles.menuItemText}>⚙️ Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={async () => {
                const next = !soundEnabled;
                setSoundEnabledState(next);
                await setSoundEnabled(next);
              }}
            >
              <Text style={styles.menuItemText}>{soundEnabled ? '🔔 Sound: On' : '🔕 Sound: Off'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); Alert.alert('About & Services', 'Coming soon'); }}>
              <Text style={styles.menuItemText}>ℹ️ About & Services</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#d90429' }]} onPress={() => { setMenuOpen(false); onLogout(); }}>
              <Text style={[styles.menuItemText, { color: '#fff' }]}>🚪 Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* User Details Modal */}
      <Modal visible={!!detailUser} transparent animationType="fade" onRequestClose={() => setDetailUser(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>👤 User Details</Text>
            {detailUser && (
              <View>
                <Text style={styles.modalRow}>🆔 ID: {detailUser.id}</Text>
                <Text style={styles.modalRow}>👤 Name: {detailUser.name}</Text>
                <Text style={styles.modalRow}>📧 Email: {detailUser.email}</Text>
                <Text style={styles.modalRow}>📱 Phone: {detailUser.phone}</Text>
                <Text style={styles.modalRow}>🛡️ Role: {detailUser.role}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setDetailUser(null)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={!!confirmTarget} transparent animationType="fade" onRequestClose={() => setConfirmTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Delete</Text>
            {confirmTarget && (
              <Text style={styles.modalRow}>
                Permanently delete {confirmTarget.name}'s account? This action cannot be undone.
              </Text>
            )}
            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setConfirmTarget(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalDeleteBtn}
                onPress={async () => {
                  if (confirmTarget) {
                    const id = confirmTarget.id;
                    setConfirmTarget(null);
                    await onDelete(id);
                  }
                }}
              >
                <Text style={styles.modalDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Stats Overview */}
        <Animated.View
          style={[
            styles.statsContainer,
            {
              opacity: fadeAnim,
              transform: [
                { translateY: slideAnim },
                { scale: statsScale }
              ],
            },
          ]}
        >
          <Text style={styles.sectionTitle}>📊 System Overview</Text>
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: '#667eea20' }]}>
              <Text style={styles.statNumber}>{stats.totalUsers}</Text>
              <Text style={styles.statLabel}>👥 Users</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#00ff8820' }]}>
              <Text style={styles.statNumber}>{stats.totalResponders}</Text>
              <Text style={styles.statLabel}>🚑 Responders</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#ff980020' }]}>
              <Text style={styles.statNumber}>{stats.pendingReports}</Text>
              <Text style={styles.statLabel}>⏳ Pending</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#4caf5020' }]}>
              <Text style={styles.statNumber}>{stats.resolvedReports}</Text>
              <Text style={styles.statLabel}>✅ Resolved</Text>
            </View>
          </View>
        </Animated.View>

        {/* Top Tabs */}
        <Animated.View style={[styles.tabsContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {(
            [
              { key: 'users', label: 'User Management' },
              { key: 'reports', label: 'All Reports' },
              { key: 'analytics', label: 'System Analytics' },
            ] as const
          ).map(t => (
            <TouchableOpacity key={t.key} style={[styles.tabItem, activeTab === t.key && styles.tabItemActive]} onPress={() => setActiveTab(t.key)}>
              <Text
                style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>

        {/* Users Management (Tab) */}
        {activeTab === 'users' && (
          <Animated.View
            style={[
              styles.listContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <Text style={styles.sectionTitle}>User & Responder Management</Text>
            <Text style={styles.sectionSubtitle}>Manage all users and emergency responders with full CRUD operations.</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'center' }}>
              <TouchableOpacity style={[styles.addBtn]} onPress={() => navigation.navigate('AdminCreateUsers')}>
                <Text style={styles.addBtnText}>➕ Add User</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              placeholder="Search by name or email"
              placeholderTextColor="#888"
              style={styles.searchInput}
              value={userQuery}
              onChangeText={setUserQuery}
            />
            <View style={styles.filterRow}>
              {(['all','admin','responder','user'] as const).map(r => (
                <TouchableOpacity key={r} style={[styles.chip, roleFilter===r && styles.chipActive]} onPress={() => setRoleFilter(r)}>
                  <Text style={[styles.chipText, roleFilter===r && styles.chipTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.filterRow}>
              <Text style={styles.sortLabel}>Sort by:</Text>
              {([
                { k: 'name_asc', label: 'Name A-Z' },
                { k: 'name_desc', label: 'Name Z-A' },
                { k: 'role', label: 'Role' },
                { k: 'email', label: 'Email' },
              ] as const).map(opt => (
                <TouchableOpacity key={opt.k} style={[styles.chip, userSort===opt.k && styles.chipActive]} onPress={() => setUserSort(opt.k)}>
                  <Text style={[styles.chipText, userSort===opt.k && styles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {(() => {
              const q = userQuery.trim().toLowerCase();
              const filtered = users.filter(u => (
                (roleFilter==='all' ? true : u.role === roleFilter) &&
                (!q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
              ));
              const sorted = [...filtered].sort((a, b) => {
                const safe = (v: any) => (typeof v === 'string' ? v.toLowerCase() : v || '');
                switch (userSort) {
                  case 'name_asc':
                    return safe(a.name).localeCompare(safe(b.name));
                  case 'name_desc':
                    return safe(b.name).localeCompare(safe(a.name));
                  case 'role':
                    return safe(a.role).localeCompare(safe(b.role)) || safe(a.name).localeCompare(safe(b.name));
                  case 'email':
                    return safe(a.email).localeCompare(safe(b.email));
                  default:
                    return 0;
                }
              });
              return filtered.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>🔎</Text>
                  <Text style={styles.emptyText}>No matching users</Text>
                </View>
              ) : (
                <FlatList
                  data={sorted}
                  keyExtractor={(item) => item.id}
                  renderItem={renderUserCard}
                  scrollEnabled={false}
                  showsVerticalScrollIndicator={false}
                />
              );
            })()}
          </Animated.View>
        )}

        {/* Reports Overview (Tab) */}
        {activeTab === 'reports' && (
          <Animated.View
            style={[
              styles.listContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <Text style={styles.sectionTitle}>📋 Emergency Reports ({reports.length})</Text>
            {reports.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={styles.emptyText}>No reports submitted yet</Text>
              </View>
            ) : (
              <FlatList
                data={reports}
                keyExtractor={(item) => item.id}
                renderItem={renderReportCard}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
              />
            )}
          </Animated.View>
        )}

        {/* System Analytics (Tab placeholder) */}
        {activeTab === 'analytics' && (
          <Animated.View style={[styles.listContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={styles.sectionTitle}>📈 System Analytics</Text>
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🛠️</Text>
              <Text style={styles.emptyText}>Analytics coming soon</Text>
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  backgroundPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#667eea',
    opacity: 0.05,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 50,
    backgroundColor: '#1a1a2e',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    zIndex: 100,
  },
  menuOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 30,
  },
  menuBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  menuBtn: {
    backgroundColor: '#2b2d42',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  menuBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  menuContainer: {
    position: 'absolute',
    right: 20,
    top: 90,
    backgroundColor: '#0f0f23',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    width: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 40,
    overflow: 'hidden',
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f35',
  },
  menuItemText: {
    color: '#fff',
    fontWeight: '700',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#333',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bellBtn: {
    backgroundColor: '#2b2d42',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  bellIcon: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#d90429',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#111629',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  dropdown: {
    position: 'absolute',
    right: 0,
    top: 44,
    backgroundColor: '#0f0f23',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    width: Math.min(width * 0.8, 280),
    maxHeight: 260,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 30,
    zIndex: 2000,
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f35',
  },
  notifDot: {
    fontSize: 18,
    marginRight: 2,
  },
  notifTitle: {
    color: '#fff',
    fontWeight: '700',
  },
  notifTime: {
    color: '#999',
    fontSize: 11,
  },
  logoutBtn: {
    backgroundColor: '#d90429',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#d90429',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoutBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  scrollContainer: {
    flex: 1,
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  tabItem: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  tabItemActive: {
    borderColor: '#667eea',
  },
  tabText: {
    color: '#999',
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  tabTextActive: {
    color: '#fff',
  },
  statsContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#a0a0a0',
    marginTop: -8,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: '#1a1a2e',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  formContainer: {
    padding: 20,
    paddingTop: 0,
  },
  addBtn: {
    backgroundColor: '#667eea',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4455aa',
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
  searchInput: {
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#111629',
    color: '#fff',
    marginBottom: 10,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    backgroundColor: '#2a2a3e',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  chipActive: {
    backgroundColor: '#667eea',
    borderColor: '#667eea',
  },
  chipText: {
    color: '#bbb',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  chipTextActive: {
    color: '#fff',
  },
  sortLabel: {
    color: '#bbb',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingVertical: 6,
    marginRight: 4,
  },
  formGrid: {
    gap: 16,
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#1a1a2e',
    color: '#fff',
  },
  inputFilled: {
    borderColor: '#667eea',
  },
  createBtn: {
    backgroundColor: '#667eea',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  createBtnReady: {
    backgroundColor: '#00ff88',
    shadowColor: '#00ff88',
  },
  buttonContent: {
    position: 'relative',
  },
  createBtnText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 16,
  },
  buttonGlow: {
    position: 'absolute',
    top: 0,
    left: -100,
    width: 100,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    transform: [{ skewX: '-20deg' }],
  },
  listContainer: {
    padding: 20,
    paddingTop: 0,
  },
  card: {
    backgroundColor: '#1a1a2e',
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  roleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleIcon: {
    fontSize: 20,
  },
  roleBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  roleBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  cardMeta: {
    color: '#999',
    fontSize: 14,
    marginBottom: 4,
  },
  deleteBtn: {
    backgroundColor: '#d90429',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  deleteBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  viewBtn: {
    backgroundColor: '#2b2d42',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3d5c',
  },
  viewBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  reportCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#d90429',
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  reportType: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  reportDescription: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  reportDetails: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 12,
    gap: 4,
  },
  thumbnail: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
  },
  reportMeta: {
    color: '#999',
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    color: '#999',
    fontSize: 16,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#0f0f23',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    padding: 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  modalRow: {
    color: '#bbb',
    fontSize: 14,
    marginBottom: 6,
  },
  modalCloseBtn: {
    backgroundColor: '#667eea',
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#fff',
    fontWeight: '800',
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  modalCancelBtn: {
    backgroundColor: '#2b2d42',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3d5c',
  },
  modalCancelText: {
    color: '#fff',
    fontWeight: '700',
  },
  modalDeleteBtn: {
    backgroundColor: '#d90429',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modalDeleteText: {
    color: '#fff',
    fontWeight: '800',
  },
});