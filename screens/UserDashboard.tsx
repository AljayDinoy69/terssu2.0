import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput, Alert, Animated, Dimensions, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { getCurrentUser, listReportsByUser, logout, Report } from '../utils/auth';

export type UserDashProps = NativeStackScreenProps<RootStackParamList, 'UserDashboard'>;

const { width } = Dimensions.get('window');

export default function UserDashboard({ navigation }: UserDashProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [menuOpen, setMenuOpen] = useState(false);
  
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
    const pendingReports = reports.filter(r => r.status?.toLowerCase() === 'pending');
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
    const list = await listReportsByUser(user.id);
    setReports([...list].sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0)));
  };

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation]);

  const onLogout = async () => {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  const displayed = reports
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
      if (sort === 'newest') return (b?.createdAt || 0) - (a?.createdAt || 0);
      return (a?.createdAt || 0) - (b?.createdAt || 0);
    });

  const getStatsData = () => {
    const totalReports = reports.length;
    const pendingReports = reports.filter(r => r.status?.toLowerCase() === 'pending').length;
    const inProgressReports = reports.filter(r => r.status?.toLowerCase() === 'in-progress').length;
    const resolvedReports = reports.filter(r => r.status?.toLowerCase() === 'resolved').length;
    
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
      case 'pending': return '⏳';
      case 'in-progress': return '🚀';
      case 'resolved': return '✅';
      default: return '❓';
    }
  };

  const isPending = (status?: string) => status?.toLowerCase() === 'pending';

  const stats = getStatsData();

  const renderReportItem = ({ item, index }: { item: Report; index: number }) => (
    <Animated.View 
      style={[
        styles.card,
        isPending(item.status) && { transform: [{ scale: pulseAnim }] },
        {
          opacity: listAnim,
          transform: [
            {
              translateY: listAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [50, 0],
              }),
            },
            ...(isPending(item.status) ? [{ scale: pulseAnim }] : []),
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
      
      <View style={styles.cardDetails}>
        <Text style={styles.cardMeta}>👨‍⚕️ Responder: {item.responderId}</Text>
        <Text style={styles.cardMeta}>📅 Created: {new Date(item.createdAt).toLocaleString()}</Text>
      </View>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.backgroundPattern} />
      
      {/* Header */}
      <Animated.View style={[styles.header, { transform: [{ scale: headerScale }] }]}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>📊 My Reports</Text>
          <Text style={styles.subtitle}>Emergency Response Dashboard</Text>
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
              onPress={() => { setMenuOpen(false); Alert.alert('Profile', 'Coming soon'); }}
              activeOpacity={0.7}
            >
              <Text style={styles.menuItemText}>👤 Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => { setMenuOpen(false); Alert.alert('Settings', 'Coming soon'); }}
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
          <Text style={styles.sectionTitle}>📈 My Reports Overview</Text>
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: '#667eea20' }]}>
              <Text style={styles.statNumber}>{stats.totalReports}</Text>
              <Text style={styles.statLabel}>📋 Total Reports</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#ff980020' }]}>
              <Text style={styles.statNumber}>{stats.pendingReports}</Text>
              <Text style={styles.statLabel}>⏳ Pending</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#2196f320' }]}>
              <Text style={styles.statNumber}>{stats.inProgressReports}</Text>
              <Text style={styles.statLabel}>🚀 In Progress</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#4caf5020' }]}>
              <Text style={styles.statNumber}>{stats.resolvedReports}</Text>
              <Text style={styles.statLabel}>✅ Resolved</Text>
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
          <TouchableOpacity 
            style={styles.primaryBtn} 
            onPress={() => navigation.navigate('Report')}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>➕ New Report</Text>
          </TouchableOpacity>
          
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
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
              📈 Showing {displayed.length} of {reports.length}
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

        {/* Reports List */}
        <Animated.View
          style={[
            styles.listContainer,
            {
              opacity: listAnim,
              transform: [
                {
                  translateY: listAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [100, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {displayed.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📄</Text>
              <Text style={styles.emptyText}>No reports yet.</Text>
              <Text style={styles.emptySubtext}>Create your first report to get started!</Text>
            </View>
          ) : (
            <FlatList
              data={displayed}
              keyExtractor={(item) => item.id}
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
              renderItem={renderReportItem}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
            />
          )}
        </Animated.View>
      </ScrollView>
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
  toolbar: { 
    paddingHorizontal: 20, 
    paddingVertical: 16,
    marginBottom: 8,
  },
  primaryBtn: { 
    backgroundColor: '#667eea', 
    paddingVertical: 12, 
    paddingHorizontal: 18, 
    borderRadius: 8, 
    alignSelf: 'flex-start', 
    marginBottom: 16,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  primaryBtnText: { 
    color: '#fff', 
    fontWeight: '700', 
    fontSize: 16 
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111629',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#333',
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  searchInput: { 
    flex: 1,
    paddingVertical: 12, 
    fontSize: 16, 
    color: '#fff',
    fontWeight: '500',
  },
  rowBetween: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
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
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
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
});