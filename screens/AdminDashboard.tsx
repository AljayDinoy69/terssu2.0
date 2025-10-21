import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert, Animated, Dimensions, ScrollView, Image, Modal, InteractionManager } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { createResponder, deleteAccount, getCurrentUser, listAllReports, listUsers, logout, listNotifications, markNotificationRead, deleteNotification, markAllNotificationsRead, Notification as NotificationItem, listResponders, updateAccount } from '../utils/auth';
import { API_BASE_URL } from '../utils/api';
import { playNotificationSound } from '../utils/sound';
import { isSoundEnabled, setSoundEnabled, getNotificationFrequency, NotificationFrequency } from '../utils/settings';
import { useTheme } from '../components/ThemeProvider';

export type AdminDashProps = NativeStackScreenProps<RootStackParamList, 'AdminDashboard'>;

type DisplayNotification = NotificationItem & {
  __groupKey?: string;
  __canonicalReportId?: string;
  __groupedReport?: any;
};

// Server-backed notifications

const { width } = Dimensions.get('window');

const TAB_ICONS = {
  users: require('../assets/icons/profile-user.png'),
  reports: require('../assets/icons/file.png'),
  analytics: require('../assets/icons/data-analytics.png'),
};

export default function AdminDashboard({ navigation }: AdminDashProps) {
  const { colors } = useTheme();
  const [users, setUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [groupedReports, setGroupedReports] = useState<any[]>([]);
  const [reportGroupIndex, setReportGroupIndex] = useState<Record<string, string>>({});
  const [reportGroupLookup, setReportGroupLookup] = useState<Record<string, any>>({});
  const [nameMapState, setNameMapState] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: 'responder123' });
  const [activeTab, setActiveTab] = useState<'users' | 'reports' | 'analytics'>('users');
  const [userQuery, setUserQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(true);
  const [detailUser, setDetailUser] = useState<any | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(null);
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'responder' | 'admin'>('all');
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [reportSort, setReportSort] = useState<'all' | 'pending' | 'in-progress' | 'resolved'>('all');
  const [reportSortDropdown, setReportSortDropdown] = useState(false);
  const prevPendingRef = useRef<number>(0);
  const didInitRef = useRef<boolean>(false);
  const sseActiveRef = useRef<boolean>(false);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const unseenRef = useRef(0);
  const [unseen, setUnseen] = useState(0);
  const [detailReport, setDetailReport] = useState<any | null>(null);
  const [detailVisible, setDetailVisible] = useState<boolean>(false);
  const [editProfile, setEditProfile] = useState<any | null>(null);
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'user'
  });
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [notificationFreq, setNotificationFreq] = useState<NotificationFrequency>('normal');
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [imageViewerUri, setImageViewerUri] = useState<string | null>(null);
  const [imageViewerList, setImageViewerList] = useState<string[]>([]);
  const [imageViewerIndex, setImageViewerIndex] = useState<number>(0);
  // Track which URIs we have already prefetched to avoid duplicate requests
  const prefetchedRef = useRef<Set<string>>(new Set());

  const prefetchUris = async (uris: string[] | null | undefined) => {
    if (!uris || uris.length === 0) return;
    const unique = uris.filter((u) => !!u && !prefetchedRef.current.has(u));
    if (unique.length === 0) return;
    try {
      await Promise.allSettled(unique.map((u) => Image.prefetch(u)));
      unique.forEach((u) => prefetchedRef.current.add(u));
    } catch {}
  };

  const openUserDetails = (userId: string) => {
    const fresh = users.find(u => u.id === userId);
    if (fresh) {
      setDetailUser(fresh);
    }
  };

  useEffect(() => {
    if (!detailUser) return;
    const fresh = users.find(u => u.id === detailUser.id);
    if (fresh && JSON.stringify(fresh) !== JSON.stringify(detailUser)) {
      setDetailUser(fresh);
    }
  }, [users]);
  
  const openImageViewer = (images: string[] | string, startIndex: number = 0) => {
    if (Array.isArray(images)) {
      if (images.length === 0) return;
      const idx = Math.max(0, Math.min(startIndex, images.length - 1));
      // Prefetch current and adjacent images for faster swiping
      const neighbors: string[] = [images[idx], images[(idx - 1 + images.length) % images.length], images[(idx + 1) % images.length]];
      prefetchUris(neighbors);
      setImageViewerList(images);
      setImageViewerIndex(idx);
      setImageViewerUri(images[idx]);
    } else if (images) {
      prefetchUris([images]);
      setImageViewerList([images]);
      setImageViewerIndex(0);
      setImageViewerUri(images);
    }
    setImageViewerVisible(true);
  };
  
  const showPrevImage = () => {
    if (imageViewerList.length <= 1) return;
    const next = (imageViewerIndex - 1 + imageViewerList.length) % imageViewerList.length;
    setImageViewerIndex(next);
    setImageViewerUri(imageViewerList[next]);
  };

  // Ensure Report Details modal reliably opens, even after rapid taps/animations
  const openReportDetails = (report: any) => {
    // Reset then open to force consistent remount
    setDetailReport(null);
    setDetailVisible(false);
    InteractionManager.runAfterInteractions(() => {
      // Prefetch all report images (collage or single)
      const allUris: string[] = Array.isArray((report as any)?.photoUrls)
        ? ((report as any).photoUrls as string[])
        : (report?.photoUrl ? [report.photoUrl] : []);
      prefetchUris(allUris);
      setDetailReport(report);
      setDetailVisible(true);
    });
  };
  
  const showNextImage = () => {
    if (imageViewerList.length <= 1) return;
    const next = (imageViewerIndex + 1) % imageViewerList.length;
    // Prefetch the next neighbor ahead of time
    prefetchUris([imageViewerList[(next + 1) % imageViewerList.length]]);
    setImageViewerIndex(next);
    setImageViewerUri(imageViewerList[next]);
  };
  const refreshAnim = useRef(new Animated.Value(0)).current;
  // Animation values
  const headerScale = useRef(new Animated.Value(0.95)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;
  const statsScale = useRef(new Animated.Value(0.95)).current;
  const formScale = useRef(new Animated.Value(0.95)).current;
  const listAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

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

  const canonicalReportId = (id?: string | null) => (id ? String(id) : undefined);

  const notificationGroupKey = useCallback((notif: NotificationItem, groupIndex: Record<string, string>) => {
    const canonical = canonicalReportId(notif.reportId);
    if (canonical) {
      const mapped = groupIndex[canonical];
      if (mapped) return mapped;
      const ts = new Date(notif.createdAt || 0).getTime();
      return `${notif.title || ''}|${notif.kind || ''}|${ts ? Math.floor(ts / 1000) : '0'}`;
    }
    if (notif.title || notif.createdAt) {
      const ts = new Date(notif.createdAt || 0).getTime();
      return `${notif.title || ''}|${notif.kind || ''}|${ts ? Math.floor(ts / 1000) : '0'}`;
    }
    return notif.id;
  }, []);

  const dedupeNotifications = useCallback((items: NotificationItem[], groupIndex: Record<string, string>, groupLookup: Record<string, any>): DisplayNotification[] => {
    if (!items || items.length === 0) return [];

    const result: Record<string, DisplayNotification> = {};

    for (const notif of items) {
      const key = notificationGroupKey(notif, groupIndex);
      const groupData = groupLookup[key];
      const canonical = canonicalReportId(notif.reportId);

      if (!result[key]) {
        result[key] = {
          ...notif,
          __groupKey: key,
          __canonicalReportId: canonical,
          __groupedReport: groupData,
        };
      } else {
        result[key].read = result[key].read && notif.read;
        const existingCreated = new Date(result[key].createdAt || 0).getTime();
        const incomingCreated = new Date(notif.createdAt || 0).getTime();
        if (incomingCreated > existingCreated) {
          result[key].createdAt = notif.createdAt;
          result[key].title = notif.title;
          result[key].kind = notif.kind;
        }
      }
    }

    return Object.values(result).sort((a, b) => Number(new Date(b.createdAt || 0)) - Number(new Date(a.createdAt || 0)));
  }, [notificationGroupKey]);

  const [displayNotifs, setDisplayNotifs] = useState<DisplayNotification[]>([]);

  const updateUnseenCount = useCallback((items: DisplayNotification[]) => {
    const unread = items.filter(n => !n.read).length;
    unseenRef.current = unread;
    setUnseen(unread);
  }, []);

  const recomputeNotifications = useCallback((rawNotifs: NotificationItem[], groupIndexOverride?: Record<string, string>, groupLookupOverride?: Record<string, any>) => {
    const index = groupIndexOverride ?? reportGroupIndex;
    const lookup = groupLookupOverride ?? reportGroupLookup;
    const groups = dedupeNotifications(rawNotifs, index, lookup);
    setDisplayNotifs(groups);
    updateUnseenCount(groups);
  }, [dedupeNotifications, reportGroupIndex, reportGroupLookup, updateUnseenCount]);

  const buildReportGrouping = useCallback((grouped: any[]) => {
    const index: Record<string, string> = {};
    const lookup: Record<string, any> = {};
    for (const g of grouped) {
      const key = g.memberReportIds && g.memberReportIds.length > 0
        ? g.memberReportIds.slice().sort().join('|')
        : (g.id ? String(g.id) : undefined);
      if (!key) continue;
      lookup[key] = g;
      if (Array.isArray(g.memberReportIds)) {
        for (const id of g.memberReportIds) {
          index[String(id)] = key;
        }
      }
      if (g.id) {
        index[String(g.id)] = key;
      }
    }
    return { index, lookup };
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
    // Load notification frequency
    try {
      const freq = await getNotificationFrequency();
      setNotificationFreq(freq);
    } catch {}
    const [usersList, responders] = await Promise.all([listUsers(), listResponders()]);
    const meLatest = usersList.find((u: any) => u.id === me.id) || me;
    if (meLatest?.restricted) {
      Alert.alert('Access Restricted', 'Your account has been restricted by an administrator.');
      await logout();
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      return;
    }
    setCurrentUser(meLatest);
    setUsers(usersList);
    // Build a map of id -> name for both users and responders
    const map: Record<string, string> = {};
    try {
      usersList.forEach((u: any) => { if (u?.id) map[String(u.id)] = u.name || String(u.id); });
      responders.forEach((r: any) => { if (r?.id) map[String(r.id)] = r.name || String(r.id); });
    } catch {}
    setNameMapState(map);
    const all = await listAllReports();
    const sortedAll = [...all].sort((a, b) => Number(b?.createdAt ?? 0) - Number(a?.createdAt ?? 0));
    const grouped = groupReports(sortedAll);
    const { index, lookup } = buildReportGrouping(grouped);
    setReports(sortedAll);
    setGroupedReports(grouped);
    setReportGroupIndex(index);
    setReportGroupLookup(lookup);
    recomputeNotifications(notifs, index, lookup);
  };

  const loadNotifications = async () => {
    try {
      const me = await getCurrentUser();
      if (!me) return;
      const items = await listNotifications(me.id);
      const sorted = [...items].sort((a, b) => Number(new Date(b.createdAt || 0)) - Number(new Date(a.createdAt || 0)));
      setNotifs(sorted);
      recomputeNotifications(sorted);
    } catch {}
  };

  useEffect(() => {
    const unsub = navigation.addListener('focus', async () => { await load(); await loadNotifications(); });
    return unsub;
  }, [navigation]);

  useEffect(() => {
    if (notifs.length > 0 || displayNotifs.length > 0) {
      recomputeNotifications(notifs);
    }
  }, [groupedReports]);

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
      if (!me) throw new Error('Unable to load current user');
      setProfileForm({ name: me.name || '', email: me.email || '', phone: me.phone || '', role: me.role || 'admin' });
      setProfileModalVisible(true);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Unable to open profile editor');
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
      case 'pending': return;
      case 'in-progress': return;
      case 'resolved': return;
      default: return;
    }
  };

  // Resolve account name by id for displaying in report details using combined map
  const nameById = (id?: string | null) => {
    if (!id) return undefined;
    return nameMapState[String(id)];
  };

  // Group reports that represent the same incident (e.g., assigned to multiple responders)
  // Heuristic:
  // 1) Primary key: photoUrl if present; else normalized (type + description)
  // 2) Within each key bucket, merge items whose createdAt are within a 10-minute window
  const groupReports = (items: any[]) => {
    const buckets: Record<string, any[]> = {};
    const norm = (s: any) => String(s || '').trim().toLowerCase();
    const keyOf = (r: any) => (r.photoUrl ? `photo:${norm(r.photoUrl)}` : `text:${norm(r.type)}|${norm(r.description)}`);

    // Bucket by primary key
    for (const r of items) {
      const key = keyOf(r);
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(r);
    }

    const WINDOW = 10 * 60 * 1000; // 10 minutes
    const merged: any[] = [];

    for (const key of Object.keys(buckets)) {
      const arr = buckets[key].slice().sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
      for (const r of arr) {
        const t = new Date(r.createdAt || 0).getTime();
        // Try to find an existing group within time window
        let target = merged.find(g => g.__groupKey === key && Math.abs(new Date(g.createdAt || 0).getTime() - t) <= WINDOW);
        if (!target) {
          const memberIds = r?.id ? [String(r.id)] : [];
          target = {
            ...r,
            responders: r.responderId ? [r.responderId] : [],
            memberReportIds: memberIds,
            __groupKey: key,
          };
          merged.push(target);
        } else {
          if (r.responderId) {
            const arrResp: string[] = target.responders || [];
            if (!arrResp.includes(r.responderId)) arrResp.push(r.responderId);
            target.responders = arrResp;
          }
          if (r?.id) {
            const members: string[] = target.memberReportIds || [];
            if (!members.includes(String(r.id))) members.push(String(r.id));
            target.memberReportIds = members;
          }
          // Keep earliest createdAt
          const tPrev = new Date(target.createdAt || 0).getTime();
          if (t < tPrev) target.createdAt = r.createdAt;
          // Keep latest updatedAt
          const uPrev = new Date(target.updatedAt || 0).getTime();
          const uCurr = new Date(r.updatedAt || 0).getTime();
          if (uCurr > uPrev) target.updatedAt = r.updatedAt;
        }
      }
    }

    // Remove helper key
    return merged.map(g => {
      const { __groupKey, ...rest } = g;
      return rest;
    });
  };

  const isPending = (status?: string) => status?.toLowerCase() === 'pending';

  const getRoleIcon = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'admin': return;
      case 'responder': return;
      case 'user': return;
      default: return;
    }
  };

