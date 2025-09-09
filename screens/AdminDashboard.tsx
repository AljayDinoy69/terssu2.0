import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert, Animated, Dimensions, ScrollView, Image, Modal } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { createResponder, deleteAccount, getCurrentUser, listAllReports, listUsers, logout, listNotifications, markNotificationRead, deleteNotification, markAllNotificationsRead, Notification as NotificationItem } from '../utils/auth';
import { API_BASE_URL } from '../utils/api';
import { playNotificationSound } from '../utils/sound';
import { isSoundEnabled, setSoundEnabled, getNotificationFrequency, NotificationFrequency } from '../utils/settings';
import ProfileModal from './ProfileModal';
import SettingsModal from '../components/SettingsModal';
import { useTheme } from '../components/ThemeProvider';

export type AdminDashProps = NativeStackScreenProps<RootStackParamList, 'AdminDashboard'>;

// Server-backed notifications

const { width } = Dimensions.get('window');

export default function AdminDashboard({ navigation }: AdminDashProps) {
  const { colors } = useTheme();
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
  const [reportSort, setReportSort] = useState<'all' | 'pending' | 'in-progress' | 'resolved'>('all');
  const [userSortDropdown, setUserSortDropdown] = useState(false);
  const [reportSortDropdown, setReportSortDropdown] = useState(false);
  const prevPendingRef = useRef<number>(0);
  const didInitRef = useRef<boolean>(false);
  const sseActiveRef = useRef<boolean>(false);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const unseenRef = useRef(0);
  const [unseen, setUnseen] = useState(0);
  const [detailReport, setDetailReport] = useState<any | null>(null);
  const [editProfile, setEditProfile] = useState<any | null>(null);
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'user'
  });
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationFreq, setNotificationFreq] = useState<NotificationFrequency>('normal');

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
      // New pending reports detected -> play notification sound (respect preferences)
      if (soundEnabled && notificationFreq !== 'off') {
        playNotificationSound();
      }
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
        const me = await getCurrentUser();
        if (typeof (global as any).EventSource !== 'undefined') {
          es = new (global as any).EventSource(`${API_BASE_URL}/events`);
          es.onopen = () => { sseActiveRef.current = true; };
          es.onmessage = async (ev: MessageEvent) => {
            try {
              const evt = JSON.parse((ev as any).data);
              if (!evt || !evt.type) return;
              if (evt.type === 'report:new') {
                await load();
                if (soundEnabled && notificationFreq !== 'off') {
                  playNotificationSound();
                }
                await loadNotifications();
              } else if (evt.type === 'report:update') {
                await load();
                // Ensure updates also have sound (respect preferences)
                if (soundEnabled && notificationFreq !== 'off') {
                  playNotificationSound();
                }
                await loadNotifications();
              }
            } catch {}
          };
          es.onerror = () => {
            // If the connection drops, fallback to polling
            sseActiveRef.current = false;
            try { es.close(); } catch {}
            es = null;
            pollTimer = setInterval(async () => { await load(); await loadNotifications(); }, 10000);
          };
        } else {
          // Fallback polling every 10s
          pollTimer = setInterval(async () => { await load(); await loadNotifications(); }, 10000);
        }
      } catch {
        // Any error -> fallback polling
        pollTimer = setInterval(async () => { await load(); await loadNotifications(); }, 10000);
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
    setCurrentUser(me);
    // Load sound preference
    try {
      const pref = await isSoundEnabled();
      setSoundEnabledState(pref);
    } catch {}
    // Load notification frequency
    try {
      const freq = await getNotificationFrequency();
      setNotificationFreq(freq);
    } catch {}
    setUsers(await listUsers());
    const all = await listAllReports();
    setReports([...all].sort((a, b) => Number(b?.createdAt ?? 0) - Number(a?.createdAt ?? 0)));
  };

  const loadNotifications = async () => {
    try {
      const me = await getCurrentUser();
      if (!me) return;
      const items = await listNotifications(me.id);
      const sorted = [...items].sort((a, b) => Number(new Date(b.createdAt || 0)) - Number(new Date(a.createdAt || 0)));
      setNotifs(sorted);
      const unread = sorted.filter(n => !n.read).length;
      unseenRef.current = unread; setUnseen(unread);
    } catch {}
  };

  useEffect(() => {
    const unsub = navigation.addListener('focus', async () => { await load(); await loadNotifications(); });
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

  // Profile editing functions
  const openProfileEdit = async () => {
    try {
      const me = await getCurrentUser();
      if (me) {
        setCurrentUser(me);
        setProfileModalVisible(true);
        setMenuOpen(false);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load profile information');
    }
  };

  const saveProfile = async () => {
    try {
      // Basic validation
      if (!profileForm.name.trim()) {
        Alert.alert('Error', 'Name is required');
        return;
      }
      if (!profileForm.email.trim()) {
        Alert.alert('Error', 'Email is required');
        return;
      }
      if (!profileForm.phone.trim()) {
        Alert.alert('Error', 'Phone is required');
        return;
      }

      // Here you would typically call an API to update the user profile
      // For now, we'll just show a success message
      Alert.alert('Success', 'Profile updated successfully!', [
        {
          text: 'OK',
          onPress: () => {
            setEditProfile(null);
            // Refresh data
            load();
          }
        }
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    }
  };

  const cancelProfileEdit = () => {
    setEditProfile(null);
    setProfileForm({
      name: '',
      email: '',
      phone: '',
      role: 'user'
    });
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
    {(item.photoUrl || item.photoUri) ? (
      <Image source={{ uri: item.photoUrl || item.photoUri }} style={styles.thumbnail} resizeMode="cover" />
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

    {/* View Details Button */}
    <TouchableOpacity
      style={styles.viewDetailsBtn}
      onPress={() => setDetailReport(item)}
      activeOpacity={0.85}
    >
      <Text style={styles.viewDetailsBtnText}>👁️ View Full Details</Text>
    </TouchableOpacity>
  </View>
);

return (
  <View style={[styles.container, { backgroundColor: colors.background }]}>
    <View style={styles.backgroundPattern} />
    {/* Header */}
    <Animated.View style={[styles.header, { transform: [{ scale: headerScale }] }]}> 
      <View style={styles.headerContent}>
        <Text style={[styles.title, { color: colors.text }]}>⚡ Admin Dashboard</Text>
        <Text style={[styles.subtitle, { color: colors.text, opacity: 0.8 }]}>Emergency Response Control</Text>
        {/* Debug: show avatar URL used */}
        <Text style={[styles.debugUrl, { color: colors.text }]} numberOfLines={1}>{String(currentUser?.avatarUrl || currentUser?.photoUrl || '')}</Text>
      </View>
      <View style={styles.headerActions}>
        <View style={{ position: 'relative' }}>
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => { setNotifOpen(o => !o); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.bellIcon, { color: colors.text }]}>🔔</Text>
            {unseen > 0 && (
              <View style={styles.badge}><Text style={styles.badgeText}>{unseen}</Text></View>
            )}
          </TouchableOpacity>
          {notifOpen && (
            <View style={[styles.dropdown, { maxHeight: 360 }]}>  
              {notifs.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.text + '99' }]}>No notifications yet</Text>
              ) : (
                <>
                  <View style={{ paddingHorizontal: 12, paddingBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: colors.text + '99', fontWeight: '700' }}>Notifications</Text>
                    {unseen > 0 && (
                      <TouchableOpacity 
                        onPress={async () => {
                          try {
                            const me = await getCurrentUser(); if (!me) return;
                            await markAllNotificationsRead(me.id);
                            setNotifs(prev => prev.map(x => ({ ...x, read: true })));
                            unseenRef.current = 0; setUnseen(0);
                          } catch {}
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={{ color: '#66d9ef', fontWeight: '800' }}>Mark all as read</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {notifs.map(n => (
                      <TouchableOpacity
                        key={n.id}
                        style={[styles.notifItem, { opacity: n.read ? 0.7 : 1 }]}
                        onPress={async () => {
                          // Load report and open modal
                          if (n.reportId) {
                            const rep = reports.find(r => String(r.id) === String(n.reportId));
                            if (rep) setDetailReport(rep);
                            else {
                              const all = await listAllReports();
                              const found = all.find(r => String(r.id) === String(n.reportId)) || null;
                              if (found) setDetailReport(found);
                            }
                          }
                          try {
                            if (!n.read) {
                              await markNotificationRead(n.id, true);
                              setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
                              if (unseenRef.current > 0) { unseenRef.current -= 1; setUnseen(unseenRef.current); }
                            }
                          } catch {}
                          setNotifOpen(false);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.notifDot, { color: n.kind === 'new' ? '#ffd166' : '#66d9ef' }]}>•</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.notifTitle, { color: colors.text, fontWeight: n.read ? '600' : '800' }]}>{n.title}</Text>
                          <Text style={[styles.notifTime, { color: colors.text + '66' }]}>{n.createdAt ? new Date(n.createdAt as any).toLocaleTimeString() : ''}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={async () => {
                            try {
                              const next = !n.read; await markNotificationRead(n.id, next);
                              setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: next } : x));
                              unseenRef.current = Math.max(0, unseenRef.current + (next ? -1 : 1));
                              setUnseen(unseenRef.current);
                            } catch {}
                          }}
                          style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ color: '#ffd166', fontWeight: '800' }}>{n.read ? 'Unread' : 'Read'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={async () => {
                            try {
                              await deleteNotification(n.id);
                              setNotifs(prev => prev.filter(x => x.id !== n.id));
                              if (!n.read && unseenRef.current > 0) { unseenRef.current -= 1; setUnseen(unseenRef.current); }
                            } catch {}
                          }}
                          style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ color: '#d90429', fontWeight: '800' }}>Delete</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setMenuOpen(v => !v)} activeOpacity={0.8}>
          <Text style={[styles.menuBtnText, { color: colors.text }]}>☰</Text>
        </TouchableOpacity>
      </View>
      </Animated.View>

      {/* Menu Overlay */}
      {menuOpen && (
        <View style={styles.menuOverlay} pointerEvents="box-none">
          <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuContainer}>
            <TouchableOpacity style={styles.menuItem} onPress={openProfileEdit}>
              <Text style={styles.menuItemText}>👤 Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); setSettingsOpen(true); }}>
              <Text style={styles.menuItemText}>⚙️ Settings</Text>
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

      {/* Profile Edit Modal */}
      <Modal visible={!!editProfile} transparent animationType="fade" onRequestClose={cancelProfileEdit}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>👤 Edit Profile</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Profile Picture Placeholder */}
              <View style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>
                  {profileForm.name ? profileForm.name.charAt(0).toUpperCase() : '👤'}
                </Text>
              </View>

              {/* Form Fields */}
              <View style={styles.formContainer}>
                <Text style={styles.inputLabel}>👤 Full Name</Text>
                <TextInput
                  style={[styles.input, profileForm.name && styles.inputFilled]}
                  placeholder="Enter your full name"
                  placeholderTextColor="#888"
                  value={profileForm.name}
                  onChangeText={(text) => setProfileForm(prev => ({ ...prev, name: text }))}
                  autoCapitalize="words"
                />

                <Text style={styles.inputLabel}>📧 Email Address</Text>
                <TextInput
                  style={[styles.input, profileForm.email && styles.inputFilled]}
                  placeholder="Enter your email"
                  placeholderTextColor="#888"
                  value={profileForm.email}
                  onChangeText={(text) => setProfileForm(prev => ({ ...prev, email: text }))}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Text style={styles.inputLabel}>📱 Phone Number</Text>
                <TextInput
                  style={[styles.input, profileForm.phone && styles.inputFilled]}
                  placeholder="Enter your phone number"
                  placeholderTextColor="#888"
                  value={profileForm.phone}
                  onChangeText={(text) => setProfileForm(prev => ({ ...prev, phone: text }))}
                  keyboardType="phone-pad"
                />

                <Text style={styles.inputLabel}>🛡️ Role</Text>
                <View style={styles.roleSelector}>
                  {(['user', 'responder', 'admin'] as const).map((role) => (
                    <TouchableOpacity
                      key={role}
                      style={[styles.roleOption, profileForm.role === role && styles.roleOptionActive]}
                      onPress={() => setProfileForm(prev => ({ ...prev, role }))}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.roleOptionText, profileForm.role === role && styles.roleOptionTextActive]}>
                        {role === 'admin' ? '⚡ Admin' : role === 'responder' ? '🚑 Responder' : '👤 User'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Current User Info (Read-only) */}
                {editProfile && (
                  <View style={styles.currentInfo}>
                    <Text style={styles.currentInfoTitle}>📋 Current Information</Text>
                    <Text style={styles.currentInfoText}>🆔 ID: {editProfile.id}</Text>
                    <Text style={styles.currentInfoText}>📅 Joined: {editProfile.createdAt ? new Date(editProfile.createdAt).toLocaleDateString() : 'Unknown'}</Text>
                  </View>
                )}
              </View>
            </ScrollView>

      {/* Profile Modal */}
      <ProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        user={currentUser}
        onProfileUpdated={(u) => { setCurrentUser(u); setProfileModalVisible(false); }}
        onAccountDeleted={() => { setProfileModalVisible(false); }}
        navigation={navigation}
      />

      {/* Settings Modal */}
      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        soundEnabled={soundEnabled}
        onToggleSound={async (next) => { setSoundEnabledState(next); await setSoundEnabled(next); }}
      />

            {/* Action Buttons */}
            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={cancelProfileEdit}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveProfile}>
                <Text style={styles.modalSaveText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

      {/* Report Details Modal */}
      <Modal visible={!!detailReport} transparent animationType="fade" onRequestClose={() => setDetailReport(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📋 Report Details</Text>
            {detailReport && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalRow}>🆔 ID: {detailReport.id}</Text>
                <Text style={styles.modalRow}>🏷️ Type: {detailReport.type}</Text>
                <Text style={styles.modalRow}>📍 Status: {detailReport.status}</Text>
                {detailReport.chiefComplaint && (
                  <Text style={styles.modalRow}>🆘 Chief Complaint: {detailReport.chiefComplaint}</Text>
                )}
                {detailReport.description && (
                  <Text style={styles.modalRow}>📝 Description: {detailReport.description}</Text>
                )}
                {detailReport.fullName && (
                  <Text style={styles.modalRow}>🙍 Full Name: {detailReport.fullName}</Text>
                )}
                {detailReport.contactNo && (
                  <Text style={styles.modalRow}>📞 Contact: {detailReport.contactNo}</Text>
                )}
                {detailReport.personsInvolved && (
                  <Text style={styles.modalRow}>👥 Persons Involved: {detailReport.personsInvolved}</Text>
                )}
                <Text style={styles.modalRow}>👨‍⚕️ Responder: {detailReport.responderId}</Text>
                <Text style={styles.modalRow}>👤 Reporter: {detailReport.userId || 'Anonymous'}</Text>
                <Text style={styles.modalRow}>📅 Created: {detailReport.createdAt ? new Date(detailReport.createdAt).toLocaleString() : '—'}</Text>
                {detailReport.updatedAt && (
                  <Text style={styles.modalRow}>🔄 Updated: {new Date(detailReport.updatedAt).toLocaleString()}</Text>
                )}
                {detailReport.photoUrl && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.modalRow}>📸 Photo:</Text>
                    <Image source={{ uri: detailReport.photoUrl }} style={styles.thumbnail} resizeMode="cover" />
                  </View>
                )}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setDetailReport(null)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
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
              <View style={{ position: 'relative' }}>
                <TouchableOpacity
                  style={[styles.sortDropdownBtn, userSortDropdown && styles.sortDropdownBtnActive]}
                  onPress={() => setUserSortDropdown(!userSortDropdown)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.sortDropdownBtnText}>
                    {(() => {
                      switch (userSort) {
                        case 'name_asc': return '👤 Name A-Z';
                        case 'name_desc': return '👤 Name Z-A';
                        case 'role': return '🛡️ Role';
                        case 'email': return '📧 Email';
                        default: return '👤 Name A-Z';
                      }
                    })()}
                  </Text>
                  <Text style={styles.dropdownArrow}>▼</Text>
                </TouchableOpacity>

                {userSortDropdown && (
                  <>
                    <TouchableOpacity 
                      style={styles.dropdownBackdrop} 
                      activeOpacity={1} 
                      onPress={() => setUserSortDropdown(false)}
                    />
                    <View style={[styles.dropdown, { top: 44, right: 0, width: 180, zIndex: 1000 }]}>
                      {[
                        { key: 'name_asc', label: '👤 Name A-Z' },
                        { key: 'name_desc', label: '👤 Name Z-A' },
                        { key: 'role', label: '🛡️ Role' },
                        { key: 'email', label: '📧 Email' },
                      ].map((option) => (
                        <TouchableOpacity
                          key={option.key}
                          style={[styles.dropdownItem, userSort === option.key && styles.dropdownItemActive]}
                          onPress={() => {
                            setUserSort(option.key as any);
                            setUserSortDropdown(false);
                          }}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.dropdownItemText, userSort === option.key && styles.dropdownItemTextActive]}>
                            {option.label}
                          </Text>
                          {userSort === option.key && (
                            <Text style={styles.dropdownCheck}>✓</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </View>
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
            <Text style={styles.sectionSubtitle}>Filter and sort reports by status to manage emergency response efficiently.</Text>
            
            {/* Report Status Filter */}
            <View style={[styles.filterRow, reportSortDropdown && { zIndex: 4000, elevation: 60 }]}>
              <Text style={styles.sortLabel}>Filter by:</Text>
              <View style={{ position: 'relative', zIndex: reportSortDropdown ? 4000 : 1, elevation: reportSortDropdown ? 60 : 0 }}>
                <TouchableOpacity
                  style={[styles.sortDropdownBtn, reportSortDropdown && styles.sortDropdownBtnActive]}
                  onPress={() => setReportSortDropdown(!reportSortDropdown)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.sortDropdownBtnText}>
                    {(() => {
                      switch (reportSort) {
                        case 'all': return '📋 All Reports';
                        case 'pending': return '⏳ Pending';
                        case 'in-progress': return '🚀 In Progress';
                        case 'resolved': return '✅ Resolved';
                        default: return '📋 All Reports';
                      }
                    })()}
                  </Text>
                  <Text style={styles.dropdownArrow}>▼</Text>
                </TouchableOpacity>

                {reportSortDropdown && (
                  <>
                    <TouchableOpacity 
                      style={[styles.dropdownBackdrop]} 
                      activeOpacity={1} 
                      onPress={() => setReportSortDropdown(false)}
                    />
                    <View style={[styles.dropdown, { top: 44, right: 0, width: 180, zIndex: 5000, elevation: 80 }]}>
                      {[
                        { key: 'all', label: '📋 All Reports' },
                        { key: 'pending', label: '⏳ Pending' },
                        { key: 'in-progress', label: '🚀 In Progress' },
                        { key: 'resolved', label: '✅ Resolved' },
                      ].map((option) => (
                        <TouchableOpacity
                          key={option.key}
                          style={[styles.dropdownItem, reportSort === option.key && styles.dropdownItemActive]}
                          onPress={() => {
                            setReportSort(option.key as any);
                            setReportSortDropdown(false);
                          }}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.dropdownItemText, reportSort === option.key && styles.dropdownItemTextActive]}>
                            {option.label}
                          </Text>
                          {reportSort === option.key && (
                            <Text style={styles.dropdownCheck}>✓</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </View>
            </View>
            {reports.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📭</Text>
                <Text style={styles.emptyText}>No reports submitted yet</Text>
              </View>
            ) : (
              (() => {
                // Filter reports based on selected status
                const filteredReports = reports.filter(report => {
                  if (reportSort === 'all') return true;
                  return report.status?.toLowerCase() === reportSort;
                });

                // Sort filtered reports by creation date (newest first)
                const sortedReports = [...filteredReports].sort((a, b) => 
                  new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
                );

                return (
                  <FlatList
                    data={sortedReports}
                    keyExtractor={(item) => item.id}
                    renderItem={renderReportCard}
                    scrollEnabled={false}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                      <View style={styles.emptyState}>
                        <Text style={styles.emptyIcon}>
                          {reportSort === 'pending' ? '⏳' : reportSort === 'in-progress' ? '🚀' : reportSort === 'resolved' ? '✅' : '📭'}
                        </Text>
                        <Text style={styles.emptyText}>
                          {reportSort === 'pending' ? 'No pending reports' : 
                           reportSort === 'in-progress' ? 'No reports in progress' : 
                           reportSort === 'resolved' ? 'No resolved reports' : 
                           'No reports found'}
                        </Text>
                      </View>
                    }
                  />
                );
              })()
            )}
          </Animated.View>
        )}

        {/* System Analytics (Tab) */}
        {activeTab === 'analytics' && (
          <Animated.View style={[styles.listContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={styles.sectionTitle}>📊 System Analytics</Text>
            <Text style={styles.sectionSubtitle}>Comprehensive system performance and usage insights</Text>

            {/* Analytics Grid */}
            <View style={styles.analyticsGrid}>
              {/* Report Status Distribution */}
              <View style={styles.analyticsCard}>
                <Text style={styles.analyticsCardTitle}>📋 Report Status Distribution</Text>
                <View style={styles.chartContainer}>
                  {(() => {
                    const total = reports.length;
                    const pending = reports.filter(r => r.status?.toLowerCase() === 'pending').length;
                    const progress = reports.filter(r => r.status?.toLowerCase() === 'in-progress').length;
                    const resolved = reports.filter(r => r.status?.toLowerCase() === 'resolved').length;

                    return (
                      <View style={styles.barChart}>
                        <View style={styles.chartItem}>
                          <Text style={styles.chartLabel}>Pending</Text>
                          <View style={styles.barContainer}>
                            <View style={[styles.bar, { width: total > 0 ? `${(pending / total) * 100}%` : '0%', backgroundColor: '#ff9800' }]} />
                            <Text style={styles.barValue}>{pending}</Text>
                          </View>
                        </View>
                        <View style={styles.chartItem}>
                          <Text style={styles.chartLabel}>In Progress</Text>
                          <View style={styles.barContainer}>
                            <View style={[styles.bar, { width: total > 0 ? `${(progress / total) * 100}%` : '0%', backgroundColor: '#2196f3' }]} />
                            <Text style={styles.barValue}>{progress}</Text>
                          </View>
                        </View>
                        <View style={styles.chartItem}>
                          <Text style={styles.chartLabel}>Resolved</Text>
                          <View style={styles.barContainer}>
                            <View style={[styles.bar, { width: total > 0 ? `${(resolved / total) * 100}%` : '0%', backgroundColor: '#4caf50' }]} />
                            <Text style={styles.barValue}>{resolved}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })()}
                </View>
              </View>

              {/* Report Types Distribution */}
              <View style={styles.analyticsCard}>
                <Text style={styles.analyticsCardTitle}>🏷️ Report Types</Text>
                <View style={styles.pieChart}>
                  {(() => {
                    const typeCounts: { [key: string]: number } = {};
                    reports.forEach(r => {
                      const type = r.type || 'Unknown';
                      typeCounts[type] = (typeCounts[type] || 0) + 1;
                    });

                    const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe'];
                    let colorIndex = 0;

                    return Object.entries(typeCounts).map(([type, count]) => {
                      const percentage = reports.length > 0 ? (count / reports.length) * 100 : 0;
                      return (
                        <View key={type} style={styles.pieItem}>
                          <View style={[styles.pieDot, { backgroundColor: colors[colorIndex++ % colors.length] }]} />
                          <Text style={styles.pieLabel}>{type}</Text>
                          <Text style={styles.pieValue}>{count} ({percentage.toFixed(1)}%)</Text>
                        </View>
                      );
                    });
                  })()}
                </View>
              </View>

              {/* Responder Performance */}
              <View style={styles.analyticsCard}>
                <Text style={styles.analyticsCardTitle}>🚑 Responder Performance</Text>
                <View style={styles.performanceList}>
                  {(() => {
                    const responderStats: { [key: string]: { total: number; resolved: number; pending: number } } = {};
                    reports.forEach(r => {
                      const responder = r.responderId || 'Unassigned';
                      if (!responderStats[responder]) {
                        responderStats[responder] = { total: 0, resolved: 0, pending: 0 };
                      }
                      responderStats[responder].total++;
                      if (r.status?.toLowerCase() === 'resolved') {
                        responderStats[responder].resolved++;
                      } else if (r.status?.toLowerCase() === 'pending') {
                        responderStats[responder].pending++;
                      }
                    });

                    return Object.entries(responderStats)
                      .sort(([, a], [, b]) => b.total - a.total)
                      .slice(0, 5)
                      .map(([responder, stats]) => {
                        const completionRate = stats.total > 0 ? (stats.resolved / stats.total) * 100 : 0;
                        return (
                          <View key={responder} style={styles.performanceItem}>
                            <View style={styles.performanceHeader}>
                              <Text style={styles.performanceName}>{responder}</Text>
                              <Text style={styles.performanceRate}>{completionRate.toFixed(1)}%</Text>
                            </View>
                            <View style={styles.performanceBar}>
                              <View style={[styles.performanceFill, { width: `${completionRate}%`, backgroundColor: completionRate > 80 ? '#4caf50' : completionRate > 60 ? '#ff9800' : '#f44336' }]} />
                            </View>
                            <Text style={styles.performanceStats}>
                              {stats.resolved}/{stats.total} resolved • {stats.pending} pending
                            </Text>
                          </View>
                        );
                      });
                  })()}
                </View>
              </View>

              {/* Time-based Analytics */}
              <View style={styles.analyticsCard}>
                <Text style={styles.analyticsCardTitle}>📈 Reports Over Time</Text>
                <View style={styles.timeChart}>
                  {(() => {
                    const last7Days = Array.from({ length: 7 }, (_, i) => {
                      const date = new Date();
                      date.setDate(date.getDate() - (6 - i));
                      return date.toISOString().split('T')[0];
                    });

                    const dayCounts = last7Days.map(date => {
                      const dayReports = reports.filter(r => {
                        if (!r.createdAt) return false;
                        const reportDate = new Date(r.createdAt).toISOString().split('T')[0];
                        return reportDate === date;
                      });
                      return dayReports.length;
                    });

                    const maxCount = Math.max(...dayCounts, 1);

                    return (
                      <View style={styles.lineChart}>
                        {last7Days.map((date, index) => {
                          const count = dayCounts[index];
                          const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                          const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });

                          return (
                            <View key={date} style={styles.linePoint}>
                              <View style={styles.lineBar}>
                                <View style={[styles.lineFill, { height: `${height}%`, backgroundColor: '#667eea' }]} />
                              </View>
                              <Text style={styles.lineLabel}>{dayName}</Text>
                              <Text style={styles.lineValue}>{count}</Text>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })()}
                </View>
              </View>

              {/* System Health Metrics */}
              <View style={styles.analyticsCard}>
                <Text style={styles.analyticsCardTitle}>⚡ System Health</Text>
                <View style={styles.healthMetrics}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricIcon}>📱</Text>
                    <View style={styles.metricInfo}>
                      <Text style={styles.metricValue}>{users.length}</Text>
                      <Text style={styles.metricLabel}>Total Users</Text>
                    </View>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricIcon}>🚨</Text>
                    <View style={styles.metricInfo}>
                      <Text style={styles.metricValue}>{reports.length}</Text>
                      <Text style={styles.metricLabel}>Total Reports</Text>
                    </View>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricIcon}>⏱️</Text>
                    <View style={styles.metricInfo}>
                      <Text style={styles.metricValue}>
                        {reports.length > 0 ? Math.round(reports.filter(r => r.status?.toLowerCase() === 'pending').length / reports.length * 100) : 0}%
                      </Text>
                      <Text style={styles.metricLabel}>Response Rate</Text>
                    </View>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricIcon}>✅</Text>
                    <View style={styles.metricInfo}>
                      <Text style={styles.metricValue}>
                        {reports.length > 0 ? Math.round(reports.filter(r => r.status?.toLowerCase() === 'resolved').length / reports.length * 100) : 0}%
                      </Text>
                      <Text style={styles.metricLabel}>Resolution Rate</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Recent Activity */}
              <View style={styles.analyticsCard}>
                <Text style={styles.analyticsCardTitle}>📝 Recent Activity</Text>
                <ScrollView style={styles.activityList} showsVerticalScrollIndicator={false}>
                  {reports
                    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                    .slice(0, 10)
                    .map((report, index) => (
                      <View key={report.id || index} style={styles.activityItem}>
                        <View style={styles.activityIcon}>
                          <Text style={styles.activityIconText}>
                            {report.status?.toLowerCase() === 'pending' ? '⏳' :
                             report.status?.toLowerCase() === 'in-progress' ? '🚀' :
                             report.status?.toLowerCase() === 'resolved' ? '✅' : '❓'}
                          </Text>
                        </View>
                        <View style={styles.activityContent}>
                          <Text style={styles.activityTitle} numberOfLines={1}>
                            {report.type || 'Unknown'} Report
                          </Text>
                          <Text style={styles.activityTime}>
                            {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : 'Unknown time'}
                          </Text>
                        </View>
                      </View>
                    ))}
                </ScrollView>
              </View>
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
  debugUrl: {
    color: '#7f9cf5',
    fontSize: 10,
    maxWidth: 180,
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
  dropdownBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 999,
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
  viewDetailsBtn: {
    backgroundColor: '#667eea',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  viewDetailsBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  analyticsGrid: {
    gap: 16,
  },
  analyticsCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  analyticsCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  chartContainer: {
    marginTop: 8,
  },
  barChart: {
    gap: 12,
  },
  chartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chartLabel: {
    fontSize: 14,
    color: '#ccc',
    minWidth: 80,
  },
  barContainer: {
    flex: 1,
    height: 20,
    backgroundColor: '#2a2a3e',
    borderRadius: 10,
    justifyContent: 'center',
    position: 'relative',
  },
  bar: {
    height: '100%',
    borderRadius: 10,
    position: 'absolute',
    left: 0,
  },
  barValue: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '700',
    textAlign: 'right',
    paddingRight: 8,
  },
  pieChart: {
    gap: 8,
    marginTop: 8,
  },
  pieItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pieDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  pieLabel: {
    fontSize: 14,
    color: '#ccc',
    flex: 1,
  },
  pieValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
  },
  performanceList: {
    gap: 12,
    marginTop: 8,
  },
  performanceItem: {
    backgroundColor: '#2a2a3e',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  performanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  performanceName: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    flex: 1,
  },
  performanceRate: {
    fontSize: 16,
    color: '#4caf50',
    fontWeight: '800',
  },
  performanceBar: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    marginBottom: 8,
  },
  performanceFill: {
    height: '100%',
    borderRadius: 4,
    position: 'absolute',
    left: 0,
  },
  performanceStats: {
    fontSize: 12,
    color: '#999',
  },
  timeChart: {
    marginTop: 8,
  },
  lineChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: 4,
    paddingTop: 20,
  },
  linePoint: {
    flex: 1,
    alignItems: 'center',
  },
  lineBar: {
    width: 20,
    height: 80,
    backgroundColor: '#2a2a3e',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  lineFill: {
    width: '100%',
    borderRadius: 4,
    minHeight: 4,
  },
  lineLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  lineValue: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
    marginTop: 4,
  },
  healthMetrics: {
    gap: 12,
    marginTop: 8,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a3e',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  metricIcon: {
    fontSize: 24,
    marginRight: 12,
    width: 30,
    textAlign: 'center',
  },
  metricInfo: {
    flex: 1,
  },
  metricValue: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  activityList: {
    maxHeight: 200,
    marginTop: 8,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityIconText: {
    fontSize: 14,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  activityTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  sortDropdownBtn: {
    backgroundColor: '#2a2a3e',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minWidth: 180,
  },
  sortDropdownBtnActive: {
    borderColor: '#667eea',
    backgroundColor: '#667eea20',
  },
  sortDropdownBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  dropdownArrow: {
    color: '#999',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f35',
  },
  dropdownItemActive: {
    backgroundColor: '#667eea20',
  },
  dropdownItemText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownItemTextActive: {
    color: '#667eea',
  },
  dropdownCheck: {
    color: '#667eea',
    fontSize: 16,
    fontWeight: '800',
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#667eea',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#4455aa',
  },
  profileAvatarText: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '800',
  },
  roleSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  roleOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
  },
  roleOptionActive: {
    borderColor: '#667eea',
    backgroundColor: '#667eea20',
  },
  roleOptionText: {
    color: '#bbb',
    fontSize: 14,
    fontWeight: '600',
  },
  roleOptionTextActive: {
    color: '#667eea',
    fontWeight: '800',
  },
  currentInfo: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  currentInfoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  currentInfoText: {
    fontSize: 14,
    color: '#999',
    marginBottom: 6,
  },
  modalSaveBtn: {
    backgroundColor: '#4caf50',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2e7d32',
  },
  modalSaveText: {
    color: '#fff',
    fontWeight: '800',
  },
});``