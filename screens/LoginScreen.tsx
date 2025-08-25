import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, Animated, Dimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { login } from '../utils/auth';

export type LoginProps = NativeStackScreenProps<RootStackParamList, 'Login'>;

const { width } = Dimensions.get('window');

export default function LoginScreen({ navigation }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const titleScale = useRef(new Animated.Value(0.8)).current;
  const inputScale1 = useRef(new Animated.Value(0.9)).current;
  const inputScale2 = useRef(new Animated.Value(0.9)).current;
  const buttonScale = useRef(new Animated.Value(0.9)).current;
  const linkScale = useRef(new Animated.Value(0.9)).current;

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
      // Staggered form elements
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

  const onLogin = async () => {
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

    try {
      setLoading(true);
      const acc = await login(email.trim(), password);
      if (acc.role === 'admin') navigation.reset({ index: 0, routes: [{ name: 'AdminDashboard' }] });
      else if (acc.role === 'responder') navigation.reset({ index: 0, routes: [{ name: 'ResponderDashboard' }] });
      else navigation.reset({ index: 0, routes: [{ name: 'UserDashboard' }] });
    } catch (e: any) {
      Alert.alert('Login failed', e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };


  return (
    <View style={styles.container}>
      <View style={styles.backgroundPattern} />
      
      {/* Animated Title */}
      <Animated.View style={[styles.titleContainer, { transform: [{ scale: titleScale }] }]}>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>
      </Animated.View>

      {/* Role selection removed: role is auto-detected after login */}

      {/* Animated Form */}
      <View style={styles.formContainer}>
        <Animated.View style={{ transform: [{ scale: inputScale1 }] }}>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>📧 Email</Text>
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
        </Animated.View>

        <Animated.View style={{ transform: [{ scale: inputScale2 }] }}>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>🔒 Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry
              style={styles.input}
              placeholderTextColor="#999"
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
                {loading ? '🔄 Logging in...' : '🚀 Login'}
              </Text>
              {!loading && <View style={styles.buttonGlow} />}
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Animated Links */}
      <Animated.View style={[styles.linksContainer, { transform: [{ scale: linkScale }] }]}>
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => navigation.navigate('Report', { anonymous: true })}
          activeOpacity={0.7}
        >
          <Text style={styles.linkText}>🚨 Report as Anonymous</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => navigation.navigate('Signup')}
          activeOpacity={0.7}
        >
          <Text style={styles.linkText}>✨ Signup (Regular Users)</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#0f0f23',
    justifyContent: 'center',
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
    color: '#667eea',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 16,
  },
});