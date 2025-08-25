import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ScrollView, Image, Animated, Dimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { createReport, getCurrentUser, listResponders } from '../utils/auth';

export type ReportProps = NativeStackScreenProps<RootStackParamList, 'Report'>;

const { width } = Dimensions.get('window');

export default function ReportScreen({ navigation, route }: ReportProps) {
  const [incidentType, setIncidentType] = useState('');
  const [description, setDescription] = useState(''); // optional
  const [locationText, setLocationText] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [responderId, setResponderId] = useState('');
  const [responders, setResponders] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  // New fields
  const [fullName, setFullName] = useState(''); // optional
  const [contactNo, setContactNo] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [personsInvolved, setPersonsInvolved] = useState('');

  const isAnonymous = route.params?.anonymous;

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const titleScale = useRef(new Animated.Value(0.8)).current;
  const inputAnimations = useRef(
    Array.from({ length: 8 }, () => new Animated.Value(0.9))
  ).current;
  const buttonScale = useRef(new Animated.Value(0.9)).current;
  const photoScale = useRef(new Animated.Value(0)).current;
  const responderAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Entrance animations
    Animated.sequence([
      // Title animation
      Animated.timing(titleScale, {
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
      // Staggered input animations
      Animated.stagger(120, [
        ...inputAnimations.map(anim => 
          Animated.spring(anim, {
            toValue: 1,
            tension: 100,
            friction: 8,
            useNativeDriver: true,
          })
        ),
      ]),
      // Responder section
      Animated.timing(responderAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // Submit button
      Animated.spring(buttonScale, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();

    // Pulse animation for urgent report indicator
    if (isAnonymous) {
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
  }, [isAnonymous]);

  // Update progress based on filled fields
  useEffect(() => {
    // Required fields exclude optional ones (fullName, description, photo)
    const required = [incidentType, chiefComplaint, contactNo, personsInvolved, locationText];
    const filledFields = required.filter(field => field.length > 0).length;
    const denominator = required.length + 1; // +1 for responder selection
    const progress = responderId ? (filledFields + 1) / denominator : filledFields / denominator;
    
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [incidentType, chiefComplaint, contactNo, personsInvolved, locationText, responderId]);

  // Photo animation
  useEffect(() => {
    if (photoUri) {
      Animated.spring(photoScale, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      photoScale.setValue(0);
    }
  }, [photoUri]);

  useEffect(() => {
    (async () => {
      const list = await listResponders();
      setResponders(list.map(r => ({ id: r.id, name: r.name })));
      if (list.length) setResponderId(list[0].id);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setLocationText(`${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`);
      }

      // Prefill reporter info depending on origin
      const me = await getCurrentUser();
      if (isAnonymous) {
        setFullName('Anonymous');
      } else if (me) {
        if (me.name) setFullName(me.name);
        if (me.phone && !contactNo) setContactNo(me.phone);
      }
    })();
  }, []);

  const captureImage = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to capture a photo.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
    if (!res.canceled) setPhotoUri(res.assets[0].uri);
  };

  const onSubmit = async () => {
    // Button press animation
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

    if (!incidentType || !chiefComplaint || !contactNo || !personsInvolved || !locationText || !responderId) {
      return Alert.alert('Missing fields', 'Please complete all required fields');
    }
    try {
      setLoading(true);
      const user = await getCurrentUser();
      const userId = isAnonymous ? undefined : user?.id;
      await createReport({
        type: incidentType,
        description, // optional
        location: locationText,
        photoUri, // optional
        responderId,
        userId,
        fullName: fullName || undefined,
        contactNo,
        chiefComplaint,
        personsInvolved,
      });
      Alert.alert('Submitted', 'Your report has been submitted');
      if (userId) navigation.reset({ index: 0, routes: [{ name: 'UserDashboard' }] });
      else navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleResponderPress = (id: string) => {
    // Responder button animation
    const scaleAnim = new Animated.Value(1);
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
    setResponderId(id);
  };

  const getIncidentIcon = (type: string) => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('fire')) return '🔥';
    if (lowerType.includes('medical') || lowerType.includes('health')) return '🏥';
    if (lowerType.includes('theft') || lowerType.includes('crime')) return '🚨';
    if (lowerType.includes('accident') || lowerType.includes('crash')) return '🚗';
    if (lowerType.includes('flood') || lowerType.includes('water')) return '🌊';
    return '⚠️';
  };

  return (
    <View style={styles.container}>
      <View style={styles.backgroundPattern} />
      
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Animated Title */}
        <Animated.View 
          style={[
            styles.titleContainer, 
            { 
              transform: [
                { scale: titleScale },
                { scale: isAnonymous ? pulseAnim : 1 }
              ] 
            }
          ]}
        >
          <View style={styles.titleHeader}>
            <Text style={styles.title}>
              {isAnonymous ? '🚨 Anonymous Report' : '📋 Report Incident'}
            </Text>
            {isAnonymous && <View style={styles.anonymousBadge} />}
          </View>
          <Text style={styles.subtitle}>Help us respond to your emergency</Text>
        </Animated.View>

        {/* Progress Bar */}
        <Animated.View
          style={[
            styles.progressContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text style={styles.progressLabel}>Report Progress</Text>
          <View style={styles.progressBar}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        </Animated.View>

        {/* Form Fields */}
        <View style={styles.formContainer}>
          {/* Full Name (Optional) */}
          <Animated.View style={{ transform: [{ scale: inputAnimations[0] }] }}>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>👤 Full Name (optional)</Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your full name"
                editable={!isAnonymous}
                selectTextOnFocus={!isAnonymous}
                style={[styles.input, fullName.length > 0 && styles.inputFilled, isAnonymous && styles.inputDisabled]}
                placeholderTextColor="#999"
              />
              {fullName.length > 0 && (
                <View style={styles.inputSuccess}>
                  <Text style={styles.successIcon}>✓</Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Incident Type */}
          <Animated.View style={{ transform: [{ scale: inputAnimations[1] }] }}>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>
                {incidentType ? getIncidentIcon(incidentType) : '⚠️'} Incident Type
              </Text>
              <TextInput
                value={incidentType}
                onChangeText={setIncidentType}
                placeholder="e.g., Fire, Medical Emergency, Theft"
                style={[styles.input, incidentType.length > 0 && styles.inputFilled]}
                placeholderTextColor="#999"
              />
              {incidentType.length > 0 && (
                <View style={styles.inputSuccess}>
                  <Text style={styles.successIcon}>✓</Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Contact No. */}
          <Animated.View style={{ transform: [{ scale: inputAnimations[2] }] }}>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>📞 Contact No.</Text>
              <TextInput
                value={contactNo}
                onChangeText={setContactNo}
                placeholder="Active phone number"
                keyboardType="phone-pad"
                style={[styles.input, contactNo.length > 0 && styles.inputFilled]}
                placeholderTextColor="#999"
              />
              {contactNo.length > 0 && (
                <View style={styles.inputSuccess}>
                  <Text style={styles.successIcon}>✓</Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Chief Complaint */}
          <Animated.View style={{ transform: [{ scale: inputAnimations[3] }] }}>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>🆘 Chief Complaint</Text>
              <TextInput
                value={chiefComplaint}
                onChangeText={setChiefComplaint}
                placeholder="Primary issue (e.g., severe chest pain)"
                style={[styles.input, chiefComplaint.length > 0 && styles.inputFilled]}
                placeholderTextColor="#999"
              />
              {chiefComplaint.length > 0 && (
                <View style={styles.inputSuccess}>
                  <Text style={styles.successIcon}>✓</Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Persons Involved */}
          <Animated.View style={{ transform: [{ scale: inputAnimations[4] }] }}>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>👥 Persons Involved</Text>
              <TextInput
                value={personsInvolved}
                onChangeText={setPersonsInvolved}
                placeholder="Names/number of persons involved"
                style={[styles.input, personsInvolved.length > 0 && styles.inputFilled]}
                placeholderTextColor="#999"
              />
              {personsInvolved.length > 0 && (
                <View style={styles.inputSuccess}>
                  <Text style={styles.successIcon}>✓</Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Description (Optional) */}
          <Animated.View style={{ transform: [{ scale: inputAnimations[5] }] }}>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>📝 Description (optional)</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the incident in detail..."
                style={[styles.input, styles.textArea, description.length > 0 && styles.inputFilled]}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                placeholderTextColor="#999"
              />
              {description.length > 0 && (
                <View style={[styles.inputSuccess, { top: 32 }] }>
                  <Text style={styles.successIcon}>✓</Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Location */}
          <Animated.View style={{ transform: [{ scale: inputAnimations[6] }] }}>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>📍 Location</Text>
              <TextInput
                value={locationText}
                onChangeText={setLocationText}
                placeholder="GPS coordinates or address"
                style={[styles.input, locationText.length > 0 && styles.inputFilled]}
                placeholderTextColor="#999"
              />
              {locationText.length > 0 && (
                <View style={styles.inputSuccess}>
                  <Text style={styles.successIcon}>✓</Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Photo Upload */}
          <Animated.View style={{ transform: [{ scale: inputAnimations[7] }] }}>
            <View style={styles.photoContainer}>
              <TouchableOpacity 
                style={styles.photoButton} 
                onPress={captureImage}
                activeOpacity={0.8}
              >
                <Text style={styles.photoButtonText}>📷 Capture Photo</Text>
                <Text style={styles.photoButtonSubtext}>Optional evidence (real-time)</Text>
              </TouchableOpacity>
              
              {photoUri && (
                <Animated.View style={[styles.photoPreview, { transform: [{ scale: photoScale }] }]}>
                  <Image source={{ uri: photoUri }} style={styles.photoImage} />
                  <TouchableOpacity 
                    style={styles.photoRemove}
                    onPress={() => setPhotoUri(undefined)}
                  >
                    <Text style={styles.photoRemoveText}>✕</Text>
                  </TouchableOpacity>
                </Animated.View>
              )}
            </View>
          </Animated.View>
        </View>

        {/* Responder Selection */}
        <Animated.View
          style={[
            styles.responderContainer,
            {
              opacity: responderAnim,
              transform: [{ scale: responderAnim }],
            },
          ]}
        >
          <Text style={styles.sectionTitle}>🚑 Select Emergency Responder</Text>
          <View style={styles.responderGrid}>
            {responders.map((r, index) => (
              <TouchableOpacity
                key={r.id}
                style={[
                  styles.responderBtn,
                  responderId === r.id && styles.responderBtnActive
                ]}
                onPress={() => handleResponderPress(r.id)}
                activeOpacity={0.8}
              >
                <View style={styles.responderContent}>
                  <Text style={styles.responderIcon}>👨‍⚕️</Text>
                  <Text style={[
                    styles.responderName,
                    responderId === r.id && styles.responderNameActive
                  ]}>
                    {r.name}
                  </Text>
                  {responderId === r.id && (
                    <View style={styles.responderCheck}>
                      <Text style={styles.responderCheckIcon}>✓</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* Submit Button */}
        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <TouchableOpacity
            style={[
              styles.submitBtn,
              loading && styles.submitBtnDisabled,
              (incidentType && chiefComplaint && contactNo && personsInvolved && locationText && responderId) && styles.submitBtnReady
            ]}
            onPress={onSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            <View style={styles.buttonContent}>
              <Text style={styles.submitBtnText}>
                {loading ? '📤 Submitting Report...' : '🚀 Submit Emergency Report'}
              </Text>
              {!loading && (incidentType && chiefComplaint && contactNo && personsInvolved && locationText && responderId) && (
                <View style={styles.buttonGlow} />
              )}
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Emergency Note */}
        {isAnonymous && (
          <Animated.View style={[styles.emergencyNote, { opacity: fadeAnim }]}>
            <Text style={styles.emergencyNoteText}>
              🔒 Your identity will remain anonymous. Emergency responders will be notified immediately.
            </Text>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  backgroundPattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#d90429',
    opacity: 0.05,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 24,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  titleHeader: {
    position: 'relative',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    color: '#a0a0a0',
    textAlign: 'center',
    marginTop: 4,
  },
  anonymousBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#d90429',
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressLabel: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 8,
    fontWeight: '600',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#d90429',
    borderRadius: 3,
  },
  formContainer: {
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 20,
    position: 'relative',
  },
  inputLabel: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#1a1a2e',
    color: '#fff',
    paddingRight: 50,
  },
  inputFilled: {
    borderColor: '#d90429',
  },
  inputDisabled: {
    opacity: 0.6,
  },
  textArea: {
    height: 100,
    paddingTop: 12,
  },
  inputSuccess: {
    position: 'absolute',
    right: 16,
    top: 40,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#00ff88',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIcon: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 12,
  },
  photoContainer: {
    marginBottom: 20,
  },
  photoButton: {
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 8,
    padding: 16,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  photoButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  photoButtonSubtext: {
    color: '#999',
    fontSize: 12,
  },
  photoPreview: {
    marginTop: 12,
    position: 'relative',
    alignSelf: 'flex-start',
  },
  photoImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#d90429',
  },
  photoRemove: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#d90429',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  responderContainer: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '700',
    marginBottom: 16,
  },
  responderGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  responderBtn: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: '#333',
    borderRadius: 8,
    backgroundColor: '#1a1a2e',
    position: 'relative',
  },
  responderBtnActive: {
    borderColor: '#d90429',
    backgroundColor: '#2a0f14',
  },
  responderContent: {
    alignItems: 'center',
  },
  responderIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  responderName: {
    color: '#999',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  responderNameActive: {
    color: '#d90429',
  },
  responderCheck: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#00ff88',
    alignItems: 'center',
    justifyContent: 'center',
  },
  responderCheckIcon: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  submitBtn: {
    backgroundColor: '#d90429',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#d90429',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    marginBottom: 16,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnReady: {
    backgroundColor: '#00ff88',
    shadowColor: '#00ff88',
  },
  buttonContent: {
    position: 'relative',
  },
  submitBtnText: {
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
  emergencyNote: {
    backgroundColor: 'rgba(217, 4, 41, 0.1)',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#d90429',
  },
  emergencyNoteText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});