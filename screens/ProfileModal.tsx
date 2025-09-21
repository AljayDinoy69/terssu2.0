import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Account, deleteMyAccount, logout } from '../utils/auth';
import { EditProfile } from '../components/EditProfile';

export const AboutServicesModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.9));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 5,
        })
      ]).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal
      transparent={true}
      animationType="none"
      visible={visible}
      onRequestClose={onClose}
    >
      <Animated.View 
        style={[styles.centeredOverlay, { opacity: fadeAnim }]}
      >
        <TouchableOpacity 
          style={styles.centeredOverlay} 
          activeOpacity={1} 
          onPress={onClose}
        >
          <Animated.View 
            style={[
              styles.centeredModalContent,
              { 
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }] 
              }
            ]}
          >
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={onClose}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            >
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
            
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalTitle}>About & Services</Text>
              
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>About Our App</Text>
                <Text style={styles.sectionText}>
                  Our emergency response app connects users with immediate assistance and provides real-time alerts for critical situations. We're committed to keeping communities safe and informed.
                </Text>
              </View>
              
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Our Services</Text>
                <View style={styles.serviceItem}>
                  <Ionicons name="alert-circle" size={20} color="#007AFF" style={styles.serviceIcon} />
                  <Text style={styles.serviceText}>Emergency Alerts</Text>
                </View>
                <View style={styles.serviceItem}>
                  <Ionicons name="location" size={20} color="#007AFF" style={styles.serviceIcon} />
                  <Text style={styles.serviceText}>Real-time Location Sharing</Text>
                </View>
                <View style={styles.serviceItem}>
                  <Ionicons name="people" size={20} color="#007AFF" style={styles.serviceIcon} />
                  <Text style={styles.serviceText}>Community Safety Network</Text>
                </View>
                <View style={styles.serviceItem}>
                  <Ionicons name="notifications" size={20} color="#007AFF" style={styles.serviceIcon} />
                  <Text style={styles.serviceText}>Instant Notifications</Text>
                </View>
              </View>
              
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Contact Us</Text>
                <Text style={styles.contactText}>
                  For support or inquiries, please email us at:
                </Text>
                <Text style={[styles.contactText, { color: '#007AFF' }]}>
                  support@emergencyresponse.com
                </Text>
              </View>
            </ScrollView>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
};

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
  user: Account | null;
  onProfileUpdated: (updatedUser: Account) => void;
  onAccountDeleted: () => void;
  navigation: any;
}

