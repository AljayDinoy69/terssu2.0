import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Animated, ScrollView, ImageBackground, Modal, FlatList } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentUser, listNotifications, markNotificationRead } from '../utils/auth';
import { playNotificationSound } from '../utils/sound';
import { API_BASE_URL } from '../utils/api';
import { useTheme } from '../components/ThemeProvider';

export type HomeProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: HomeProps) {
  const { colors } = useTheme();
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoRotate = useRef(new Animated.Value(0)).current;
  const buttonScale1 = useRef(new Animated.Value(0.9)).current;
  const buttonScale2 = useRef(new Animated.Value(0.9)).current;
  const buttonScale3 = useRef(new Animated.Value(0.9)).current;

  // Notification state
  const [isNotificationModalVisible, setIsNotificationModalVisible] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [expandedNotificationId, setExpandedNotificationId] = useState<string | null>(null);

  // Track previous notification count for sound notification
  const prevNotificationCountRef = useRef<number>(0);

  // SSE subscription (with polling fallback) - for real-time notifications
  const [sseActive, setSseActive] = useState<boolean>(false);
  const userRef = useRef<any>(null);
  const deviceIdRef = useRef<string | null>(null);

  const ensureAnonymousDeviceId = useCallback(async () => {
    let current = deviceIdRef.current;
    if (!current) {
      current = await AsyncStorage.getItem('ERS_DEVICE_ID');
    }
    if (!current) {
      current = `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      await AsyncStorage.setItem('ERS_DEVICE_ID', current);
      console.log('Generated new anonymous device ID:', current);
    }
    deviceIdRef.current = current;
    return current;
  }, []);

  useEffect(() => {
    let es: any = null;
    let pollTimer: any = null;

    const start = async () => {
      try {
        const user = await getCurrentUser();
        userRef.current = user;

        let currentDeviceId: string | null = null;

        if (!user) {
          currentDeviceId = await ensureAnonymousDeviceId();
        } else {
          deviceIdRef.current = null;
        }

        console.log('SSE Setup - User:', user, 'DeviceId:', currentDeviceId); // Debug log

        // Try SSE first, fallback to polling
        if (typeof (global as any).EventSource !== 'undefined') {
          es = new (global as any).EventSource(`${API_BASE_URL}/events`);
          es.onopen = () => {
            setSseActive(true);
            console.log('SSE connection opened for HomeScreen'); // Debug log
          };
          es.onmessage = async (ev: MessageEvent) => {
            try {
              const evt = JSON.parse((ev as any).data);
              if (!evt || !evt.type) return;

              console.log('SSE Event received:', evt.type, evt); // Debug log

              if (evt.type === 'report:update') {
                const report = evt.report;
                if (!report) return;

                console.log('Report update event:', report.id, report.status); // Debug log

                // Check if this update is relevant to current user
                let isRelevant = false;

                if (user && report.userId === user.id) {
                  // For registered users
                  isRelevant = true;
                  console.log('Update relevant to registered user:', user.id); // Debug log
                } else if (!user && currentDeviceId && report.deviceId === currentDeviceId) {
                  // For anonymous users
                  isRelevant = true;
                  console.log('Update relevant to anonymous user with deviceId:', currentDeviceId); // Debug log
                }

                if (isRelevant) {
                  console.log('Playing notification sound for report update'); // Debug log
                  playNotificationSound();

                  // Refresh notifications to show the update
                  await fetchNotifications();
                }
              }
            } catch (error) {
              console.error('Error processing SSE event:', error);
            }
          };
          es.onerror = () => {
            setSseActive(false);
            console.log('SSE connection error, falling back to polling'); // Debug log
            try { es.close(); } catch {}
            es = null;
            // Fallback to polling every 10 seconds
            pollTimer = setInterval(async () => {
              console.log('Polling for notification updates'); // Debug log
              await fetchNotifications();
            }, 10000);
          };
        } else {
          console.log('EventSource not available, using polling'); // Debug log
          // Fallback to polling every 10 seconds
          pollTimer = setInterval(async () => {
            console.log('Polling for notification updates'); // Debug log
            await fetchNotifications();
          }, 10000);
        }
      } catch (error) {
        console.error('Error setting up SSE:', error);
        // Fallback to polling
        pollTimer = setInterval(async () => {
          await fetchNotifications();
        }, 10000);
      }
    };

    start();

    return () => {
      setSseActive(false);
      if (es) {
        try { es.close(); } catch {}
      }
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [ensureAnonymousDeviceId]);

  useEffect(() => {
    // Entrance animations
    Animated.sequence([
      // Logo animation
      Animated.parallel([
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(logoRotate, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
      // Content fade in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      // Buttons scale in sequence
      Animated.stagger(150, [
        Animated.spring(buttonScale1, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.spring(buttonScale2, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.spring(buttonScale3, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Continuous logo pulse animation
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(logoScale, {
          toValue: 1.1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    
    // Start pulse after initial animation
    setTimeout(() => pulseAnimation.start(), 1500);

    return () => pulseAnimation.stop();
  }, []);
  const fetchNotifications = async () => {
    try {
      // Get current user to determine if anonymous or registered
      const user = await getCurrentUser();
      console.log('Current user:', user); // Debug log

      let notifications: any[] = [];

      if (user) {
        // For registered users, fetch notifications by userId
        console.log('Fetching notifications for registered user:', user.id); // Debug log
        notifications = await listNotifications(user.id);
      } else {
        // For anonymous users, get device ID and fetch device-specific notifications
        const deviceId = await ensureAnonymousDeviceId();
        console.log('Anonymous user - Device ID from storage:', deviceId); // Debug log

        if (deviceId) {
          console.log('Fetching notifications for anonymous user with deviceId:', deviceId); // Debug log
          notifications = await listNotifications(undefined, deviceId);
        } else {
          console.log('No device ID available for anonymous user; skipping fetch'); // Debug log
          return;
        }
      }

      console.log('Fetched notifications:', notifications.length, 'notifications'); // Debug log
      console.log('Notification titles:', notifications.map(n => n.title)); // Debug log

      setNotifications(notifications);
      const newCount = notifications.filter(n => !n.read).length;
      setNotificationCount(newCount);

      // Play sound if there are new notifications (count increased)
      if (newCount > prevNotificationCountRef.current) {
        playNotificationSound();
      }

      // Update the previous count for next comparison
      prevNotificationCountRef.current = newCount;
    } catch (error) {
      console.error('Error fetching notifications:', error);
      // Fallback to empty notifications if there's an error
      setNotifications([]);
      setNotificationCount(0);
    }
  };

  const saveReadStatus = async (notificationId: string, read: boolean) => {
    try {
      const storedReadStatus = await AsyncStorage.getItem('notificationReadStatus');
      const readStatus = storedReadStatus ? JSON.parse(storedReadStatus) : {};
      readStatus[notificationId] = read;
      await AsyncStorage.setItem('notificationReadStatus', JSON.stringify(readStatus));
    } catch (error) {
      console.error('Error saving read status:', error);
    }
  };

  const markNotificationAsRead = async (notificationId: string) => {
    try {
      // Toggle expanded state
      if (expandedNotificationId === notificationId) {
        setExpandedNotificationId(null);
      } else {
        setExpandedNotificationId(notificationId);
      }

      // Mark as read on server
      await markNotificationRead(notificationId, true);

      // Update local state
      setNotifications(prev =>
        prev.map(notification =>
          notification.id === notificationId
            ? { ...notification, read: true }
            : notification
        )
      );

      // Update badge count
      setNotificationCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const toggleNotificationModal = () => {
    setIsNotificationModalVisible(!isNotificationModalVisible);
    if (!isNotificationModalVisible) {
      console.log('Opening notification modal - fetching notifications'); // Debug log
      fetchNotifications();
    }
  };

  // Notifications removed: no SSE on HomeScreen

  const logoRotateInterpolate = logoRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handleButtonPress = (buttonScale: Animated.Value, onPress: () => void) => {
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
    onPress();
  };

  return (
    <ImageBackground
      source={require('../assets/back-wall.jpg')}
      style={styles.bg}
      resizeMode="cover"
    >
      {/* Notification Bell */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.notificationBell, notificationCount > 0 && styles.notificationBellWithBadge]}
          onPress={toggleNotificationModal}
          activeOpacity={0.7}
        >
          <Text style={styles.bellIcon}>🔔</Text>
          {notificationCount > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.badgeText}>
                {notificationCount > 99 ? '99+' : notificationCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Header: notification bell removed */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        {/* Background gradient effect */}
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.backgroundGradient}
          pointerEvents="none"
        />

        {/* Animated title */}
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          <Text style={styles.title}>ERS</Text>
          <Text style={styles.subtitle}>Emergency Response System</Text>
        </Animated.View>
        
        {/* Animated logo */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              transform: [
                { scale: logoScale },
                { rotate: logoRotateInterpolate },
              ],
            },
          ]}
        >
          <TouchableOpacity
              style={[styles.primaryBtn, styles.buttonShadow]}
              onPress={() => handleButtonPress(buttonScale1, () => navigation.navigate('Report', { anonymous: true }))}
              activeOpacity={0.8}
            >
              <View style={styles.buttonContent}>
                <Image source={require('../assets/icon.png')} style={styles.logo} />
              </View>        
            </TouchableOpacity>              
        </Animated.View>
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
        <Text style={styles.subtitle1}>Direct Report Here!</Text>
        </Animated.View>

        {/* Animated buttons */}
        <View style={styles.buttonContainer}>
          <Animated.View style={{ transform: [{ scale: buttonScale2 }] }}>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.buttonShadow]}
              onPress={() => handleButtonPress(buttonScale2, () => navigation.navigate('Login'))}
              activeOpacity={0.8}
            >
              <View style={styles.buttonContent}>
                <Text style={styles.btnText}>Login</Text>
                <View style={styles.buttonHighlight} pointerEvents="none" />
              </View>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={{ transform: [{ scale: buttonScale3 }] }}>
            <TouchableOpacity
              style={[styles.tertiaryBtn, styles.buttonShadow]}
              onPress={() => handleButtonPress(buttonScale3, () => navigation.navigate('Signup'))}
              activeOpacity={0.8}
            >
              <View style={styles.buttonContent}>
                <Text style={styles.btnText}>Signup</Text>
                <View style={styles.buttonHighlight} pointerEvents="none" />
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>
        {/* Info Cards */}
        <View style={styles.infoCards}>
          <View style={[styles.infoCard, styles.cardShadow]}> 
            <View style={styles.infoTextWrap}>
              <Text style={styles.infoTitle}>24/7 Availability</Text>
              <Text style={styles.infoDesc}>Report incidents anytime, anywhere with reliable uptime.</Text>
            </View>
          </View>

          <View style={[styles.infoCard, styles.cardShadow]}>
            <View style={styles.infoTextWrap}>
              <Text style={styles.infoTitle}>Accurate Geolocation</Text>
              <Text style={styles.infoDesc}>Share precise location to speed up emergency response.</Text>
            </View>
          </View>

          <View style={[styles.infoCard, styles.cardShadow]}>
            <View style={styles.infoTextWrap}>
              <Text style={styles.infoTitle}>Privacy First</Text>
              <Text style={styles.infoDesc}>Report anonymously or securely with your account.</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Notification Modal */}
      <Modal
        visible={isNotificationModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={toggleNotificationModal}
        supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={toggleNotificationModal}
          >
            <View style={styles.modalContentWrapper}>
              <View style={[styles.notificationModal, { backgroundColor: colors.background }]}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Notifications</Text>
                  <TouchableOpacity
                    onPress={toggleNotificationModal}
                    style={styles.closeButton}
                  >
                    <Text style={styles.closeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {notifications.length > 0 ? (
                  <FlatList
                    data={notifications}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => {
                      const isExpanded = expandedNotificationId === item.id;
                      return (
                        <View>
                          <TouchableOpacity
                            style={[styles.notificationItem, item.read && styles.readNotification]}
                            onPress={() => markNotificationAsRead(item.id)}
                          >
                            <View style={styles.notificationContent}>
                              <Text style={[styles.notificationTitle, { color: colors.text }]}>{item.title}</Text>
                              <Text style={[styles.notificationMessage, { color: colors.text + '99' }]}>{item.title}</Text>
                              <Text style={[styles.notificationTimestamp, { color: colors.text + '66' }]}>
                                {new Date(item.createdAt || item.timestamp).toLocaleDateString()} at{' '}
                                {new Date(item.createdAt || item.timestamp).toLocaleTimeString()}
                              </Text>
                            </View>
                            <View style={styles.notificationActions}>
                              {!item.read && <View style={styles.unreadIndicator} />}
                              <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
                            </View>
                          </TouchableOpacity>

                          {isExpanded && (
                            <View style={styles.expandedNotification}>
                              <Text style={[styles.expandedDetails, { color: colors.text }]}>
                                {item.reportId ? `Report ID: ${item.reportId}` : 'System notification'}
                              </Text>
                              <View style={styles.expandedFooter}>
                                <Text style={[styles.expandedTimestamp, { color: colors.text + '66' }]}>
                                  Received: {new Date(item.createdAt || item.timestamp).toLocaleString()}
                                </Text>
                                <Text style={[styles.readStatus, { color: colors.text }]}>
                                  Status: {item.read ? 'Read' : 'Unread'}
                                </Text>
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    }}
                    showsVerticalScrollIndicator={false}
                  />
                ) : (
                  <View style={styles.noNotifications}>
                    <Text style={styles.noNotificationsText}>No notifications yet</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'transparent',
  },
  bg: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  notificationBell: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(17, 21, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  notificationBellWithBadge: {
    // Add slight glow effect when there are notifications
    shadowColor: '#d90429',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
    borderColor: 'rgba(255, 87, 87, 0.6)',
  },
  bellIcon: {
    fontSize: 24,
    color: '#fff',
  },
  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#d90429',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(4, 6, 12, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  modalContentWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    paddingHorizontal: 20,
  },
  notificationModal: {
    backgroundColor: '#11152a',
    borderRadius: 20,
    padding: 0,
    width: '100%',
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  readNotification: {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  notificationContent: {
    flex: 1,
    marginRight: 10,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#c9cde4',
    marginBottom: 5,
    lineHeight: 18,
  },
  notificationTimestamp: {
    fontSize: 12,
    color: '#9aa0c2',
  },
  unreadIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#d90429',
  },
  notificationActions: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  expandIcon: {
    fontSize: 12,
    color: '#c9cde4',
    marginTop: 5,
  },
  expandedNotification: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    padding: 15,
  },
  expandedDetails: {
    fontSize: 14,
    color: '#d6dbff',
    lineHeight: 20,
    marginBottom: 15,
  },
  expandedFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  expandedTimestamp: {
    fontSize: 12,
    color: '#9aa0c2',
    flex: 1,
  },
  readStatus: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#3ddc97',
  },
  noNotifications: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noNotificationsText: {
    fontSize: 16,
    color: '#d6dbff',
    textAlign: 'center',
  },
  /* notification styles removed */
  scroll: {
    flex: 1,
    width: '100%',
  },
  backgroundGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.1,
  },
  logoContainer: {
    position: 'relative',
    marginBottom: 0,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#d90429',
  },
  logoGlow: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 70,
    backgroundColor: '#d90429',
    opacity: 0.2,
    zIndex: -1,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    textAlign: 'center',
    color: '#fff',
    textShadowColor: 'rgba(217, 4, 41, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '300',
    textAlign: 'center',
    color: 'white',
    marginBottom: 20,
    letterSpacing: 1,
  },
  subtitle1: {
    fontSize: 16,
    fontWeight: '300',
    textAlign: 'center',
    color: 'white',
    marginBottom: 60,
    letterSpacing: 1,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 320,
  },
  buttonContent: {
    position: 'relative',
    overflow: 'hidden',
  },
  buttonHighlight: {
    position: 'absolute',
    top: 0,
    left: -100,
    width: 100,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    transform: [{ skewX: '-20deg' }],
  },
  primaryBtn: {
    backgroundColor: '#d90429',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 25,
    width: '100%',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#ff1744',
  },
  secondaryBtn: {
    backgroundColor: '#2b2d42',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 25,
    width: '100%',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#4a4e69',
  },
  tertiaryBtn: {
    backgroundColor: 'rgba(102, 126, 234, 0.2)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 25,
    width: '100%',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#667eea',
  },
  buttonShadow: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  btnText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  infoCards: {
    width: '100%',
    maxWidth: 360,
    marginTop: 8,
    gap: 12,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  infoTextWrap: {
    flex: 1,
  },
  infoTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
    letterSpacing: 0.3,
  },
  infoDesc: {
    color: '#c9c9c9',
    fontSize: 12,
    lineHeight: 16,
  },
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
});