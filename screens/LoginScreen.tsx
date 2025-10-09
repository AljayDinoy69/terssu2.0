import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, Animated, Dimensions, Image, ImageBackground, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PasswordInput } from '../components/PasswordInput';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { login } from '../utils/auth';

export type LoginProps = NativeStackScreenProps<RootStackParamList, 'Login'>;

const { width } = Dimensions.get('window');
export default function LoginScreen({ navigation }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [restrictModalVisible, setRestrictModalVisible] = useState(false);
  const [restrictMessage, setRestrictMessage] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const titleScale = useRef(new Animated.Value(0.8)).current;
  const inputScale1 = useRef(new Animated.Value(0.9)).current;
  const inputScale2 = useRef(new Animated.Value(0.9)).current;
  const buttonScale = useRef(new Animated.Value(0.9)).current;
  const linkScale = useRef(new Animated.Value(0.9)).current;

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(titleScale, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
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
      Animated.stagger(100, [
        Animated.spring(inputScale1, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.spring(inputScale2, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.spring(buttonScale, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.spring(linkScale, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      const action: any = (e as any).data?.action;
      if (action?.type === 'GO_BACK' || action?.type === 'POP') {
        e.preventDefault();
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      }
    });
    return unsub;
  }, [navigation]);

  const onLogin = async () => {
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

    try {
      setLoading(true);
      const acc = await login(email.trim(), password);
      if (acc.role === 'admin') navigation.reset({ index: 0, routes: [{ name: 'AdminDashboard' }] });
      else if (acc.role === 'responder') navigation.reset({ index: 0, routes: [{ name: 'ResponderDashboard' }] });
      else navigation.reset({ index: 0, routes: [{ name: 'UserDashboard' }] });
    } catch (e: any) {
      const msg = e?.message || 'Unknown error';
      if (msg.toLowerCase().includes('restricted')) {
        setRestrictMessage(msg);
        setRestrictModalVisible(true);
      } else {
        Alert.alert('Login failed', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require('../assets/back-wall.jpg')}
      style={styles.bg}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Modal
          visible={restrictModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRestrictModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Access Restricted</Text>
              <Text style={styles.modalBody}>{restrictMessage || 'Your account has been restricted by an administrator.'}</Text>
              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={styles.modalPrimaryBtn}
                  onPress={() => setRestrictModalVisible(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalPrimaryText}>Okay</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBackButton}
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
            <Text style={styles.headerTitle}>Login</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.container}>
          <View style={styles.backgroundPattern} />

          <Animated.View style={[styles.titleContainer, { transform: [{ scale: titleScale }] }]}>
            <Image source={require('../assets/icon.png')} style={styles.logo} />
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to continue</Text>
          </Animated.View>

          <View style={styles.formContainer}>
            <Animated.View style={{ transform: [{ scale: inputScale1 }] }}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Email</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Enter your email"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    style={styles.input}
                    placeholderTextColor="#999"
                  />
                </View>
              </View>
            </Animated.View>

            <Animated.View style={{ transform: [{ scale: inputScale2 }] }}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Password</Text>
                <PasswordInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  style={styles.inputWrapper}
                  inputStyle={styles.passwordInputField}
                />
              </View>
            </Animated.View>

            <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                onPress={onLogin}
                disabled={loading}
                activeOpacity={0.8}
              >
                <View style={styles.buttonContent}>
                  <Text style={styles.btnText}>
                    {loading ? 'Logging in...' : 'Login'}
                  </Text>
                  {!loading && <View style={styles.buttonGlow} />}
                </View>
              </TouchableOpacity>
            </Animated.View>
          </View>

          <Animated.View style={[styles.linksContainer, { transform: [{ scale: linkScale }] }]}>
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => navigation.replace('Signup')}
              activeOpacity={0.7}
            >
              <Text style={styles.linkText}>Dont have an account?
                <Text style={styles.linkHighlight}> Sign Up</Text>
              </Text>
            </TouchableOpacity>
          </Animated.View>
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
    padding: 24,
    paddingTop: 0,
    backgroundColor: 'transparent',
    justifyContent: 'center',
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
  titleContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 16,
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
  formContainer: {
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputWrapper: {
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(18, 18, 42, 0.75)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  inputLabel: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    borderWidth: 0,
    fontSize: 16,
    color: '#fff',
    paddingVertical: 10,
  },
  passwordInputField: {
    color: '#fff',
    paddingVertical: 10,
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
  linksContainer: {
    alignItems: 'center',
  },
  linkBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 12,
    width: '100%',
  },
  linkText: {
    color: '#ebebebff',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 16,
  },
  linkHighlight: {
    color: '#667eea',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#10152a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#2d3655',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 14,
    color: '#c9d1ff',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  modalPrimaryBtn: {
    backgroundColor: '#667eea',
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#8892f6',
  },
  modalPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});