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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { Account, updateMyProfile } from '../utils/auth';
import { uploadImage } from '../utils/api';
import { PasswordInput } from './PasswordInput';

interface EditProfileProps {
  user: Account | null;
  onProfileUpdated: (updatedUser: Account) => void;
  onClose?: () => void;
  isModal?: boolean;
}

export const EditProfile: React.FC<EditProfileProps> = ({
  user,
  onProfileUpdated,
  onClose,
  isModal = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
    photoUrl: '',
  });
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

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
        password: '',
        photoUrl: (user as any).photoUrl || (user as any).avatarUrl || '',
      });
    }
  }, [user]);

  const handleInputChange = (field: string, value: string) => {
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
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    setLoading(true);
    try {
      const updates: { name?: string; phone?: string; password?: string; photoUrl?: string } = {
        name: formData.name.trim(),
      };

      if (formData.phone.trim()) {
        updates.phone = formData.phone.trim();
      }

      // Only include password if provided
      if (formData.password) {
        updates.password = formData.password;
      }

      // Ensure we send a remote URL: if local file path, upload now
      let photoUrlToSave = formData.photoUrl;
      if (photoUrlToSave && photoUrlToSave.startsWith('file')) {
        try {
          const uploaded = await uploadImage(photoUrlToSave);
          photoUrlToSave = uploaded?.url || photoUrlToSave;
        } catch {}
      }
      if (photoUrlToSave) {
        updates.photoUrl = photoUrlToSave;
        // also send avatarUrl for compatibility with existing UI
        (updates as any).avatarUrl = photoUrlToSave;
      }

      const updatedUser = await updateMyProfile(formData.email, formData.password, updates);
      const mergedUser = { 
        ...updatedUser, 
        photoUrl: updatedUser.photoUrl || photoUrlToSave,
        avatarUrl: (updatedUser as any).avatarUrl || photoUrlToSave,
      } as Account;
      // Persist updated user into current session so headers and other screens read the latest data
      try {
        await AsyncStorage.setItem('ERS_SESSION', JSON.stringify({ id: mergedUser.id, user: mergedUser }));
        // Debug: verify what is stored in session
        const raw = await AsyncStorage.getItem('ERS_SESSION');
        console.log('[EditProfile] ERS_SESSION after save:', raw);
      } catch (e) {
        console.log('[EditProfile] Failed to persist/read ERS_SESSION', e);
      }
      onProfileUpdated(mergedUser);
      
      // Show success message
      Alert.alert('Success', 'Profile updated successfully');
      
      // Reset password field on successful update
      setFormData(prev => ({ ...prev, password: '' }));
      
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Animated.View 
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
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
          <TouchableOpacity style={styles.changePhotoButton} onPress={handleChangePhoto}>
            <Text style={styles.changePhotoText}>Change Photo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Full Name</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={formData.name}
              onChangeText={(text) => handleInputChange('name', text)}
              placeholder="Enter your full name"
              placeholderTextColor="#999"
            />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Email</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, { color: '#999' }]}
              value={formData.email}
              editable={false}
              placeholder="Email"
              placeholderTextColor="#999"
            />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Phone Number</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={formData.phone}
              onChangeText={(text) => handleInputChange('phone', text)}
              placeholder="Enter your phone number"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Change Password (leave blank to keep current)</Text>
          <View style={styles.inputContainer}>
            <PasswordInput
              value={formData.password}
              onChangeText={(text) => handleInputChange('password', text)}
              placeholder="Enter new password"
              style={styles.passwordInput}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
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
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#2d2d42',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#2d2d42',
    resizeMode: 'cover',
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#667eea',
  },
  changePhotoButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
  },
  changePhotoText: {
    color: '#667eea',
    fontSize: 14,
    fontWeight: '600',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#cbd5e1',
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  inputContainer: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2d2d42',
    overflow: 'hidden',
  },
  input: {
    padding: 14,
    color: '#fff',
    fontSize: 16,
  },
  passwordInput: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  saveButton: {
    backgroundColor: '#667eea',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