export default function ProfileModal({
  visible,
  onClose,
  user,
  onProfileUpdated,
  onAccountDeleted,
  navigation
}: ProfileModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(Dimensions.get('window').height));
  const [showEditProfile, setShowEditProfile] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  useEffect(() => {
    if (visible) {
      // Animate in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 5,
        }),
      ]).start();

      setShowEditProfile(true);
    } else {
      // Animate out
      Animated.timing(slideAnim, {
        toValue: Dimensions.get('window').height,
        duration: 250,
        useNativeDriver: true,
      }).start();
      setShowEditProfile(false);
    }
  }, [visible, user]);

  const handleProfileUpdated = (updatedUser: Account) => {
    if (!user) return; // Guard clause if user is null
    
    // Merge the updated fields with existing user data
    const mergedUser: Account = {
      // Required Account fields with fallbacks
      id: user.id,
      name: updatedUser.name || user.name,
      email: updatedUser.email || user.email,
      role: user.role, // Keep original role
      
      // Optional fields with fallbacks
      phone: updatedUser.phone || user.phone || '',
      ...(user.password && { password: user.password }), // Only include if exists
      
      // Additional fields that might be present
      ...(updatedUser as any).photoUrl && { photoUrl: (updatedUser as any).photoUrl },
      ...(updatedUser as any).avatarUrl && { avatarUrl: (updatedUser as any).avatarUrl },
      ...(updatedUser as any).address && { address: (updatedUser as any).address },
      ...(updatedUser as any).emergencyContact && { emergencyContact: (updatedUser as any).emergencyContact },
      
      // Fallback photo/avatar URLs if not in updatedUser
      ...(!(updatedUser as any).photoUrl && !(updatedUser as any).avatarUrl && {
        photoUrl: (user as any)?.photoUrl || (user as any)?.avatarUrl || '',
        avatarUrl: (user as any)?.avatarUrl || (user as any)?.photoUrl || ''
      })
    };
    
    onProfileUpdated(mergedUser);
    setShowEditProfile(false);
    if (onClose) onClose();
    
    // Show success message
    Alert.alert('Success', 'Your profile has been updated successfully');
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently removed.\n\nPlease confirm by entering your password:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              // Using the user's email and requesting password via prompt
              Alert.prompt(
                'Confirm Password',
                'Enter your password to confirm account deletion:',
                async (password) => {
                  if (!password) {
                    Alert.alert('Error', 'Password is required');
                    setDeleting(false);
                    return;
                  }
                  try {
                    await deleteMyAccount(user?.email || '', password);
                    await logout();
                    onAccountDeleted();
                    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
                  } catch (error: any) {
                    Alert.alert('Error', error.message || 'Failed to delete account');
                    setDeleting(false);
                  }
                },
                'secure-text'
              );
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete account');
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  // Remove confirmDeleteAccount function as it's no longer needed
  // The delete functionality is now handled directly in handleDeleteAccount

  const handleClose = () => {
    // Animate out before closing
    Animated.timing(slideAnim, {
      toValue: Dimensions.get('window').height,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  };

  if (!user) return null;

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      statusBarTranslucent={true}
      onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity 
          style={StyleSheet.absoluteFill} 
          activeOpacity={1}
          onPress={handleClose}
        />
        <Animated.View 
          style={[
            styles.modalContainer,
            { 
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }] 
            }
          ]}>
          <View style={styles.headerContainer}>
            <Text style={styles.headerTitle}>Profile Settings</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <ScrollView 
            style={styles.modalContent}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}>
            {showEditProfile && user ? (
              <EditProfile 
                user={user} 
                onProfileUpdated={handleProfileUpdated} 
                onClose={handleClose}
                isModal={true}
              />
            ) : (
              <View style={styles.profileContainer}>
                <View style={styles.avatarContainer}>
                  <Text style={styles.avatarText}>
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.name}>{user?.name || 'User'}</Text>
                  <Text style={styles.email}>{user?.email}</Text>
                  {user?.phone && <Text style={styles.phone}>📱 {user.phone}</Text>}
                </View>

                <View style={styles.buttonContainer}>
                  <TouchableOpacity
                    style={[styles.button, styles.primaryButton]}
                    onPress={() => setShowEditProfile(true)}>
                    <Text style={styles.buttonText}>Edit Profile</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.button, styles.secondaryButton]}
                    onPress={async () => {
                      await logout();
                      navigation.reset({
                        index: 0,
                        routes: [{ name: 'Home' }],
                      });
                    }}>
                    <Text style={styles.buttonText}>Logout</Text>
                  </TouchableOpacity>

                  {user?.role === 'user' && (
                    <TouchableOpacity
                      style={[styles.button, styles.dangerButton]}
                      onPress={handleDeleteAccount}
                      disabled={deleting}>
                      {deleting ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.buttonText}>Delete Account</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Centered Modal Styles
  centeredOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  centeredModalContent: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalScroll: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 6,
  },
  sectionText: {
    fontSize: 15,
    color: '#555',
    lineHeight: 22,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceIcon: {
    marginRight: 12,
  },
  serviceText: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  contactText: {
    fontSize: 15,
    color: '#555',
    marginBottom: 8,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Layout
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    height: '90%',
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: '#2d2d42',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'column',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 100 : 80,
    width: '100%',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d42',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  darkCloseButton: {
    backgroundColor: '#2d2d42',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    flex: 1,
    maxHeight: '100%',
  },
  
  // Profile Section
  profileContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    padding: 15,
    width: '100%',
    paddingBottom: 30,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#2d2d42',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#667eea',
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
    textAlign: 'center',
  },
  email: {
    fontSize: 16,
    color: '#a0aec0',
    marginBottom: 5,
    textAlign: 'center',
  },
  phone: {
    fontSize: 16,
    color: '#a0aec0',
    textAlign: 'center',
  },
  
  // Buttons
  buttonContainer: {
    width: '100%',
    marginTop: 20,
    paddingHorizontal: 10,
  },
  button: {
    padding: 15,
    borderRadius: 10,
    marginBottom: 12,
    alignItems: 'center',
    width: '100%',
  },
  buttonText: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Button Variants
  primaryButton: {
    backgroundColor: '#2d3748',
    borderColor: '#2d3748',
  },
  secondaryButton: {
    backgroundColor: '#4a5568',
    borderColor: '#4a5568',
  },
  dangerButton: {
    backgroundColor: '#742a2a',
    borderColor: '#9b2c2c',
  },
  
  // Form Elements
  input: {
    borderWidth: 1,
    borderColor: '#667eea',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    backgroundColor: '#1a1a2e',
    marginBottom: 16,
  },
  
  // Utility
  textCenter: {
    textAlign: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  mt10: {
    marginTop: 10,
  },
  mt20: {
    marginTop: 20,
  },
  mb10: {
    marginBottom: 10,
  },
  mb20: {
    marginBottom: 20,
  },
});
