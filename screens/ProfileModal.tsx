import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Account, deleteMyAccount, logout } from '../utils/auth';
import { EditProfile } from '../components/EditProfile';

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
  const [slideAnim] = useState(new Animated.Value(50));
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
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      setShowEditProfile(true);
    } else {
      setShowEditProfile(false);
    }
  }, [visible, user]);

  const handleProfileUpdated = (updatedUser: Account) => {
    onProfileUpdated(updatedUser);
    setShowEditProfile(false);
    if (onClose) onClose();
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
    onClose();
  };

  if (!user) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.modalContent,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}>
          {showEditProfile && user ? (
            <>
              <EditProfile 
                user={user} 
                onProfileUpdated={handleProfileUpdated} 
                onClose={onClose}
                isModal={true}
              />
              <View style={styles.closeButtonContainer}>
                <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                  <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
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

              <View style={styles.closeButtonContainer}>
                <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                  <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
    );
}

const styles = StyleSheet.create({
  // Layout
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#2d2d42',
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  
  // Profile Section
  profileContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    padding: 20,
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
  },
  button: {
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
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
  
  // Close Button
  closeButtonContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  closeButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#2d3748',
    minWidth: 100,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '600',
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
