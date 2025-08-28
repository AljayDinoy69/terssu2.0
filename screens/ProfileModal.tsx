import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Account, getMyProfile, updateMyProfile, deleteMyAccount, logout } from '../utils/auth';

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
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
  });
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

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

      // Pre-fill form data
      if (user) {
        setFormData({
          name: user.name || '',
          phone: user.phone || '',
          email: user.email || '',
          password: '',
        });
      }
    } else {
      // Reset state when modal closes
      setIsEditing(false);
      setFormData({
        name: '',
        phone: '',
        email: '',
        password: '',
      });
    }
  }, [visible, user]);

  const handleSave = async () => {
    if (!formData.email || !formData.password) {
      Alert.alert('Error', 'Please enter your email and password to authenticate');
      return;
    }

    if (!formData.name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    setLoading(true);
    try {
      const updates: { name?: string; phone?: string } = {
        name: formData.name.trim(),
      };

      if (formData.phone.trim()) {
        updates.phone = formData.phone.trim();
      }

      const updatedUser = await updateMyProfile(
        formData.email,
        formData.password,
        updates
      );

      onProfileUpdated(updatedUser);
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: confirmDeleteAccount,
        },
      ]
    );
  };

  const confirmDeleteAccount = async () => {
    if (!formData.email || !formData.password) {
      Alert.alert('Error', 'Please enter your email and password to authenticate');
      return;
    }

    setDeleting(true);
    try {
      await deleteMyAccount(formData.email, formData.password);

      // Logout and navigate to home
      await logout();
      onAccountDeleted();
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });

      Alert.alert('Account Deleted', 'Your account has been successfully deleted.');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  const handleClose = () => {
    if (isEditing) {
      Alert.alert(
        'Discard Changes',
        'You have unsaved changes. Do you want to discard them?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Discard', onPress: onClose },
        ]
      );
    } else {
      onClose();
    }
  };

  if (!user) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={handleClose}
      >
        <Animated.View
          style={[
            styles.modalContent,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.modalTouchable}
            activeOpacity={1}
            onPress={() => {}}
          >
            <View style={styles.header}>
              <Text style={styles.title}>👤 My Profile</Text>
              <TouchableOpacity
                onPress={() => setIsEditing(!isEditing)}
                style={styles.editButton}
                disabled={loading || deleting}
              >
                <Text style={styles.editButtonText}>
                  {isEditing ? '✕ Cancel' : '✏️ Edit'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
              {/* Name Field */}
              <View style={styles.field}>
                <Text style={styles.label}>Name</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={formData.name}
                    onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
                    placeholder="Enter your name"
                    placeholderTextColor="#888"
                  />
                ) : (
                  <Text style={styles.value}>{user.name}</Text>
                )}
              </View>

              {/* Email Field (Read-only) */}
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.value}>{user.email}</Text>
                <Text style={styles.hint}>Email cannot be changed</Text>
              </View>

              {/* Phone Field */}
              <View style={styles.field}>
                <Text style={styles.label}>Phone</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.input}
                    value={formData.phone}
                    onChangeText={(text) => setFormData(prev => ({ ...prev, phone: text }))}
                    placeholder="Enter your phone number"
                    placeholderTextColor="#888"
                    keyboardType="phone-pad"
                  />
                ) : (
                  <Text style={styles.value}>{user.phone || 'Not provided'}</Text>
                )}
              </View>

              {/* Role Field (Read-only) */}
              <View style={styles.field}>
                <Text style={styles.label}>Role</Text>
                <Text style={styles.value}>{user.role.charAt(0).toUpperCase() + user.role.slice(1)}</Text>
              </View>

              {/* Password Field (for authentication) */}
              {isEditing && (
                <View style={styles.field}>
                  <Text style={styles.label}>Password (for authentication)</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.password}
                    onChangeText={(text) => setFormData(prev => ({ ...prev, password: text }))}
                    placeholder="Enter your password"
                    placeholderTextColor="#888"
                    secureTextEntry
                  />
                </View>
              )}

              {/* Action Buttons */}
              {isEditing && (
                <View style={styles.buttonContainer}>
                  <TouchableOpacity
                    style={[styles.button, styles.saveButton]}
                    onPress={handleSave}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.saveButtonText}>💾 Save Changes</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Delete Account Section */}
              <View style={styles.deleteSection}>
                <Text style={styles.deleteTitle}>🚨 Danger Zone</Text>
                <Text style={styles.deleteDescription}>
                  Deleting your account is permanent and cannot be undone.
                </Text>
                <TouchableOpacity
                  style={[styles.button, styles.deleteButton]}
                  onPress={handleDeleteAccount}
                  disabled={deleting || loading}
                >
                  {deleting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.deleteButtonText}>🗑️ Delete Account</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#0f0f23',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 40,
  },
  modalTouchable: {
    width: '100%',
    padding: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
  },
  editButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#667eea',
  },
  editButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  content: {
    padding: 20,
    flex: 1,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  value: {
    fontSize: 16,
    color: '#ccc',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  hint: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#667eea',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    backgroundColor: '#1a1a2e',
  },
  buttonContainer: {
    marginTop: 10,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  saveButton: {
    backgroundColor: '#4caf50',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  deleteSection: {
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  deleteTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ff6b6b',
    marginBottom: 8,
  },
  deleteDescription: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 16,
    lineHeight: 20,
  },
  deleteButton: {
    backgroundColor: '#d90429',
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  closeButton: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  closeButtonText: {
    color: '#667eea',
    fontWeight: '700',
    fontSize: 16,
  },
});
