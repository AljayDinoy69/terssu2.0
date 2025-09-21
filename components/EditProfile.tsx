import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Animated,
  Image,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ToastAndroid,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons, FontAwesome } from '@expo/vector-icons';
import { Account, updateMyProfile } from '../utils/auth';
import { uploadImage } from '../utils/api';
import { PasswordInput } from './PasswordInput';

type Role = 'admin' | 'responder' | 'user';

interface EditProfileProps {
  user: Account | null;
  onProfileUpdated: (updatedUser: Account) => void;
  onClose?: () => void;
  isModal?: boolean;
  currentUserRole?: Role;
}

export const EditProfile: React.FC<EditProfileProps> = ({
  user,
  onProfileUpdated,
  onClose,
  isModal = false,
}) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    currentPassword: '',
    password: '',
    confirmPassword: '',
    photoUrl: '',
    address: '',
    emergencyContact: '',
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [successAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    // Animation on mount
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
        currentPassword: '',
        password: '',
        confirmPassword: '',
        photoUrl: (user as any).photoUrl || (user as any).avatarUrl || '',
        address: (user as any).address || '',
        emergencyContact: (user as any).emergencyContact || '',
      });
    }
  }, [user]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    
    // If sensitive changes (email or password), require current password
    const emailChanged = user && formData.email.trim() !== (user.email || '').trim();
    const wantsNewPassword = !!formData.password;
    if ((emailChanged || wantsNewPassword) && !formData.currentPassword) {
      newErrors.currentPassword = 'Current password is required to change email or password';
    }

    if (formData.password) {
      if (formData.password.length < 6) {
        newErrors.password = 'Password must be at least 6 characters';
      } else if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }
    
    if (formData.phone && !/^[0-9+\-\s()]*$/.test(formData.phone)) {
      newErrors.phone = 'Invalid phone number';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: string, value: string) => {
    // Clear error when user types
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
    
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleChangePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo library access to change your profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const uri = result.assets[0].uri;
      // Optimistic preview with local uri
      setFormData(prev => ({ ...prev, photoUrl: uri }));
      // Upload in background and replace with remote URL when ready
      setLoading(true);
      try {
        const uploaded = await uploadImage(uri);
        if (uploaded?.url) {
          setFormData(prev => ({ ...prev, photoUrl: uploaded.url }));
        } else {
          Alert.alert('Upload failed', 'Could not get uploaded image URL.');
        }
      } catch (e: any) {
        Alert.alert('Upload error', e?.message || 'Failed to upload image');
      } finally {
        setLoading(false);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not pick image');
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return; // Validation failed, errors are already set
    }

    setLoading(true);
    try {
      // Compute changed fields before mutating anything
      const original = user || ({} as any);
      const origPhoto = (original as any)?.photoUrl || (original as any)?.avatarUrl || '';
      const nextEmail = formData.email.trim();
      const changes: Record<string, { from: any; to: any }> = {};
      const markChange = (key: string, fromVal: any, toVal: any) => {
        const fromS = (fromVal ?? '').toString();
        const toS = (toVal ?? '').toString();
        if (fromS !== toS) changes[key] = { from: fromVal ?? null, to: toVal ?? null };
      };

      markChange('name', original?.name, formData.name.trim());
      markChange('phone', original?.phone ?? '', formData.phone.trim());
      markChange('address', (original as any)?.address ?? '', formData.address.trim());
      markChange('emergencyContact', (original as any)?.emergencyContact ?? '', formData.emergencyContact.trim());
      markChange('email', original?.email ?? '', nextEmail);

      const updates: Record<string, any> = {
        name: formData.name.trim(),
        phone: formData.phone.trim() || null,
        address: formData.address.trim() || null,
        emergencyContact: formData.emergencyContact.trim() || null,
      };

      // Only include password if provided and valid
      if (formData.password) {
        updates.password = formData.password;
      }

      // Include new email if it changed
      if (user && formData.email.trim() !== (user.email || '').trim()) {
        updates.email = formData.email.trim();
      }

      // Handle profile photo upload if changed
      let photoUrlToSave = formData.photoUrl;
      if (photoUrlToSave && photoUrlToSave.startsWith('file')) {
        try {
          setIsUploading(true);
          const uploaded = await uploadImage(photoUrlToSave);
          if (uploaded?.url) {
            photoUrlToSave = uploaded.url;
            updates.photoUrl = photoUrlToSave;
            updates.avatarUrl = photoUrlToSave; // For backward compatibility
          }
        } catch (error: any) {
          console.error('Error uploading image:', error);
          Alert.alert('Upload Error', 'Failed to upload profile photo. ' + (error.message || ''));
          return;
        } finally {
          setIsUploading(false);
        }
      } else if (photoUrlToSave) {
        updates.photoUrl = photoUrlToSave;
        updates.avatarUrl = photoUrlToSave; // For backward compatibility
      }
      // Mark photo change (after upload mapping)
      if (photoUrlToSave) {
        markChange('photoUrl', origPhoto, photoUrlToSave);
      }

      // Update profile
      // Authenticate with current credentials if changing email or password
      const emailChanged = user && formData.email.trim() !== (user.email || '').trim();
      const requiresAuth = !!formData.currentPassword || !!updates.password || !!updates.email;
      const authEmail = (requiresAuth ? (user?.email || '') : '');
      const authPassword = (requiresAuth ? formData.currentPassword : '');
      const updatedUser = await updateMyProfile(authEmail, authPassword, updates);
      
      // Merge updates with existing user data
      const mergedUser = { 
        ...user, 
        ...updatedUser,
        name: updates.name,
        email: updates.email ?? user?.email,
        phone: updates.phone,
        photoUrl: photoUrlToSave || updatedUser.photoUrl,
        avatarUrl: photoUrlToSave || (updatedUser as any).avatarUrl,
        address: updates.address,
        emergencyContact: updates.emergencyContact,
      } as Account;

      // Persist updated user session
      try {
        await AsyncStorage.setItem('ERS_SESSION', JSON.stringify({ 
          id: mergedUser.id, 
          user: mergedUser 
        }));
        // Store last saved profile snapshot and change log (append, keep last 50)
        await AsyncStorage.setItem('ERS_LAST_PROFILE', JSON.stringify(mergedUser));
        try {
          const raw = await AsyncStorage.getItem('ERS_PROFILE_CHANGE_LOG');
          const arr = raw ? JSON.parse(raw) : [];
          arr.push({ userId: mergedUser.id, at: Date.now(), changes });
          const pruned = Array.isArray(arr) ? arr.slice(-50) : [ { userId: mergedUser.id, at: Date.now(), changes } ];
          await AsyncStorage.setItem('ERS_PROFILE_CHANGE_LOG', JSON.stringify(pruned));
          await AsyncStorage.setItem('ERS_LAST_PROFILE_CHANGES', JSON.stringify(changes));
        } catch {}
      } catch (e) {
        console.error('Failed to persist user session:', e);
      }

      // Update parent component
      onProfileUpdated(mergedUser);
      
      // Non-blocking success feedback: toast + inline banner
      try {
        if (Platform.OS === 'android') {
          ToastAndroid.show('Profile saved successfully', ToastAndroid.SHORT);
        }
      } catch {}

      // Show inline success banner briefly
      setSaveSuccess(true);
      successAnim.setValue(0);
      Animated.sequence([
        Animated.timing(successAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1800),
        Animated.timing(successAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setSaveSuccess(false));

      // Reset sensitive fields on successful update
      setFormData(prev => ({ 
        ...prev, 
        currentPassword: '',
        password: '',
        confirmPassword: '' 
      }));
      
    } catch (error: any) {
      console.error('Profile update error:', error);
      Alert.alert(
        'Update Failed', 
        error.message || 'An error occurred while updating your profile. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View
          style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: 40 + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.contentWrapper, { maxWidth: 640 - insets.left - insets.right }]}>
              {!!saveSuccess && (
                <Animated.View style={[styles.successBanner, { opacity: successAnim }]}>
                  <Text style={styles.successBannerText}>✔ Profile updated successfully</Text>
                </Animated.View>
              )}
              {isModal && onClose && (
                <View style={styles.header}>
                  <Text style={styles.title}>Edit Profile</Text>
                  <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                    <MaterialIcons name="close" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.avatarContainer}>
                {formData.photoUrl ? (
                  <Image source={{ uri: formData.photoUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {user?.name?.charAt(0).toUpperCase() || 'U'}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.changePhotoButton, isUploading && styles.disabledButton]}
                  onPress={handleChangePhoto}
                  disabled={isUploading || loading}
                >
                  {isUploading ? (
                    <ActivityIndicator color="#667eea" size="small" />
                  ) : (
                    <Text style={styles.changePhotoText}>
                      <MaterialIcons name="edit" size={14} color="#667eea" /> Change Photo
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Full Name <Text style={styles.required}>*</Text></Text>
                <View style={[styles.inputContainer, errors.name && styles.inputError]}>
                  <TextInput
                    style={styles.input}
                    value={formData.name}
                    onChangeText={(text) => handleInputChange('name', text)}
                    placeholder="Enter your full name"
                    placeholderTextColor="#666"
                    editable={!loading && !isUploading}
                  />
                </View>
                {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    value={formData.email}
                    onChangeText={(text) => handleInputChange('email', text)}
                    editable={!loading && !isUploading}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="Email"
                    placeholderTextColor="#666"
                  />
                </View>
                {user && formData.email.trim() !== (user.email || '').trim() && (
                  <Text style={styles.hintText}>Changing your email requires your current password.</Text>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Phone Number</Text>
                <View style={[styles.inputContainer, errors.phone && styles.inputError]}>
                  <TextInput
                    style={styles.input}
                    value={formData.phone}
                    onChangeText={(text) => handleInputChange('phone', text)}
                    placeholder="Enter your phone number"
                    placeholderTextColor="#666"
                    keyboardType="phone-pad"
                    editable={!loading && !isUploading}
                  />
                </View>
                {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Address</Text>
                <View style={[styles.inputContainer, { minHeight: 80 }]}>
                  <TextInput
                    style={[styles.input, { textAlignVertical: 'top' }]}
                    value={formData.address}
                    onChangeText={(text) => handleInputChange('address', text)}
                    placeholder="Enter your address"
                    placeholderTextColor="#666"
                    editable={!loading && !isUploading}
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Emergency Contact</Text>
                  <FontAwesome name="question-circle" size={16} color="#666" />
                </View>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    value={formData.emergencyContact}
                    onChangeText={(text) => handleInputChange('emergencyContact', text)}
                    placeholder="Emergency contact number"
                    placeholderTextColor="#666"
                    keyboardType="phone-pad"
                    editable={!loading && !isUploading}
                  />
                </View>
                <Text style={styles.hintText}>Include name and relationship (e.g., 'John Doe - Father')</Text>
              </View>

              {/* Current password required when changing email or setting a new password */}
              {(formData.password || (user && formData.email.trim() !== (user.email || '').trim())) && (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Current Password</Text>
                  <View style={[styles.inputContainer, errors.currentPassword && styles.inputError]}>
                    <PasswordInput
                      value={formData.currentPassword}
                      onChangeText={(text) => handleInputChange('currentPassword', text)}
                      placeholder="Enter current password"
                      style={styles.passwordInput}
                      editable={!loading && !isUploading}
                    />
                  </View>
                  {errors.currentPassword && <Text style={styles.errorText}>{errors.currentPassword}</Text>}
                </View>
              )}

              <View style={styles.sectionDivider}>
                <View style={styles.dividerLine} />
                <Text style={styles.sectionTitle}>Change Password</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>New Password</Text>
                <View style={[styles.inputContainer, errors.password && styles.inputError]}>
                  <PasswordInput
                    value={formData.password}
                    onChangeText={(text) => handleInputChange('password', text)}
                    placeholder="Enter new password"
                    style={styles.passwordInput}
                    editable={!loading && !isUploading}
                  />
                </View>
                {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
                <Text style={[styles.hintText, { marginTop: 4 }]}>Leave blank to keep current password</Text>
              </View>

              {formData.password ? (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Confirm New Password</Text>
                  <View style={[styles.inputContainer, errors.confirmPassword && styles.inputError]}>
                    <PasswordInput
                      value={formData.confirmPassword}
                      onChangeText={(text) => handleInputChange('confirmPassword', text)}
                      placeholder="Confirm new password"
                      style={styles.passwordInput}
                      editable={!loading && !isUploading}
                    />
                  </View>
                  {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
                </View>
              ) : null}

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.saveButton, (loading || isUploading) && styles.saveButtonDisabled]}
                  onPress={handleSave}
                  disabled={loading || isUploading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      {isUploading ? 'Uploading...' : 'Save Changes'}
                    </Text>
                  )}
                </TouchableOpacity>

                {onClose && (
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={onClose}
                    disabled={loading || isUploading}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  successBanner: {
    backgroundColor: 'rgba(72, 187, 120, 0.15)',
    borderColor: 'rgba(72, 187, 120, 0.4)',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  successBannerText: {
    color: '#48bb78',
    fontWeight: '700',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 8,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#4f46e5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  avatarText: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  changePhotoButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(79, 70, 229, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 140,
  },
  changePhotoText: {
    color: '#818cf8',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#e2e8f0',
    fontSize: 14,
    marginBottom: 6,
    fontWeight: '500',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  required: {
    color: '#ef4444',
    marginLeft: 2,
  },
  inputContainer: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a3c',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 15,
    paddingVertical: 12,
    paddingRight: 12,
    lineHeight: 20,
  },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 28,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2a2a3c',
  },
  sectionTitle: {
    color: '#94a3b8',
    marginHorizontal: 12,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  passwordInput: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  inputError: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  hintText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic',
  },
  buttonContainer: {
    marginTop: 8,
    marginBottom: 24,
  },
  saveButton: {
    backgroundColor: '#4f46e5',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  cancelButton: {
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
  },
  cancelButtonText: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '500',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
