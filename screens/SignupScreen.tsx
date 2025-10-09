import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ScrollView, Animated, Dimensions, TextInputProps, ImageBackground } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PasswordInput } from '../components/PasswordInput';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { signUpUser } from '../utils/auth';

export type SignupProps = NativeStackScreenProps<RootStackParamList, 'Signup'>;

const { width } = Dimensions.get('window');

export default function SignupScreen({ navigation }: SignupProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const titleScale = useRef(new Animated.Value(0.8)).current;
  const inputAnimations = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0.9))
  ).current;
  const buttonScale = useRef(new Animated.Value(0.9)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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
        Animated.spring(buttonScale, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  // Ensure back always goes to Home
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      const action: any = (e as any).data?.action;
      if (action?.type === 'GO_BACK') {
        e.preventDefault();
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      }
    });
    return unsub;
  }, [navigation]);

  // Update progress based on filled fields
  useEffect(() => {
    const filledFields = [name, email, phone, password, confirm].filter(field => field.length > 0).length;
    const progress = filledFields / 5;
    
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [name, email, phone, password, confirm]);

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

    if (!name || !email || !phone || !password) return Alert.alert('Missing fields', 'Please fill all fields');
    if (password !== confirm) return Alert.alert('Password mismatch', 'Passwords do not match');
    
    try {
      setLoading(true);
      await signUpUser({ name, email, password, phone });
      navigation.reset({ index: 0, routes: [{ name: 'UserDashboard' }] });
    } catch (e: any) {
      Alert.alert('Signup failed', e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const getFieldLabel = (index: number) => {
    const labels = ['Full Name', 'Email Address', 'Phone Number', 'Password', 'Confirm Password'];
    return labels[index];
  };

  const getPlaceholder = (index: number) => {
    const placeholders = [
      'Enter your full name',
      'Enter your email',
      'Enter your phone number',
      'Create a password',
      'Confirm your password'
    ];
    return placeholders[index];
  };

  // Strongly type the input definitions to keep literal unions for TextInput
  type InputDef = {
    value: string;
    onChange: React.Dispatch<React.SetStateAction<string>>;
    autoCapitalize?: TextInputProps['autoCapitalize'];
    keyboardType?: TextInputProps['keyboardType'];
    secureTextEntry?: boolean;
  };

  const inputProps: InputDef[] = [
    { value: name, onChange: setName, autoCapitalize: 'words' },
    { value: email, onChange: setEmail, autoCapitalize: 'none', keyboardType: 'email-address' },
    { value: phone, onChange: setPhone, keyboardType: 'phone-pad' },
    { value: password, onChange: setPassword, secureTextEntry: true },
    { value: confirm, onChange: setConfirm, secureTextEntry: true },
  ];

  return (
    <ImageBackground
      source={require('../assets/back-wall.jpg')}
      style={styles.bg}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBackButton}
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
            <Text style={styles.headerTitle}>Signup</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.container}>
          <View style={styles.backgroundPattern} />
        
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Animated Title */}
        <Animated.View style={[styles.titleContainer, { transform: [{ scale: titleScale }] }]}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join the Emergency Response System</Text>
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
          <Text style={styles.progressLabel}>Registration Progress</Text>
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

        {/* Animated Form */}
        <View style={styles.formContainer}>
          {inputProps.map((props, index) => (
            <Animated.View
              key={index}
              style={[
                styles.inputWrapper,
                { transform: [{ scale: inputAnimations[index] }] }
              ]}
            >
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>
                   {getFieldLabel(index)}
                </Text>
                {props.secureTextEntry ? (
                  <PasswordInput
                    value={props.value}
                    onChangeText={props.onChange}
                    placeholder={getPlaceholder(index)}
                    style={[
                      styles.passwordInputContainer,
                      props.value.length > 0 && styles.inputFilled
                    ]}
                    inputStyle={styles.passwordInputField}
                    darkMode
                    showSuccess={props.value.length > 0}
                  />
                ) : (
                  <TextInput
                    value={props.value}
                    onChangeText={props.onChange}
                    placeholder={getPlaceholder(index)}
                    style={[
                      styles.input,
                      props.value.length > 0 && styles.inputFilled
                    ]}
                    placeholderTextColor="#999"
                    autoCapitalize={props.autoCapitalize}
                    keyboardType={props.keyboardType}
                  />
                )}
                {!props.secureTextEntry && props.value.length > 0 && (
                  <View style={styles.inputSuccess}>
                    <Text style={styles.successIcon}>✓</Text>
                  </View>
                )}
              </View>
            </Animated.View>
          ))}

          {/* Password Strength Indicator */}
          {password.length > 0 && (
            <Animated.View style={styles.passwordStrength}>
              <Text style={styles.strengthLabel}>Password Strength:</Text>
              <View style={styles.strengthBars}>
                {[1, 2, 3, 4].map(level => (
                  <View
                    key={level}
                    style={[
                      styles.strengthBar,
                      password.length >= level * 2 && styles.strengthBarActive,
                      password.length >= 8 && level <= 4 && styles.strengthBarStrong,
                    ]}
                  />
                ))}
              </View>
            </Animated.View>
          )}

          {/* Submit Button */}
          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                loading && styles.primaryBtnDisabled,
                (name && email && phone && password && confirm && password === confirm) && styles.primaryBtnReady
              ]}
              onPress={onSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              <View style={styles.buttonContent}>
                <Text style={styles.btnText}>
                  {loading ? '⏳ Creating Account...' : ' Create Account'}
                </Text>
                {!loading && (name && email && phone && password && confirm && password === confirm) && (
                  <View style={styles.buttonGlow} />
                )}
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>
        
        {/* Go to Login Link */}
        <View style={styles.linksContainer}>
          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.7}
          >
            <Text style={styles.linkText}>
              Already have an account?{' '}
              <Text style={styles.linkHighlight}> Login</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* Terms */}
        <Animated.View
          style={[
            styles.termsContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text style={styles.termsText}>
            By creating an account, you agree to our Terms of Service and Privacy Policy
          </Text>
        </Animated.View>
        </ScrollView>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  headerBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 8,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  bg: {
    flex: 1,
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
  scrollContainer: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: '#a0a0a0',
    textAlign: 'center',
    marginTop: 4,
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
  inputWrapper: {
    marginBottom: 20,
  },
  inputContainer: {
    position: 'relative',
  },
  inputLabel: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    height: 50, 
  },
  inputFilled: {
    borderColor: '#d90429',
  },
  passwordInputContainer: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  passwordInputField: {
    color: '#fff',
    paddingVertical: 10,
  },
  inputSuccess: {
    position: 'absolute',
    right: 16,
    top: 32,
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
  passwordStrength: {
    marginBottom: 20,
  },
  strengthLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  strengthBars: {
    flexDirection: 'row',
    gap: 4,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
  },
  strengthBarActive: {
    backgroundColor: '#ff9800',
  },
  strengthBarStrong: {
    backgroundColor: '#00ff88',
  },
  primaryBtn: {
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
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnReady: {
    backgroundColor: '#00ff88',
    shadowColor: '#00ff88',
  },
  buttonContent: {
    position: 'relative',
  },
  btnText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 18,
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
  termsContainer: {
    alignItems: 'center',
    paddingTop: 16,
  },
  termsText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 18,
  },
  linksContainer: {
    alignItems: 'center',
  },
  linkBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  linkText: {
    color: '#ebebebff',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 16,
  },
  linkHighlight: {
    color: '#d90429',
    fontWeight: 'bold',
  },
}); 