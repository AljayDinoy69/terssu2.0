import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Image, ScrollView, Animated, Dimensions, Modal, Platform } from 'react-native';
import * as Location from 'expo-location';
import { MapComponent } from '../components/MapComponent';
import { ReportCard } from '../components/ReportCard';

import Constants from 'expo-constants';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { getCurrentUser, listAssignedReports, logout, Report, updateReportStatus, ReportStatus, listUsers, listNotifications, markNotificationRead, deleteNotification, markAllNotificationsRead, Notification as NotificationItem } from '../utils/auth';
import { API_BASE_URL } from '../utils/api';
import { listResponders } from '../utils/auth';
import { playNotificationSound } from '../utils/sound';
import { isSoundEnabled, setSoundEnabled, getNotificationFrequency, NotificationFrequency } from '../utils/settings';
import ProfileModal from './ProfileModal';
import SettingsModal from '../components/SettingsModal';

export type ResponderDashProps = NativeStackScreenProps<RootStackParamList, 'ResponderDashboard'>;

const { width, height } = Dimensions.get('window');

// Notifications are persisted on the server

const nextStatus: Record<ReportStatus, ReportStatus> = {
  'Pending': 'In-progress',
  'In-progress': 'Resolved',
  'Resolved': 'Resolved',
};

