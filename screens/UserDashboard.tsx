import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput, Alert, Animated, Dimensions, ScrollView, Image, Modal } from 'react-native';

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { getCurrentUser, listReportsByUser, logout, Report, listNotifications, markNotificationRead, deleteNotification, markAllNotificationsRead, Notification as NotificationItem, listResponders } from '../utils/auth';
import { API_BASE_URL } from '../utils/api';
import { playNotificationSound } from '../utils/sound';
import { isSoundEnabled, setSoundEnabled, getNotificationFrequency, NotificationFrequency } from '../utils/settings';
import ProfileModal from './ProfileModal';
import SettingsModal from '../components/SettingsModal';

export type UserDashProps = NativeStackScreenProps<RootStackParamList, 'UserDashboard'>;

const { width } = Dimensions.get('window');

export default function UserDashboard({ navigation }: UserDashProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [menuOpen, setMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(true);
  const prevPendingRef = useRef<number>(0);
  const didInitRef = useRef<boolean>(false);
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const unseenRef = useRef(0);
  const [unseen, setUnseen] = useState(0);
  const sseActiveRef = useRef<boolean>(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [notificationFreq, setNotificationFreq] = useState<NotificationFrequency>('normal');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [imageViewerUri, setImageViewerUri] = useState<string | null>(null);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);

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

    // Pulse animation for pending reports + sound trigger when count increases
    const pendingReports = reports.filter(r => r.status?.toLowerCase() === 'pending');
    const pendingCount = pendingReports.length;
    
    // Skip sound on initial load
    if (didInitRef.current) {
      if (pendingCount > prevPendingRef.current) {
        if (soundEnabled && notificationFreq !== 'off') {
          playNotificationSound();
        }
      }
    }
    
    // Update the previous count and mark as initialized
    prevPendingRef.current = pendingCount;
    didInitRef.current = true;
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
        if (!me) return;
        if (typeof (global as any).EventSource !== 'undefined') {
          es = new (global as any).EventSource(`${API_BASE_URL}/events`);
          es.onopen = () => { sseActiveRef.current = true; };
          es.onmessage = async (ev: MessageEvent) => {
            try {
              const evt = JSON.parse((ev as any).data);
              if (!evt || !evt.type) return;
              if (evt.type === 'report:new' || evt.type === 'report:update') {
                await load();
                await loadNotifications();
                if (evt.type === 'report:new') {
                  if (soundEnabled && notificationFreq !== 'off') {
                    playNotificationSound();
                  }
                } else if (evt.type === 'report:update') {
                  // If this update concerns the logged-in user's report, play a sound
                  if (evt.report && String(evt.report.userId || '') === String(me.id)) {
                    if (soundEnabled && notificationFreq !== 'off') {
                      playNotificationSound();
                    }
                  }
                }
              }
            } catch {}
          };
          es.onerror = () => {
            sseActiveRef.current = false;
            try { es.close(); } catch {}
            es = null;
            let prevUnread = unseenRef.current;
            pollTimer = setInterval(async () => {
              await load();
              const unread = await loadNotifications();
              if (typeof unread === 'number') {
                if (unread > prevUnread) {
                  if (soundEnabled && notificationFreq !== 'off') {
                    playNotificationSound();
                  }
                }
                prevUnread = unread;
              }
            }, 10000);
          };
        } else {
          let prevUnread = unseenRef.current;
          pollTimer = setInterval(async () => {
            await load();
            const unread = await loadNotifications();
            if (typeof unread === 'number') {
              if (unread > prevUnread) {
                if (soundEnabled && notificationFreq !== 'off') {
                  playNotificationSound();
                }
              }
              prevUnread = unread;
            }
          }, 10000);
        }
      } catch {
        let prevUnread = unseenRef.current;
        pollTimer = setInterval(async () => {
          await load();
          const unread = await loadNotifications();
          if (typeof unread === 'number') {
            if (unread > prevUnread) {
              if (soundEnabled && notificationFreq !== 'off') {
                playNotificationSound();
              }
            }
            prevUnread = unread;
          }
        }, 10000);
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
    setCurrentUser(user); // Store current user for profile modal
    const list = await listReportsByUser(user.id);
    // build responder name map for nicer display
    try {
      const responders = await listResponders();
      const map: Record<string, string> = {};
      responders.forEach((r: any) => { if (r?.id) map[String(r.id)] = r.name || String(r.id); });
      setNameMap(map);
    } catch {}
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

  const loadNotifications = async (): Promise<number | void> => {
    try {
      const me = await getCurrentUser();
      if (!me) return;
      const items = await listNotifications(me.id);
      const sorted = [...items].sort((a, b) => Number(new Date(b.createdAt || 0)) - Number(new Date(a.createdAt || 0)));
      setNotifs(sorted);
      const unread = sorted.filter(n => !n.read).length;
      unseenRef.current = unread; setUnseen(unread);
      return unread;
    } catch {}
  };

  useEffect(() => {
    const unsub = navigation.addListener('focus', async () => { await load(); await loadNotifications(); });
    return unsub;
  }, [navigation]);

  const onLogout = async () => {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  const handleProfilePress = () => {
    setMenuOpen(false);
    setProfileModalVisible(true);
  };

  const handleProfileUpdated = (updatedUser: any) => {
    setCurrentUser((prevUser: any) => ({
      ...prevUser,
      ...updatedUser,
      name: updatedUser.name || prevUser?.name,
      email: updatedUser.email || prevUser?.email,
      phone: updatedUser.phone || prevUser?.phone || '',
      photoUrl: (updatedUser as any)?.photoUrl || (updatedUser as any)?.avatarUrl || prevUser?.photoUrl || prevUser?.avatarUrl,
      avatarUrl: (updatedUser as any)?.avatarUrl || (updatedUser as any)?.photoUrl || prevUser?.avatarUrl || prevUser?.photoUrl,
      ...(updatedUser as any)?.address && { address: (updatedUser as any).address },
      ...(updatedUser as any)?.emergencyContact && { emergencyContact: (updatedUser as any).emergencyContact }
    }));
  
    // Show success toast or update any UI that depends on user data
    // For example, you might want to show a toast message here
  };

  const handleAccountDeleted = () => {
    setProfileModalVisible(false);
    // Navigation will be handled by the modal
  };

  const handleViewDetails = (report: Report) => {
    setSelectedReport(report);
    setDetailsModalVisible(true);
  };

  // Group multiple responder assignments into a single incident card
  const groupReportsByIncident = (items: Report[]) => {
    const prio = (s?: string) => {
      const v = (s || '').toLowerCase();
      if (v === 'pending') return 3;
      if (v === 'in-progress') return 2;
      if (v === 'resolved') return 1;
      return 0;
    };
    const map = new Map<string, any>();
    for (const r of items) {
      const key = `${r.userId || r.deviceId || 'anon'}|${r.type}|${r.description}|${r.location}|${r.photoUrl || r.photoUri || ''}|${Array.isArray((r as any).photoUrls) ? (r as any).photoUrls.join(',') : ''}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...r, id: key, responders: [r.responderId] });
      } else {
        // merge responders unique
        if (!existing.responders.includes(r.responderId)) existing.responders.push(r.responderId);
        // escalate status if needed
        if (prio(r.status) > prio(existing.status)) existing.status = r.status;
        // keep latest photo if missing
        if (!existing.photoUrls && (r as any).photoUrls) existing.photoUrls = (r as any).photoUrls;
      }
    }
    return Array.from(map.values());
  };

  const displayed = groupReportsByIncident(
    reports
      .filter(r => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
          r.type?.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.status?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sort === 'newest') return Number(b?.createdAt ?? 0) - Number(a?.createdAt ?? 0);
        return Number(a?.createdAt ?? 0) - Number(b?.createdAt ?? 0);
    })
  );

  const getStatsData = () => {
    const groupedReports = groupReportsByIncident(reports);
    const totalReports = groupedReports.length;
    const pendingReports = groupedReports.filter(r => r.status?.toLowerCase() === 'pending').length;
    const inProgressReports = groupedReports.filter(r => r.status?.toLowerCase() === 'in-progress').length;
    const resolvedReports = groupedReports.filter(r => r.status?.toLowerCase() === 'resolved').length;
    
    return { totalReports, pendingReports, inProgressReports, resolvedReports };
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
      case 'pending': return '';
      case 'in-progress': return '';
      case 'resolved': return '';
      default: return '';
    }
  };

  const isPending = (status?: string) => status?.toLowerCase() === 'pending';

  const stats = getStatsData();

  const renderReportItem = ({ item, index }: { item: Report; index: number }) => (
    <Animated.View 
      style={[
        styles.card,
        {
          opacity: listAnim,
          transform: [
            {
              translateY: listAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [50, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.type}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>
            {getStatusIcon(item.status)} {item.status?.toUpperCase() || 'UNKNOWN'}
          </Text>
        </View>
      </View>
      
      {!!item.description && (
        <Text numberOfLines={2} style={styles.cardDesc}>
          📝 {item.description}
        </Text>
      )}

{Array.isArray((item as any).photoUrls) && (item as any).photoUrls.length > 0 ? (
  <View style={styles.collageGrid}>
    {((item as any).photoUrls as string[]).slice(0, 4).map((uri, idx) => (
      <TouchableOpacity
        key={`${uri}-${idx}`}
        activeOpacity={0.9}
        onPress={() => { setImageViewerUri(uri); setImageViewerVisible(true); }}
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
      onPress={() => {
        const uri = (item.photoUrl || item.photoUri) as string;
        setImageViewerUri(uri);
        setImageViewerVisible(true);
      }}
    >
      <Image
        source={{ uri: (item.photoUrl || item.photoUri) as string }}
        style={styles.cardImage}
        resizeMode="cover"
      />
    </TouchableOpacity>
  ) : null
)}
      
      <View style={styles.cardDetails}>
        <Text style={styles.cardMeta} numberOfLines={2}>
          Responders: {(item as any).responders ? (item as any).responders.map((id: string) => nameMap[id] || id).join(', ') : (item as any).responderId}
        </Text>
        <Text style={styles.cardMeta}>Created: {new Date(item.createdAt).toLocaleString()}</Text>
        <TouchableOpacity 
          style={styles.detailsButton}
          onPress={() => handleViewDetails(item)}
          activeOpacity={0.8}
        >
          <Text style={styles.detailsButtonText}>View Details</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.backgroundPattern} />
      
      {/* Header */}
      <Animated.View style={[styles.header, { transform: [{ scale: headerScale }] }]}>
        <View style={styles.headerContentRow}>
          <TouchableOpacity onPress={handleProfilePress} style={styles.avatarWrapper}>
            {currentUser?.avatarUrl || currentUser?.photoUrl ? (
              <Image
                source={{ uri: (currentUser.avatarUrl || currentUser.photoUrl) as string }}
                style={styles.avatar}
                defaultSource={require('../assets/adaptive-icon.png')}
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: '#2d2d42', justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
                  {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.userName} numberOfLines={1}>
            {currentUser?.name || currentUser?.email || 'User'}
          </Text>
          <View style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ position: 'relative' }}>
            <TouchableOpacity style={styles.menuBtn} onPress={() => setNotifOpen(o => !o)} activeOpacity={0.8}>
              <Text style={styles.menuBtnText}>🔔</Text>
              {unseen > 0 && (<View style={styles.badge}><Text style={styles.badgeText}>{unseen}</Text></View>)}
            </TouchableOpacity>
            {notifOpen && (
              <Modal visible={notifOpen} transparent animationType="fade" onRequestClose={() => setNotifOpen(false)}>
                <View style={styles.notificationModalOverlay}>
                  <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setNotifOpen(false)} />
                  <View style={styles.notificationModalContent}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ color: '#a0a0a0', fontWeight: '700', fontSize: 16 }}>Notifications</Text>
                      <TouchableOpacity onPress={() => setNotifOpen(false)}>
                        <Text style={{ color: '#a0a0a0', fontSize: 18 }}>✖</Text>
                      </TouchableOpacity>
                    </View>
                    {notifs.length === 0 ? (
                      <Text style={styles.emptyText}>No notifications yet</Text>
                    ) : (
                      <>
                        {unseen > 0 && (
                          <TouchableOpacity onPress={async () => {
                            try {
                              const me = await getCurrentUser(); if (!me) return;
                              await markAllNotificationsRead(me.id);
                              setNotifs(prev => prev.map(x => ({ ...x, read: true })));
                              unseenRef.current = 0; setUnseen(0);
                            } catch {}
                          }} activeOpacity={0.8} style={{ alignSelf: 'flex-end', marginBottom: 8 }}>
                            <Text style={{ color: '#66d9ef', fontWeight: '800' }}>Mark all as read</Text>
                          </TouchableOpacity>
                        )}
                        <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
                          {notifs.map(n => (
                            <TouchableOpacity key={n.id} style={[styles.notifItem, { opacity: n.read ? 0.7 : 1 }]} onPress={async () => {
                              try {
                                if (!n.read) {
                                  await markNotificationRead(n.id, true);
                                  setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
                                  if (unseenRef.current > 0) { unseenRef.current -= 1; setUnseen(unseenRef.current); }
                                }
                              } catch {}
                              if (n.reportId) {
                                const rep = reports.find(r => String(r.id) === String(n.reportId));
                                if (rep) Alert.alert('Report', `${rep.type} — ${rep.status}`);
                              }
                              setNotifOpen(false);
                            }} activeOpacity={0.85}>
                              <Text style={[styles.notifDot, { color: n.kind === 'new' ? '#ffd166' : '#66d9ef' }]}>•</Text>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.notifTitle, { fontWeight: n.read ? '600' : '800' }]}>{n.title}</Text>
                                <Text style={styles.notifTime}>{n.createdAt ? new Date(n.createdAt as any).toLocaleTimeString() : ''}</Text>
                              </View>
                              <TouchableOpacity onPress={async () => {
                                try {
                                  const next = !n.read; await markNotificationRead(n.id, next);
                                  setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: next } : x));
                                  unseenRef.current = Math.max(0, unseenRef.current + (next ? -1 : 1));
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
                </View>
              </Modal>
            )}
          </View>
          <TouchableOpacity 
            style={styles.menuBtn} 
            onPress={() => setMenuOpen(v => !v)}
            activeOpacity={0.8}
          >
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: menuAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '180deg'],
                    }),
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
              onPress={handleProfilePress}
              activeOpacity={0.7}
            >
              <Text style={styles.menuItemText}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => { setMenuOpen(false); setSettingsOpen(true); }}
              activeOpacity={0.7}
            >
              <Text style={styles.menuItemText}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => { setMenuOpen(false); Alert.alert('About & Services', 'Coming soon'); }}
              activeOpacity={0.7}
            >
              <Text style={styles.menuItemText}>About & Services</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity 
              style={[styles.menuItem, { backgroundColor: '#d90429' }]} 
              onPress={() => { setMenuOpen(false); onLogout(); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.menuItemText, { color: '#fff' }]}>Logout</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      <FlatList
        data={displayed}
        keyExtractor={(item) => item.id}
        renderItem={renderReportItem}
        ListHeaderComponent={(
          <>
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
              <Text style={styles.sectionTitle}>My Reports Overview</Text>
              <View style={styles.statsGrid}>
                <View style={[styles.statCard, { backgroundColor: '#667eea20' }]}>
                  <Text style={styles.statNumber}>{stats.totalReports}</Text>
                  <Text style={styles.statLabel}>Total Reports</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#ff980020' }]}>
                  <Text style={styles.statNumber}>{stats.pendingReports}</Text>
                  <Text style={styles.statLabel}>Pending</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#2196f320' }]}>
                  <Text style={styles.statNumber}>{stats.inProgressReports}</Text>
                  <Text style={styles.statLabel}>In Progress</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#4caf5020' }]}>
                  <Text style={styles.statNumber}>{stats.resolvedReports}</Text>
                  <Text style={styles.statLabel}>Resolved</Text>
                </View>
              </View>
            </Animated.View>

            {/* Toolbar */}
            <Animated.View 
              style={[
                styles.toolbar,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            > 
              <View style={styles.searchContainer}>
                <TextInput
                  placeholder="Search reports (type, description, status)"
                  placeholderTextColor="#888"
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                />
              </View>
              <View style={styles.rowBetween}>
                <Text style={styles.meta}>
                  Showing {displayed.length} of {groupReportsByIncident(reports).length}
                </Text>
                <TouchableOpacity
                  style={styles.sortBtn}
                  onPress={() => setSort(s => (s === 'newest' ? 'oldest' : 'newest'))}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sortBtnText}>
                    {sort === 'newest' ? '🔽' : '🔼'} Sort: {sort === 'newest' ? 'Newest' : 'Oldest'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </>
        )}
        ListEmptyComponent={(
          <View style={[styles.emptyState, { marginHorizontal: 20 }]}>
            <Text style={styles.emptyText}>No reports yet.</Text>
            <Text style={styles.emptySubtext}>Create your first report to get started!</Text>
          </View>
        )}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={async () => { 
              setRefreshing(true); 
              await load(); 
              setRefreshing(false); 
            }}
            colors={['#667eea']}
            tintColor="#667eea"
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
      />

      {/* Sticky Footer */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.primaryBtn} 
          onPress={() => navigation.navigate('Report')}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>Create New Report</Text>
        </TouchableOpacity>
      </View>

      {/* Profile Modal */}
      <ProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        user={currentUser}
        onProfileUpdated={handleProfileUpdated}
        onAccountDeleted={handleAccountDeleted}
        navigation={navigation}
      />
      {/* Settings Modal */}
      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        soundEnabled={soundEnabled}
        onToggleSound={async (next) => { setSoundEnabledState(next); await setSoundEnabled(next); }}
      />

      {/* Full-screen Image Viewer */}
      <Modal
        visible={imageViewerVisible}
        transparent
        animationType="fade"
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
                source={{ uri: imageViewerUri as string }}
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
            <Text style={styles.viewerCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Report Details Modal */}
      <Modal
        visible={detailsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report Details</Text>
              <TouchableOpacity 
                style={styles.modalCloseIconBtn} 
                onPress={() => setDetailsModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCloseIconText}>✖</Text>
              </TouchableOpacity>
            </View>
            
            {selectedReport && (
              <ScrollView 
                style={styles.modalScrollView}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.detailSection}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Type:</Text>
                    <Text style={styles.detailValue}>{selectedReport.type || 'N/A'}</Text>
                  </View>
                  
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status:</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedReport.status) }]}>
                      <Text style={styles.statusText}>
                        {selectedReport.status?.toUpperCase() || 'UNKNOWN'}
                      </Text>
                    </View>
                  </View>
                </View>
                
                {selectedReport.description && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>Description</Text>
                    <Text style={styles.descriptionText}>{selectedReport.description}</Text>
                  </View>
                )}
                
                <View style={styles.detailSection}>
                  <Text style={styles.sectionTitle}>Responders</Text>
                  <Text style={styles.detailValue}>
                    {selectedReport.responderId 
                      ? (nameMap[selectedReport.responderId] || selectedReport.responderId)
                      : 'No responders assigned'}
                  </Text>
                </View>
                
                <View style={styles.detailSection}>
                  <Text style={styles.sectionTitle}>Timeline</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Created:</Text>
                    <Text style={styles.detailValue}>
                      {new Date(selectedReport.createdAt).toLocaleString()}
                    </Text>
                  </View>
                  
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Last Updated:</Text>
                    <Text style={styles.detailValue}>
                      {new Date(selectedReport.createdAt).toLocaleString()}
                    </Text>
                  </View>
                </View>
                
                {(selectedReport.photoUrl || selectedReport.photoUri || (selectedReport as any)?.photoUrls?.length > 0) && (
                  <View style={styles.detailSection}>
                    <Text style={styles.sectionTitle}>Attachments</Text>
                    <ScrollView 
                      horizontal 
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.photosContainer}
                    >
                      {((selectedReport as any)?.photoUrls || [selectedReport.photoUrl || selectedReport.photoUri].filter(Boolean)).map((uri: string, idx: number) => (
                        <TouchableOpacity
                          key={`${uri}-${idx}`}
                          onPress={() => {
                            setImageViewerUri(uri);
                            setImageViewerVisible(true);
                          }}
                          style={styles.thumbnailContainer}
                        >
                          <Image 
                            source={{ uri }} 
                            style={styles.thumbnailImage} 
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0f0f23',
    paddingBottom: 0, 
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a2e',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
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
  headerContentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    maxWidth: width * 0.6,
  },
  avatarWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    marginRight: 8,
    backgroundColor: '#2d2d42',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { 
    fontSize: 24, 
    fontWeight: '900', 
    color: '#fff',
    letterSpacing: 1,
  },
  userName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    flexShrink: 1,
  },
  debugUrl: {
    color: '#7f9cf5',
    fontSize: 10,
    maxWidth: 160,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 4,
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
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#d90429',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
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
  dropdown: {
    position: 'absolute',
    right: 0,
    top: 50,
    width: Math.min(width * 0.9, 320),
    backgroundColor: '#0f0f23',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 6,
    zIndex: 2000,
    elevation: 50,
  },
  notificationModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  notificationModalContent: {
    width: Math.min(width * 0.9, 360),
    maxWidth: 420,
    backgroundColor: '#0f0f23',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 12,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f35',
  },
  notifDot: {
    fontSize: 18,
    marginRight: 6,
  },
  notifTitle: {
    color: '#fff',
    fontSize: 13,
  },
  notifTime: {
    color: '#888',
    fontSize: 10,
    marginTop: 2,
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
  toolbar: { 
    paddingHorizontal: 16, 
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 4,
  },
  primaryBtn: { 
    backgroundColor: '#667eea', 
    paddingVertical: 16, 
    paddingHorizontal: 24, 
    borderRadius: 8, 
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  primaryBtnText: { 
    color: '#fff', 
    fontWeight: '800', 
    fontSize: 16,
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111629',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  searchInput: { 
    flex: 1,
    paddingVertical: 8, 
    fontSize: 14, 
    color: '#fff',
    fontWeight: '500',
    paddingLeft: 8,
  },
  rowBetween: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginTop: 8,
  },
  sortBtn: { 
    backgroundColor: '#2a2a3e', 
    paddingVertical: 6, 
    paddingHorizontal: 10, 
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  sortBtnText: { 
    color: '#fff', 
    fontWeight: '700', 
    fontSize: 12 
  },
  meta: { 
    color: '#999', 
    fontSize: 13,
    fontWeight: '500',
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
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
    borderLeftColor: '#d90429',
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
  cardImage: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    backgroundColor: '#0f0f23',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 12,
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
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
  cardDetails: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 12,
    gap: 4,
  },
  cardMeta: {
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
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#999',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
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
    fontWeight: 'bold',
    fontSize: 18,
  },
  detailsButton: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#1a1a3d',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a5a',
  },
  detailsButtonText: {
    color: '#4a9cff',
    fontWeight: '600',
    fontSize: 14,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    backgroundColor: '#0f0f23',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a5a',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a5a',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  modalCloseIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseIconText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: -1,
  },
  modalScrollView: {
    maxHeight: 500, // Changed from '100%' to a fixed number
    paddingRight: 4,
  },
  detailSection: {
    marginBottom: 24,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailLabel: {
    color: '#aaa',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  detailValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'right',
    flex: 1.5,
  },
  // sectionTitle: {
  //   color: '#4a9cff',
  //   fontSize: 15,
  //   fontWeight: '700',
  //   marginBottom: 12,
  //   textTransform: 'uppercase',
  //   letterSpacing: 0.5,
  // },
  descriptionText: {
    color: '#e0e0e0',
    fontSize: 14,
    lineHeight: 22,
  },
  // statusBadge: {
  //   paddingVertical: 4,
  //   paddingHorizontal: 10,
  //   borderRadius: 10,
  //   minWidth: 80,
  //   alignItems: 'center',
  //   overflow: 'hidden' as const, 
  // },
  // statusText: {
  //   color: '#fff',
  //   fontSize: 11,
  //   fontWeight: '800',
  //   textTransform: 'uppercase',
  //   letterSpacing: 0.5,
  // },
  photosContainer: {
    flexDirection: 'row',
    paddingVertical: 8,
  },
  thumbnailContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
    overflow: 'hidden' as const,
    backgroundColor: '#1a1a3d',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
});