const stats = getStatsData();

const renderUserCard = ({ item }: { item: any; index: number }) => (
  <View style={styles.userCard}>
    <View style={styles.userCardHeader}>
      <Text style={[styles.rolePill, item.role === 'admin' ? styles.rolePillAdmin : item.role === 'responder' ? styles.rolePillResponder : styles.rolePillUser]}>
        {item.role?.charAt(0)?.toUpperCase() + item.role?.slice(1) || 'Unknown'}
      </Text>
    </View>
    <Text style={styles.userCardTitle} numberOfLines={1}>{item.name || 'Unnamed User'}</Text>
    {!!item.email && (
      <View style={styles.userCardRow}>
        <Text style={styles.userCardIcon}>Email:</Text>
        <Text style={styles.userCardMeta} numberOfLines={1}>{item.email}</Text>
      </View>
    )}
    {!!item.phone && (
      <View style={styles.userCardRow}>
        <Text style={styles.userCardIcon}>Contact No:</Text>
        <Text style={styles.userCardMeta} numberOfLines={1}>{item.phone}</Text>
      </View>
    )}
    <View style={styles.userCardFooter}>
      <TouchableOpacity
        style={styles.viewBtn}
        onPress={() => openUserDetails(item.id)}
        activeOpacity={0.85}
      >
        <Text style={styles.viewBtnText}>View Details</Text>
      </TouchableOpacity>
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
        Chief Complaint:  {item.chiefComplaint}
      </Text>
    )}
    {!!item.description && (
      <Text style={styles.reportDescription} numberOfLines={3} ellipsizeMode="tail">
        Description:  {item.description}
      </Text>
    )}
        {Array.isArray((item as any).photoUrls) && (item as any).photoUrls.length > 0 ? (
      <View style={styles.collageGrid}>
        {((item as any).photoUrls as string[]).slice(0, 4).map((uri, idx) => (
          <TouchableOpacity
            key={`${uri}-${idx}`}
            activeOpacity={0.9}
            onPress={() => openImageViewer((item as any).photoUrls as string[], idx)}
            style={styles.collageItem}
          >
            <Image source={{ uri }} style={styles.collageImage} resizeMode="cover" />
            {idx === 3 && (item as any).photoUrls.length > 4 && (
              <View style={styles.collageOverlay}>
                <Text style={styles.collageOverlayText}>+{(item as any).photoUrls.length - 4}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    ) : (
      (item.photoUrl || item.photoUri) ? (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => openImageViewer((item.photoUrl || item.photoUri) as string)}
        >
          <Image source={{ uri: item.photoUrl || item.photoUri }} style={styles.thumbnail} resizeMode="cover" />
        </TouchableOpacity>
      ) : null
    )}

    <View style={styles.reportDetails}>
      {!!item.fullName && (
        <Text style={styles.reportMeta} numberOfLines={1} ellipsizeMode="tail">
          Full Name:  {item.fullName}
        </Text>
      )}
      {!!item.contactNo && (
        <Text style={styles.reportMeta} numberOfLines={1} ellipsizeMode="tail">
          Contact:  {item.contactNo}
        </Text>
      )}
      {!!item.personsInvolved && (
        <Text style={styles.reportMeta} numberOfLines={1} ellipsizeMode="tail">
          Persons Involved:  {item.personsInvolved}
        </Text>
      )}
      <Text style={styles.reportMeta} numberOfLines={1} ellipsizeMode="tail">
        Responder{Array.isArray(item.responders) && item.responders.length > 1 ? 's' : ''}: {
          Array.isArray(item.responders) && item.responders.length > 0
            ? item.responders.map((rid: string) => nameById(rid) || rid).join(', ')
            : (nameById(item.responderId) || 'Unassigned')
        }
      </Text>
      <Text style={styles.reportMeta} numberOfLines={1} ellipsizeMode="tail">
        Reporter:  {item.fullName ? item.fullName : (item.userId ? (nameById(item.userId) || 'Anonymous') : 'Anonymous')}
      </Text>
      <Text style={styles.reportMeta}>
        Created:  {item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}
      </Text>
    </View>

    {/* View Details Button */}
    <TouchableOpacity
      style={styles.viewDetailsBtn}
      onPress={() => openReportDetails(item)}
      activeOpacity={0.85}
    >
      <Text style={styles.viewDetailsBtnText}>View Full Details</Text>
    </TouchableOpacity>
  </View>
);

return (
  <View style={[styles.container, { backgroundColor: colors.background }]}>
    <View style={styles.backgroundPattern} />
    {/* Header */}
    <Animated.View style={[styles.header, { transform: [{ scale: headerScale }] }]}> 
      <View style={styles.headerContent}>
        <Text style={[styles.title, { color: colors.text }]}>Admin Dashboard</Text>
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
            <Modal visible={notifOpen} transparent animationType="fade" onRequestClose={() => setNotifOpen(false)}>
              <View style={styles.modalOverlay}>
                <TouchableOpacity style={StyleSheet.absoluteFill as any} activeOpacity={1} onPress={() => setNotifOpen(false)} />
                <View style={styles.modalContent}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ color: colors.text + '99', fontWeight: '700', fontSize: 16 }}>Notifications</Text>
                    <TouchableOpacity onPress={() => setNotifOpen(false)}>
                      <Text style={{ color: colors.text + '99', fontSize: 18 }}>✖</Text>
                    </TouchableOpacity>
                  </View>
                  {displayNotifs.length === 0 ? (
                    <Text style={[styles.emptyText, { color: colors.text + '99' }]}>No notifications yet</Text>
                  ) : (
                    <>
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
                          style={{ alignSelf: 'flex-end', marginBottom: 8 }}
                        >
                          <Text style={{ color: '#66d9ef', fontWeight: '800' }}>Mark all as read</Text>
                        </TouchableOpacity>
                      )}
                      <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        {displayNotifs.map((n) => (
                          <TouchableOpacity
                            key={n.__groupKey || n.id}
                            style={[styles.notifItem, { opacity: n.read ? 0.7 : 1 }]}
                            onPress={async () => {
                              if (n.reportId) {
                                const targetId = n.__canonicalReportId || n.reportId;
                                const rep = groupedReports.find(r => {
                                  if (r?.memberReportIds && Array.isArray(r.memberReportIds)) {
                                    return r.memberReportIds.includes(String(targetId));
                                  }
                                  return String(r.id) === String(targetId);
                                });
                                if (rep) openReportDetails(rep);
                                else {
                                  const all = await listAllReports();
                                  const sortedAll = [...all].sort((a, b) => Number(b?.createdAt ?? 0) - Number(a?.createdAt ?? 0));
                                  const grouped = groupReports(sortedAll);
                                  const { index: idx, lookup: lk } = buildReportGrouping(grouped);
                                  setReports(sortedAll);
                                  setGroupedReports(grouped);
                                  setReportGroupIndex(idx);
                                  setReportGroupLookup(lk);
                                  recomputeNotifications(notifs, idx, lk);
                                  const found = grouped.find(r => {
                                    if (r?.memberReportIds && Array.isArray(r.memberReportIds)) {
                                      return r.memberReportIds.includes(String(targetId));
                                    }
                                    return String(r.id) === String(targetId);
                                  }) || null;
                                  if (found) openReportDetails(found);
                                }
                              }
                              try {
                                if (!n.read) {
                                  await markNotificationRead(n.id, true);
                                  setNotifs(prev => {
                                    const next = prev.map(x => {
                                      const sameGroup = n.__groupKey && notificationGroupKey(x, reportGroupIndex) === n.__groupKey;
                                      if (sameGroup || x.id === n.id) {
                                        return { ...x, read: true };
                                      }
                                      return x;
                                    });
                                    recomputeNotifications(next);
                                    return next;
                                  });
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
                                  const nextRead = !n.read;
                                  await markNotificationRead(n.id, nextRead);
                                  setNotifs(prev => {
                                    const next = prev.map(x => {
                                      const sameGroup = n.__groupKey && notificationGroupKey(x, reportGroupIndex) === n.__groupKey;
                                      if (sameGroup || x.id === n.id) {
                                        return { ...x, read: nextRead };
                                      }
                                      return x;
                                    });
                                    recomputeNotifications(next);
                                    return next;
                                  });
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
                                  setNotifs(prev => {
                                    const next = prev.filter(x => {
                                      if (n.__groupKey) {
                                        return notificationGroupKey(x, reportGroupIndex) !== n.__groupKey;
                                      }
                                      if (n.reportId) return x.reportId !== n.reportId;
                                      return x.id !== n.id;
                                    });
                                    recomputeNotifications(next);
                                    return next;
                                  });
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
              </View>
            </Modal>
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
            <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuOpen(false); Alert.alert('About & Services', 'Coming soon'); }}>
              <Text style={styles.menuItemText}>About & Services</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={[styles.menuItem, { backgroundColor: '#d90429' }]} onPress={() => { setMenuOpen(false); onLogout(); }}>
              <Text style={[styles.menuItemText, { color: '#fff' }]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* User Details Modal */}
      <Modal visible={!!detailUser} transparent animationType="fade" onRequestClose={() => setDetailUser(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalCloseIconBtn} onPress={() => setDetailUser(null)}>
              <Text style={styles.modalCloseIconText}>✖</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>User Details</Text>
            {detailUser && (
              <View>
                <Text style={styles.modalRow}>ID: {detailUser.id}</Text>
                <Text style={styles.modalRow}>Name: {detailUser.name}</Text>
                <Text style={styles.modalRow}>Email: {detailUser.email}</Text>
                <Text style={styles.modalRow}>Phone: {detailUser.phone}</Text>
                <Text style={styles.modalRow}>Role: {detailUser.role}</Text>
                <View style={styles.restrictRow}>
                  <View>
                    <Text style={styles.restrictTitle}>Restrict Access</Text>
                    <Text style={styles.restrictSubtitle}>Prevent user from logging into the system.</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.restrictToggle, detailUser?.restricted ? styles.restrictToggleActive : null]}
                    onPress={async () => {
                      if (!detailUser) return;
                      try {
                        const toggledRestricted = !Boolean(detailUser.restricted);
                        const updated = await updateAccount(detailUser.id, { restricted: toggledRestricted });
                        const merged = {
                          ...detailUser,
                          ...updated,
                          restricted: typeof updated?.restricted === 'boolean' ? updated.restricted : toggledRestricted,
                        };
                        setDetailUser(merged);
                        setUsers(prev => prev.map(u => (u.id === merged.id ? merged : u)));
                        if (merged.id === currentUser?.id) {
                          if (merged.restricted) {
                            Alert.alert('Access Restricted', 'Your account has been restricted. You will be logged out.');
                            await logout();
                            navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
                            return;
                          }
                          setCurrentUser(merged);
                        }
                      } catch (err: any) {
                        Alert.alert('Update failed', err?.message || 'Unable to update restriction');
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.restrictThumb, detailUser?.restricted ? styles.restrictThumbActive : null]} />
                  </TouchableOpacity>
                </View>
                {detailUser?.restricted && (
                  <Text style={styles.restrictNotice}>This user is currently restricted from logging in.</Text>
                )}
              </View>
            )}
            <View style={styles.modalActionRow}>
              {detailUser?.role !== 'admin' && (
                <TouchableOpacity
                  style={styles.modalDeleteBtn}
                  onPress={() => {
                    if (!detailUser) return;
                    setDetailUser(null);
                    setConfirmTarget({ id: detailUser.id, name: detailUser.name });
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalDeleteText}>Delete User</Text>
                </TouchableOpacity>
              )}
            </View>
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

      {/* Full-screen Image Viewer (always mounted) */}
      <Modal
        visible={imageViewerVisible}
        transparent
        animationType="fade"
        statusBarTranslucent={true}
        hardwareAccelerated={true}
        onRequestClose={() => setImageViewerVisible(false)}
      >
        <View style={styles.viewerOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill as any}
            activeOpacity={1}
            onPress={() => setImageViewerVisible(false)}
          />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            {!!imageViewerUri && (
              <Image
                source={{ uri: imageViewerUri }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            )}
          </View>
          <TouchableOpacity
            onPress={() => setImageViewerVisible(false)}
            style={styles.viewerCloseBtn}
            activeOpacity={0.8}
          >
            <Text style={styles.viewerCloseText}></Text>
          </TouchableOpacity>

          {imageViewerList.length > 1 && (
            <>
              <TouchableOpacity
                onPress={showPrevImage}
                style={styles.viewerNavLeft}
                activeOpacity={0.7}
              >
                <Text style={styles.viewerNavText}>‹</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={showNextImage}
                style={styles.viewerNavRight}
                activeOpacity={0.7}
              >
                <Text style={styles.viewerNavText}></Text>
              </TouchableOpacity>

              <View style={styles.viewerCounter}>
                <Text style={styles.viewerCounterText}>
                  {imageViewerIndex + 1}/{imageViewerList.length}
                </Text>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* Report Details Modal */}
      <Modal
        visible={detailVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setDetailVisible(false); setDetailReport(null); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Report Details</Text>
            {!!detailReport && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {detailReport.id ? (<Text style={styles.modalRow}>ID: {detailReport.id}</Text>) : null}
                {detailReport.type ? (<Text style={styles.modalRow}>Type: {detailReport.type}</Text>) : null}
                {detailReport.status ? (<Text style={styles.modalRow}>Status: {detailReport.status}</Text>) : null}
                {detailReport.chiefComplaint ? (<Text style={styles.modalRow}>Chief Complaint: {detailReport.chiefComplaint}</Text>) : null}
                {detailReport.description ? (<Text style={styles.modalRow}>Description: {detailReport.description}</Text>) : null}
                {detailReport.fullName ? (<Text style={styles.modalRow}>Full Name: {detailReport.fullName}</Text>) : null}
                {detailReport.contactNo ? (<Text style={styles.modalRow}>Contact: {detailReport.contactNo}</Text>) : null}
                {detailReport.personsInvolved ? (<Text style={styles.modalRow}>Persons Involved: {detailReport.personsInvolved}</Text>) : null}
                {(detailReport.responders || detailReport.responderId) ? (
                  <Text style={styles.modalRow}>
                    Responder{Array.isArray(detailReport.responders) && detailReport.responders.length > 1 ? 's' : ''}: {
                      Array.isArray(detailReport.responders) && detailReport.responders.length > 0
                        ? detailReport.responders.map((rid: string) => nameById(rid) || rid).join(', ')
                        : (nameById(detailReport.responderId) || 'Unassigned')
                    }
                  </Text>
                ) : null}
                <Text style={styles.modalRow}>
                  Reporter: {detailReport.fullName ? detailReport.fullName : (detailReport.userId ? (nameById(detailReport.userId) || 'Anonymous') : 'Anonymous')}
                </Text>
                {detailReport.createdAt ? (
                  <Text style={styles.modalRow}>Created: {new Date(detailReport.createdAt).toLocaleString()}</Text>
                ) : null}
                {detailReport.updatedAt ? (
                  <Text style={styles.modalRow}>Updated: {new Date(detailReport.updatedAt).toLocaleString()}</Text>
                ) : null}

                {Array.isArray((detailReport as any).photoUrls) && (detailReport as any).photoUrls.length > 0 ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.modalRow}>Photos:</Text>
                    <View style={styles.collageGrid}>
                      {((detailReport as any).photoUrls as string[]).slice(0, 4).map((uri, idx) => (
                        <TouchableOpacity
                          key={`${uri}-${idx}`}
                          activeOpacity={0.9}
                          onPress={() => openImageViewer((detailReport as any).photoUrls as string[], idx)}
                          style={styles.collageItem}
                        >
                          <Image source={{ uri }} style={styles.collageImage} resizeMode="cover" />
                          {idx === 3 && (detailReport as any).photoUrls.length > 4 && (
                            <View style={styles.collageOverlay}>
                              <Text style={styles.collageOverlayText}>+{(detailReport as any).photoUrls.length - 4}</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : (
                  detailReport.photoUrl ? (
                    <View style={{ marginTop: 12 }}>
                      <Text style={styles.modalRow}>Photo:</Text>
                      <TouchableOpacity activeOpacity={0.9} onPress={() => openImageViewer(detailReport.photoUrl as string)}>
                        <Image source={{ uri: detailReport.photoUrl }} style={styles.thumbnail} resizeMode="cover" />
                      </TouchableOpacity>
                    </View>
                  ) : null
                )}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => { setDetailVisible(false); setDetailReport(null); }}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ScrollView 
        style={styles.scrollContainer} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 90, paddingTop: 20 }} 
      >

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
                <Text style={styles.addBtnText}>Add User</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              placeholder="Search by name or email"
              placeholderTextColor="#888"
              style={styles.searchInput}
              value={userQuery}
              onChangeText={setUserQuery}
            />
            <View style={[styles.filterRow, { zIndex: roleDropdownOpen ? 2000 : 1 }]}>
              <View style={{ position: 'relative', flex: 1 }}>
                <TouchableOpacity
                  style={[styles.sortDropdownBtn, styles.sortDropdownBtnCentered, roleDropdownOpen && styles.sortDropdownBtnActive]}
                  onPress={() => setRoleDropdownOpen(prev => !prev)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.sortDropdownBtnText, styles.filterPrefix]}>Filter:</Text>
                  <Text style={[styles.sortDropdownBtnText, styles.sortDropdownBtnTextCentered]}>
                    {(() => {
                      switch (roleFilter) {
                        case 'all':
                          return 'All Users';
                        case 'user':
                          return 'Regular Users';
                        case 'responder':
                          return 'Responders';
                        case 'admin':
                          return 'Admin';
                        default:
                          return 'All Users';
                      }
                    })()}
                  </Text>
                  <Text style={[styles.dropdownArrow, styles.dropdownArrowOverlay]}>▼</Text>
                </TouchableOpacity>

                {roleDropdownOpen && (
                  <>
                    <TouchableOpacity
                      style={styles.dropdownBackdrop}
                      activeOpacity={1}
                      onPress={() => setRoleDropdownOpen(false)}
                    />
                    <View style={[styles.dropdown, styles.dropdownFullWidth]}>
                      {[{ key: 'all', label: 'All Users' }, { key: 'user', label: 'Regular Users' }, { key: 'responder', label: 'Responders' }, { key: 'admin', label: 'Admin' }].map(option => (
                        <TouchableOpacity
                          key={option.key}
                          style={[styles.dropdownItem, roleFilter === option.key && styles.dropdownItemActive]}
                          onPress={() => {
                            setRoleFilter(option.key as typeof roleFilter);
                            setRoleDropdownOpen(false);
                          }}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.dropdownItemText, roleFilter === option.key && styles.dropdownItemTextActive]}>
                            {option.label}
                          </Text>
                          {roleFilter === option.key && <Text style={styles.dropdownCheck}>✓</Text>}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </View>
            </View>
            {(() => {
              const q = userQuery.trim().toLowerCase();
              const filtered = users.filter(u => {
                const matchesRole = roleFilter === 'all' ? true : (roleFilter === 'user' ? u.role === 'user' : u.role === roleFilter);
                const matchesQuery = !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
                return matchesRole && matchesQuery;
              });
              const sorted = [...filtered].sort((a, b) => {
                const safe = (v: any) => (typeof v === 'string' ? v.toLowerCase() : v || '');
                return safe(a.name).localeCompare(safe(b.name));
              });
              return filtered.length === 0 ? (
                <View style={styles.emptyState}>
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
            <Text style={styles.sectionTitle}>Emergency Reports ({reports.length})</Text>
            <Text style={styles.sectionSubtitle}>Filter and sort reports by status to manage emergency response efficiently.</Text>
            
            {/* Report Status Filter */}
            <View style={[styles.filterRow, { zIndex: reportSortDropdown ? 2000 : 1 }]}>
              <View style={{ position: 'relative', flex: 1 }}>
                <TouchableOpacity
                  style={[styles.sortDropdownBtn, styles.sortDropdownBtnCentered, reportSortDropdown && styles.sortDropdownBtnActive]}
                  onPress={() => setReportSortDropdown(!reportSortDropdown)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.sortDropdownBtnText, styles.filterPrefix]}>Filter:</Text>
                  <Text style={[styles.sortDropdownBtnText, styles.sortDropdownBtnTextCentered]}>
                    {(() => {
                      switch (reportSort) {
                        case 'all':
                          return 'All Reports';
                        case 'pending':
                          return 'Pending';
                        case 'in-progress':
                          return 'In Progress';
                        case 'resolved':
                          return 'Resolved';
                        default:
                          return 'All Reports';
                      }
                    })()}
                  </Text>
                  <Text style={[styles.dropdownArrow, styles.dropdownArrowOverlay]}>▼</Text>
                </TouchableOpacity>

                {reportSortDropdown && (
                  <>
                    <TouchableOpacity 
                      style={styles.dropdownBackdrop} 
                      activeOpacity={1} 
                      onPress={() => setReportSortDropdown(false)}
                    />
                    <View style={[styles.dropdown, styles.dropdownFullWidth]}>
                      {[
                        { key: 'all', label: 'All Reports' },
                        { key: 'pending', label: 'Pending' },
                        { key: 'in-progress', label: 'In Progress' },
                        { key: 'resolved', label: 'Resolved' },
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
                // Group duplicate incidents so one card shows multiple responders
                const groupedReports = groupReports(sortedReports);

                return (
                  <FlatList
                    data={groupedReports}
                    keyExtractor={(item) => item.id}
                    renderItem={renderReportCard}
                    scrollEnabled={false}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                      <View style={styles.emptyState}>
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
            <Text style={styles.sectionTitle}>System Analytics</Text>
            <Text style={styles.sectionSubtitle}>Comprehensive system performance and usage insights</Text>

            {/* System Overview */}
            <View style={[styles.statsContainer, { marginBottom: 20 }]}>
              <View style={styles.statsGrid}>
                <View style={[styles.statCard, { backgroundColor: '#667eea20' }]}>
                  <Text style={styles.statNumber}>{stats.totalUsers}</Text>
                  <Text style={styles.statLabel}>Users</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#00ff8820' }]}>
                  <Text style={styles.statNumber}>{stats.totalResponders}</Text>
                  <Text style={styles.statLabel}>Responders</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#ff980020' }]}>
                  <Text style={styles.statNumber}>{stats.pendingReports}</Text>
                  <Text style={styles.statLabel}>Pending</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#4caf5020' }]}>
                  <Text style={styles.statNumber}>{stats.resolvedReports}</Text>
                  <Text style={styles.statLabel}>Resolved</Text>
                </View>
              </View>
            </View>

            {/* Analytics Grid */}
            <View style={styles.analyticsGrid}>
              {/* Report Status Distribution */}
              <View style={styles.analyticsCard}>
                <Text style={styles.analyticsCardTitle}>Report Status Distribution</Text>
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
                <Text style={styles.analyticsCardTitle}>Report Types</Text>
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
                <Text style={styles.analyticsCardTitle}>Responder Performance</Text>
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
                <Text style={styles.analyticsCardTitle}>Reports Over Time</Text>
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
                <Text style={styles.analyticsCardTitle}>System Health</Text>
                <View style={styles.healthMetrics}>
                  <View style={styles.metricItem}>
                    <View style={styles.metricInfo}>
                      <Text style={styles.metricValue}>{users.length}</Text>
                      <Text style={styles.metricLabel}>Total Users</Text>
                    </View>
                  </View>
                  <View style={styles.metricItem}>
                    <View style={styles.metricInfo}>
                      <Text style={styles.metricValue}>{reports.length}</Text>
                      <Text style={styles.metricLabel}>Total Reports</Text>
                    </View>
                  </View>
                  <View style={styles.metricItem}>
                    <View style={styles.metricInfo}>
                      <Text style={styles.metricValue}>
                        {reports.length > 0 ? Math.round(reports.filter(r => r.status?.toLowerCase() === 'pending').length / reports.length * 100) : 0}%
                      </Text>
                      <Text style={styles.metricLabel}>Response Rate</Text>
                    </View>
                  </View>
                  <View style={styles.metricItem}>
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
                <Text style={styles.analyticsCardTitle}>Recent Activity</Text>
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
      
      {/* Sticky Footer */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.footerButton, activeTab === 'users' && styles.activeFooterButton]}
          onPress={() => setActiveTab('users')}
          activeOpacity={0.7}
        >
          <Image
            source={TAB_ICONS.users}
            style={[styles.footerIconImage, activeTab === 'users' && styles.activeFooterIconImage]}
          />
          <Text style={[styles.footerText, activeTab === 'users' && styles.activeFooterText]}>Users</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.footerButton, activeTab === 'reports' && styles.activeFooterButton]}
          onPress={() => setActiveTab('reports')}
          activeOpacity={0.7}
        >
          <Image
            source={TAB_ICONS.reports}
            style={[styles.footerIconImage, activeTab === 'reports' && styles.activeFooterIconImage]}
          />
          <Text style={[styles.footerText, activeTab === 'reports' && styles.activeFooterText]}>Reports</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.footerButton, activeTab === 'analytics' && styles.activeFooterButton]}
          onPress={() => setActiveTab('analytics')}
          activeOpacity={0.7}
        >
          <Image
            source={TAB_ICONS.analytics}
            style={[styles.footerIconImage, activeTab === 'analytics' && styles.activeFooterIconImage]}
          />
          <Text style={[styles.footerText, activeTab === 'analytics' && styles.activeFooterText]}>Analytics</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  scrollContainer: {
    flex: 1,
    paddingBottom: 70, // Add padding to prevent content from being hidden behind the footer
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
  // Sticky Footer Styles
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingVertical: 12,
    paddingBottom: 24, // Extra padding for iPhone X+ bottom safe area
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  footerButton: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 2,
  },
  activeFooterButton: {
    backgroundColor: 'rgba(102, 126, 234, 0.2)',
  },
  footerIconImage: {
    width: 24,
    height: 24,
    marginBottom: 4,
    tintColor: '#888',
    resizeMode: 'contain',
  },
  activeFooterIconImage: {
    tintColor: '#667eea',
  },
  footerText: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  activeFooterText: {
    color: '#667eea',
    fontWeight: '700',
  },
  dropdown: {
    position: 'absolute',
    right: 0,
    top: 44,
    zIndex: 10000,
    elevation: 100,
    backgroundColor: '#0f0f23',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    width: 180,
    maxHeight: 260,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  dropdownFullWidth: {
    left: 0,
    right: 0,
    width: '100%',
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
  tabsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 8,
    marginTop: 8,
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
    gap: 1,
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
    position: 'relative',
    zIndex: 1,
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
  userCard: {
    backgroundColor: '#111624',
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2940',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  userCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rolePill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    backgroundColor: '#2b2d42',
    overflow: 'hidden',
  },
  rolePillAdmin: {
    backgroundColor: '#d90429',
  },
  rolePillResponder: {
    backgroundColor: '#ef476f',
  },
  rolePillUser: {
    backgroundColor: '#118ab2',
  },
  userCardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
  },
  userCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  userCardIcon: {
    fontSize: 14,
    color: '#9fa7b8',
  },
  userCardMeta: {
    color: '#d8d9dc',
    fontSize: 14,
    flex: 1,
  },
  userCardFooter: {
    marginTop: 16,
    alignItems: 'flex-end',
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
  viewBtn: {
    backgroundColor: '#2b2d42',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-end',
  },
  viewBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
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
    fontWeight: '700',
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
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 32,
  },
  modalCloseIconBtn: {
    position: 'absolute',
    top: 15,
    right: 12,
    zIndex: 2,
    padding: 6,
  },
  modalCloseIconText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
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
    fontWeight: '700',
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
  restrictRow: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#151b2f',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#222a42',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  restrictTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  restrictSubtitle: {
    color: '#9aa1b5',
    fontSize: 12,
    marginTop: 2,
    width: 200,
  },
  restrictToggle: {
    width: 52,
    height: 30,
    borderRadius: 16,
    backgroundColor: '#2b2d42',
    padding: 4,
    justifyContent: 'center',
  },
  restrictToggleActive: {
    backgroundColor: '#d90429',
  },
  restrictThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    transform: [{ translateX: 0 }],
  },
  restrictThumbActive: {
    transform: [{ translateX: 20 }],
  },
  restrictNotice: {
    color: '#ef476f',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
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
    position: 'relative',
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
  sortDropdownBtnTextCentered: {
    textAlign: 'left',
    width: '100%',
  },
  filterPrefix: {
    color: '#bbb',
    fontSize: 14,
    fontWeight: '600',
    width: 70,
    textAlign: 'left',
  },
  sortDropdownBtnCentered: {
    width: '100%',
    justifyContent: 'center',
    paddingRight: 32,
  },
  dropdownArrow: {
    color: '#999',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
  },
  dropdownArrowOverlay: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -6 }],
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
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)'
  },
  viewerImage: {
    width: width,
    height: '80%',
  },
  viewerCloseBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCloseText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  collageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  collageItem: {
    width: '48%', // This ensures 2 items per row with some spacing
    aspectRatio: 1, // Makes it square for consistent sizing
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
  },
  collageImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover', // Important: ensures image fills the container properly
  },
  collageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collageOverlayText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 20,
  },
  viewerNavLeft: {
    position: 'absolute',
    left: 12,
    top: '50%',
    marginTop: -22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerNavRight: {
    position: 'absolute',
    right: 12,
    top: '50%',
    marginTop: -22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerNavText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 28,
  },
  viewerCounter: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  viewerCounterText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },

});