export default function ResponderDashboard({ navigation }: ResponderDashProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'active' | 'completed'>('pending');
  const [detailReport, setDetailReport] = useState<Report | null>(null);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(true);
  const mapRef = useRef<any>(null);
  const prevPendingRef = useRef<number>(0);
  const didInitRef = useRef<boolean>(false);
  const sseActiveRef = useRef<boolean>(false);
  const meRef = useRef<any>(null);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const unseenRef = useRef(0);
  const [unseen, setUnseen] = useState(0);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationFreq, setNotificationFreq] = useState<NotificationFrequency>('normal');
  // Map modal state
  const [mapOpen, setMapOpen] = useState(false);
  const [incidentCoord, setIncidentCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [myCoord, setMyCoord] = useState<{ lat: number; lon: number } | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  // Use Google provider on Android and on iOS when not running inside Expo Go
  const isExpoGo = (Constants as any)?.appOwnership === 'expo';
  const useGoogleProvider = Platform.OS === 'android' || (Platform.OS === 'ios' && !isExpoGo);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const headerScale = useRef(new Animated.Value(0.9)).current;
  const statsScale = useRef(new Animated.Value(0.9)).current;
  const listAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const menuAnimation = useRef(new Animated.Value(0)).current;

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
        Animated.timing(listAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Pulse animation for pending reports
    const pendingReports = reports.filter(r => r.status === 'Pending');
    const pendingCount = pendingReports.length;
    if (sseActiveRef.current) {
      prevPendingRef.current = pendingCount;
      didInitRef.current = true;
    } else if (!didInitRef.current) {
      prevPendingRef.current = pendingCount;
      didInitRef.current = true;
    } else if (pendingCount > prevPendingRef.current) {
      if (soundEnabled && notificationFreq !== 'off') {
        playNotificationSound();
      }
      prevPendingRef.current = pendingCount;
    } else {
      prevPendingRef.current = pendingCount;
    }
    if (pendingReports.length > 0) {
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
        meRef.current = me;
        if (typeof (global as any).EventSource !== 'undefined') {
          es = new (global as any).EventSource(`${API_BASE_URL}/events`);
          es.onopen = () => { sseActiveRef.current = true; };
          es.onmessage = async (ev: MessageEvent) => {
            try {
              const evt = JSON.parse((ev as any).data);
              if (!evt || !evt.type) return;
              if (evt.type === 'report:new') {
                const report = evt.report;
                if (report?.responderId && meRef.current?.id && report.responderId === meRef.current.id) {
                  await load();
                  if (report.status === 'Pending' && soundEnabled && notificationFreq !== 'off') {
                    playNotificationSound();
                  }
                  // Refresh notifications from server so dropdown reflects new one
                  await loadNotifications();
                }
              } else if (evt.type === 'report:update') {
                // Keep UI fresh if my assignments updated
                const report = evt.report;
                if (report?.responderId && meRef.current?.id && report.responderId === meRef.current.id) {
                  await load();
                  // Ensure updates also have sound for responder's assigned cases (respect prefs)
                  if (soundEnabled && notificationFreq !== 'off') {
                    playNotificationSound();
                  }
                  await loadNotifications();
                }
              }
            } catch {}
          };
          es.onerror = () => {
            sseActiveRef.current = false;
            try { es.close(); } catch {}
            es = null;
            pollTimer = setInterval(async () => { await load(); await loadNotifications(); }, 10000);
          };
        } else {
          pollTimer = setInterval(async () => { await load(); await loadNotifications(); }, 10000);
        }
      } catch {
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

  useEffect(() => {
    // Menu animation
    Animated.timing(menuAnimation, {
      toValue: menuOpen ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [menuOpen]);

  const load = async () => {
    const user = await getCurrentUser();
    if (!user) return navigation.replace('Login');
    meRef.current = user;
    setCurrentUser(user);
    const list = await listAssignedReports(user.id);

    // Build a map of account id -> name for nice display
    try {
      const [users, responders] = await Promise.all([listUsers(), listResponders()]);
      const map: Record<string, string> = {};
      users.forEach(u => { map[u.id] = u.name; });
      responders.forEach(r => { map[r.id] = r.name; });
      setNameMap(map);
    } catch (e) {
      // ignore mapping errors
      setNameMap({});
    }
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
    setReports([...list].sort((a, b) => Number(b?.createdAt ?? 0) - Number(a?.createdAt ?? 0)));
  };

  // Load notifications from server and update unseen count
  const loadNotifications = async () => {
    try {
      const userId = meRef.current?.id || (await getCurrentUser())?.id;
      if (!userId) return;
      const items = await listNotifications(userId);
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

  const onAdvance = async (id: string, status: ReportStatus) => {
    const ns = nextStatus[status];
    if (status === 'Resolved') return;
    await updateReportStatus(id, ns);
    await load();
  };

  const onLogout = async () => {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  // Open report details from a notification, close dropdown, and remove the clicked notif
  const handleNotifPress = async (n: NotificationItem) => {
    let target: Report | null = null;
    if (n.reportId) {
      target = reports.find(r => String(r.id) === String(n.reportId)) || null;
      if (!target && meRef.current?.id) {
        try {
          const fresh = await listAssignedReports(meRef.current.id);
          // Update local state for consistency
          setReports([...fresh].sort((a, b) => Number(b?.createdAt ?? 0) - Number(a?.createdAt ?? 0)));
          target = fresh.find(r => String(r.id) === String(n.reportId)) || null;
        } catch {}
      }
    }
    // Remove clicked notification and close dropdown
    // Mark as read on server if unread
    try {
      if (!n.read) {
        await markNotificationRead(n.id, true);
        setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
        if (unseenRef.current > 0) {
          unseenRef.current = Math.max(0, unseenRef.current - 1);
          setUnseen(unseenRef.current);
        }
      }
    } catch {}
    setNotifOpen(false);
    if (target) setDetailReport(target);
  };

  const pending = reports.filter(r => r.status === 'Pending');
  const active = reports.filter(r => r.status === 'In-progress');
  const completed = reports.filter(r => r.status === 'Resolved');

  const getStatsData = () => {
    return {
      totalReports: reports.length,
      pendingReports: pending.length,
      activeReports: active.length,
      completedReports: completed.length,
    };
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

  const isPending = (status?: string) => status === 'Pending';

  const stats = getStatsData();

  // Determine list based on selected tab
  const activeList = activeTab === 'pending' ? pending : activeTab === 'active' ? active : completed;

  // Parse "lat, lon" string
  const parseLocation = (text?: string): { lat: number; lon: number } | null => {
    if (!text) return null;
    const parts = text.split(',').map(s => s.trim());
    if (parts.length < 2) return null;
    const lat = Number(parts[0]);
    const lon = Number(parts[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    return null;
  };

  // Haversine distance in km
  const distanceKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const la1 = a.lat * Math.PI / 180;
    const la2 = b.lat * Math.PI / 180;
    const x = Math.sin(dLat/2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon/2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    return R * c;
  };

  const openLocationModal = async (report: Report) => {
    setMapError(null);
    const inc = parseLocation(report.location);
    if (!inc) {
      setMapError('Invalid incident location');
      setIncidentCoord(null);
      setMyCoord(null);
      setMapOpen(true);
      return;
    }
    setIncidentCoord(inc);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setMapError('Location permission not granted');
        setMyCoord(null);
      } else {
        const loc = await Location.getCurrentPositionAsync({});
        setMyCoord({ lat: loc.coords.latitude, lon: loc.coords.longitude });
      }
    } catch (e: any) {
      setMapError(e?.message || 'Unable to get current location');
    }
    setMapOpen(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.backgroundPattern} pointerEvents="none" />
      
      {/* Header */}
      <Animated.View style={[styles.header, { transform: [{ scale: headerScale }] }]}> 
        <View style={styles.headerContent}>
          <Text style={styles.title}>🚑 Responder Dashboard</Text>
          <Text style={styles.subtitle}>Emergency Response Management</Text>
          {/* Debug: show avatar URL used */}
          <Text style={styles.debugUrl} numberOfLines={1}>{String(currentUser?.avatarUrl || currentUser?.photoUrl || '')}</Text>
        </View>
        <View style={styles.headerActions}>
          <View style={{ position: 'relative' }}>
            <TouchableOpacity
              style={styles.bellBtn}
              onPress={() => { setNotifOpen(o => !o); }}
              activeOpacity={0.8}
            >
              <Text style={styles.bellIcon}>🔔</Text>
              {unseen > 0 && (
                <View style={styles.badge}><Text style={styles.badgeText}>{unseen}</Text></View>
              )}
            </TouchableOpacity>
            {notifOpen && (
              <View style={[styles.dropdown, { maxHeight: 360 }]}> 
                {notifs.length === 0 ? (
                  <Text style={styles.emptyText}>No notifications yet</Text>
                ) : (
                  <>
                    <View style={{ paddingHorizontal: 12, paddingBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: '#a0a0a0', fontWeight: '700' }}>Notifications</Text>
                      {unseen > 0 && (
                        <TouchableOpacity onPress={async () => {
                          try {
                            const uid = meRef.current?.id || (await getCurrentUser())?.id;
                            if (!uid) return;
                            await markAllNotificationsRead(uid);
                            setNotifs(prev => prev.map(x => ({ ...x, read: true })));
                            unseenRef.current = 0; setUnseen(0);
                          } catch {}
                        }} activeOpacity={0.8}>
                          <Text style={{ color: '#66d9ef', fontWeight: '800' }}>Mark all as read</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
                    {notifs.map(n => (
                      <TouchableOpacity key={n.id} style={[styles.notifItem, { opacity: n.read ? 0.7 : 1 }]} onPress={() => handleNotifPress(n)} activeOpacity={0.85}>
                        <Text style={[styles.notifDot, { color: n.kind === 'new' ? '#ffd166' : '#66d9ef' }]}>•</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.notifTitle, { fontWeight: n.read ? '600' : '800' }]}>{n.title}</Text>
                          <Text style={styles.notifTime}>{n.createdAt ? new Date(n.createdAt as any).toLocaleTimeString() : ''}</Text>
                        </View>
                        <TouchableOpacity onPress={async () => {
                          try {
                            const next = !n.read; await markNotificationRead(n.id, next);
                            setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: next } : x));
                            const delta = next ? -1 : +1; // if marking read, decrement unseen; if unread, increment
                            unseenRef.current = Math.max(0, unseenRef.current + delta);
                            setUnseen(unseenRef.current);
                          } catch {}
                        }} style={{ paddingHorizontal: 8, paddingVertical: 4 }} activeOpacity={0.7}>
                          <Text style={{ color: '#ffd166', fontWeight: '800' }}>{n.read ? 'Unread' : 'Read'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={async () => {
                          try {
                            await deleteNotification(n.id);
                            setNotifs(prev => prev.filter(x => x.id !== n.id));
                            if (!n.read && unseenRef.current > 0) { unseenRef.current -= 1; setUnseen(unseenRef.current); }
                          } catch {}
                        }} style={{ paddingHorizontal: 8, paddingVertical: 4 }} activeOpacity={0.7}>
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
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: menuAnimation.interpolate({ inputRange: [0,1], outputRange: ['0deg','180deg'] }),
                  },
                ],
              }}
            >
              <Text style={styles.menuBtnText}>☰</Text>
            </Animated.View>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Menu Overlay */}
      {menuOpen && (
        <Animated.View 
          style={[
            styles.menuOverlay,
            {
              opacity: menuAnimation,
            },
          ]} 
          pointerEvents="box-none"
        >
          <TouchableOpacity 
            style={styles.menuBackdrop} 
            activeOpacity={1} 
            onPress={() => setMenuOpen(false)} 
          />
          <Animated.View 
            style={[
              styles.menuContainer,
              {
                opacity: menuAnimation,
                transform: [
                  {
                    scale: menuAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    }),
                  },
                  {
                    translateX: menuAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [50, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => { setMenuOpen(false); setProfileModalVisible(true); }}
              activeOpacity={0.7}
            >
              <Text style={styles.menuItemText}>👤 Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => { setMenuOpen(false); setSettingsOpen(true); }}
              activeOpacity={0.7}
            >
              <Text style={styles.menuItemText}>⚙️ Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => { setMenuOpen(false); Alert.alert('About & Services', 'Coming soon'); }}
              activeOpacity={0.7}
            >
              <Text style={styles.menuItemText}>ℹ️ About & Services</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />
            <TouchableOpacity 
              style={[styles.menuItem, { backgroundColor: '#d90429' }]} 
              onPress={() => { setMenuOpen(false); onLogout(); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.menuItemText, { color: '#fff' }]}>🚪 Logout</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

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
          <Text style={styles.sectionTitle}>📊 Assignment Overview</Text>
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: '#667eea20' }]}>
              <Text style={styles.statNumber}>{stats.totalReports}</Text>
              <Text style={styles.statLabel}>📋 Total Assigned</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#ff980020' }]}>
              <Text style={styles.statNumber}>{stats.pendingReports}</Text>
              <Text style={styles.statLabel}>⏳ Pending</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#2196f320' }]}>
              <Text style={styles.statNumber}>{stats.activeReports}</Text>
              <Text style={styles.statLabel}>🚀 Active</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#4caf5020' }]}>
              <Text style={styles.statNumber}>{stats.completedReports}</Text>
              <Text style={styles.statLabel}>✅ Completed</Text>
            </View>
          </View>
        </Animated.View>

        {/* Segmented Tabs */}
        <Animated.View
          style={[
            styles.tabsRow,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'pending' && styles.tabBtnActive]}
            onPress={() => setActiveTab('pending')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>New Reports ({pending.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'active' && styles.tabBtnActive]}
            onPress={() => setActiveTab('active')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>Active Cases ({active.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'completed' && styles.tabBtnActive]}
            onPress={() => setActiveTab('completed')}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>Completed ({completed.length})</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Active list */}
        <View style={styles.listWrap}>
          {activeList.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>No reports in this tab</Text>
            </View>
          ) : (
            <FlatList
              data={activeList}
              keyExtractor={(item) => item.id}
              renderItem={({ item, index }) => (
                <ReportCard 
                  item={item} 
                  index={index} 
                  nameMap={nameMap}
                  onPress={() => setDetailReport(item)}
                />
              )}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </ScrollView>

      {/* View Details Modal */}
      <Modal
        visible={!!detailReport}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailReport(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Report Details</Text>
            {!!detailReport && (
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.modalRow}><Text style={styles.modalLabel}>Type:</Text><Text style={styles.modalValue}>{detailReport.type}</Text></View>
                <View style={styles.modalRow}><Text style={styles.modalLabel}>Status:</Text><Text style={styles.modalValue}>{detailReport.status}</Text></View>
                <View style={styles.modalRow}><Text style={styles.modalLabel}>Responder:</Text><Text style={styles.modalValue}>{nameMap[detailReport.responderId] || detailReport.responderId}</Text></View>
                {detailReport.chiefComplaint ? (
                  <View style={styles.modalRow}><Text style={styles.modalLabel}>Chief Complaint:</Text><Text style={styles.modalValue}>{detailReport.chiefComplaint}</Text></View>
                ) : null}
                {detailReport.description ? (
                  <View style={styles.modalRow}><Text style={styles.modalLabel}>Description:</Text><Text style={styles.modalValue}>{detailReport.description}</Text></View>
                ) : null}
                {detailReport.location ? (
                  <View style={styles.modalRow}><Text style={styles.modalLabel}>Location:</Text><Text style={styles.modalValue}>{detailReport.location}</Text></View>
                ) : null}
                {detailReport.fullName ? (
                  <View style={styles.modalRow}><Text style={styles.modalLabel}>Full Name:</Text><Text style={styles.modalValue}>{detailReport.fullName}</Text></View>
                ) : null}
                {detailReport.contactNo ? (
                  <View style={styles.modalRow}><Text style={styles.modalLabel}>Contact:</Text><Text style={styles.modalValue}>{detailReport.contactNo}</Text></View>
                ) : null}
                {detailReport.personsInvolved ? (
                  <View style={styles.modalRow}><Text style={styles.modalLabel}>Persons Involved:</Text><Text style={styles.modalValue}>{detailReport.personsInvolved}</Text></View>
                ) : null}
                <View style={styles.modalRow}><Text style={styles.modalLabel}>From:</Text><Text style={styles.modalValue}>{detailReport.fullName || (detailReport.userId ? (nameMap[detailReport.userId] || 'Anonymous') : 'Anonymous')}</Text></View>
                <View style={styles.modalRow}><Text style={styles.modalLabel}>Created:</Text><Text style={styles.modalValue}>{new Date(detailReport.createdAt).toLocaleString()}</Text></View>
                {(detailReport.photoUrl || detailReport.photoUri) ? (
                  <Image source={{ uri: detailReport.photoUrl || detailReport.photoUri }} style={styles.modalImage} resizeMode="cover" />
                ) : null}
              </ScrollView>
            )}

            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.viewBtn} onPress={() => detailReport && openLocationModal(detailReport)}>
                <Text style={styles.viewBtnText}>🗺️ View Location</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDetailReport(null)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
              {!!detailReport && detailReport.status !== 'Resolved' && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={async () => {
                    await onAdvance(detailReport.id, detailReport.status);
                    setDetailReport(null);
                  }}
                >
                  <Text style={styles.deleteBtnText}>
                    {detailReport.status === 'Pending' ? '▶️ Start Progress' : '✅ Mark Resolved'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Location Modal */}
      <Modal
        visible={mapOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMapOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.mapModalContent}>
            <Text style={styles.modalTitle}>Incident & My Location</Text>
            {mapError ? (
              <Text style={styles.mapErrorText}>⚠️ {mapError}</Text>
            ) : null}
            <View style={styles.mapBox}>
              {incidentCoord ? (
                <MapComponent
                  incidentCoord={incidentCoord}
                  myCoord={myCoord}
                  distanceKm={distanceKm}
                />
              ) : (
                <Text style={styles.mapErrorText}>⚠️ Invalid incident location</Text>
              )}
            </View>
            <View style={styles.mapLegend}>
              <Text style={styles.mapLegendText}>📍 Incident: {incidentCoord ? `${incidentCoord.lat.toFixed(5)}, ${incidentCoord.lon.toFixed(5)}` : 'N/A'}</Text>
              <Text style={styles.mapLegendText}>👤 Me: {myCoord ? `${myCoord.lat.toFixed(5)}, ${myCoord.lon.toFixed(5)}` : 'N/A'}</Text>
              {incidentCoord && myCoord ? (
                <Text style={styles.mapLegendText}>📏 Distance: {distanceKm(incidentCoord, myCoord).toFixed(2)} km</Text>
              ) : null}
            </View>
            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setMapOpen(false)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Profile Modal */}
      <ProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        user={currentUser}
        onProfileUpdated={(u) => { setCurrentUser(u); }}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0f0f23' 
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
    zIndex: 100 
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
  menuBtn: { 
    backgroundColor: '#2b2d42', 
    paddingVertical: 8, 
    paddingHorizontal: 12, 
    borderRadius: 8,
  },
  menuBtnText: { 
    color: '#fff', 
    fontSize: 18, 
    fontWeight: '800' 
  },
  menuOverlay: { 
    position: 'absolute', 
    top: 0, 
    bottom: 0, 
    left: 0, 
    right: 0, 
    zIndex: 1000, 
    elevation: 30 
  },
  menuBackdrop: { 
    position: 'absolute', 
    top: 0, 
    bottom: 0, 
    left: 0, 
    right: 0, 
    backgroundColor: 'transparent' 
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
    overflow: 'hidden' 
  },
  menuItem: { 
    paddingVertical: 12, 
    paddingHorizontal: 14, 
    borderBottomWidth: 1, 
    borderBottomColor: '#1f1f35' 
  },
  menuItemText: { 
    color: '#fff', 
    fontWeight: '700' 
  },
  menuDivider: { 
    height: 1, 
    backgroundColor: '#333' 
  },
  scrollContainer: {
    flex: 1,
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
  sectionsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sectionContainer: {
    marginBottom: 24,
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
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: { 
    fontWeight: '700', 
    fontSize: 18,
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
  cardDesc: { 
    marginBottom: 12,
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
  thumbnail: { 
    width: '100%', 
    height: 160, 
    borderRadius: 10, 
    marginBottom: 12, 
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
  },
  reportDetails: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 12,
    marginBottom: 12,
    gap: 4,
  },
  meta: { 
    color: '#999', 
    fontSize: 12,
  },
  cardActions: {
    alignItems: 'flex-end',
  },
  advanceBtn: { 
    backgroundColor: '#667eea', 
    paddingVertical: 8, 
    paddingHorizontal: 16, 
    borderRadius: 8,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  viewBtn: {
    backgroundColor: '#2b2f4a',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b3f5a',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexShrink: 1,
  },
  viewBtnText: {
    color: '#ffd166',
    fontWeight: '700',
    fontSize: 14,
  },
  advanceBtnDisabled: {
    backgroundColor: '#4a5568',
    shadowOpacity: 0,
  },
  advanceBtnText: { 
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  advanceBtnTextDisabled: {
    color: '#a0a0a0',
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
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
  mapModalContent: {
    backgroundColor: '#1a1a2e',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    width: Math.min(width * 0.9, 340),
  },
  mapBox: {
    height: 180,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#0f0f23',
    marginTop: 8,
    marginBottom: 12,
    overflow: 'hidden',
    position: 'relative',
    alignSelf: 'center',
    width: 260,
  },
  marker: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  markerLabel: {
    position: 'absolute',
    fontSize: 10,
    fontWeight: '700',
  },
  mapLegend: {
    gap: 4,
  },
  mapLegendText: {
    color: '#ccc',
    fontSize: 12,
  },
  mapErrorText: {
    color: '#ffd166',
    fontSize: 12,
    marginBottom: 8,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#1f233a',
    borderWidth: 1,
    borderColor: '#2b2f4a',
  },
  tabBtnActive: {
    backgroundColor: '#2b2f4a',
    borderColor: '#ffd166',
    shadowColor: '#ffd166',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  tabText: {
    color: '#cbd5e1',
    fontWeight: '700',
    fontSize: 12,
  },
  tabTextActive: {
    color: '#ffd166',
  },
  listWrap: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  // Modal styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#0f0f23',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    width: '100%',
    maxWidth: 520,
    // Constrain overall modal height to keep actions visible on small screens
    maxHeight: Math.min(height * 0.8, 720),
    padding: 16,
  },
  // Scroll area inside modal adapts to screen height
  modalScroll: {
    maxHeight: Math.min(height * 0.55, 520),
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#111',
  },
  // Modal detail rows (stack label above value)
  modalRow: {
    marginBottom: 10,
  },
  modalLabel: {
    color: '#a0a0a0',
    fontSize: 12,
    marginBottom: 2,
    fontWeight: '700',
  },
  modalValue: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  modalImage: {
    width: '100%',
    // Responsive image height: up to 28% of screen height, capped to keep layout tidy
    height: Math.min(Math.max(height * 0.28, 160), 260),
    borderRadius: 10,
    marginTop: 8,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 12,
  },
  cancelBtn: {
    backgroundColor: '#2b2d42',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexShrink: 1,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  cancelBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  deleteBtn: {
    backgroundColor: '#667eea',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexShrink: 1,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  deleteBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
});