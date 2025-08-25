import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Animated, Dimensions, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

export type HomeProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

const { width } = Dimensions.get('window');

export default function HomeScreen({ navigation }: HomeProps) {
  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoRotate = useRef(new Animated.Value(0)).current;
  const buttonScale1 = useRef(new Animated.Value(0.9)).current;
  const buttonScale2 = useRef(new Animated.Value(0.9)).current;
  const buttonScale3 = useRef(new Animated.Value(0.9)).current;

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
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Background gradient effect */}
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backgroundGradient}
      />
      
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
        <Image source={require('../assets/icon.png')} style={styles.logo} />
        <View style={styles.logoGlow} />
      </Animated.View>

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

      {/* Animated buttons */}
      <View style={styles.buttonContainer}>
        <Animated.View style={{ transform: [{ scale: buttonScale1 }] }}>
          <TouchableOpacity
            style={[styles.primaryBtn, styles.buttonShadow]}
            onPress={() => handleButtonPress(buttonScale1, () => navigation.navigate('Report', { anonymous: true }))}
            activeOpacity={0.8}
          >
            <View style={styles.buttonContent}>
              <Text style={styles.btnText}>🚨 Report as Anonymous</Text>
              <View style={styles.buttonHighlight} />
            </View>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={{ transform: [{ scale: buttonScale2 }] }}>
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.buttonShadow]}
            onPress={() => handleButtonPress(buttonScale2, () => navigation.navigate('Login'))}
            activeOpacity={0.8}
          >
            <View style={styles.buttonContent}>
              <Text style={styles.btnText}>👤 Login</Text>
              <View style={styles.buttonHighlight} />
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
              <Text style={styles.btnText}>✨ Signup</Text>
              <View style={styles.buttonHighlight} />
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>
      {/* Info Cards */}
      <View style={styles.infoCards}>
        <View style={[styles.infoCard, styles.cardShadow]}>
          <Text style={styles.infoIcon}>🕒</Text>
          <View style={styles.infoTextWrap}>
            <Text style={styles.infoTitle}>24/7 Availability</Text>
            <Text style={styles.infoDesc}>Report incidents anytime, anywhere with reliable uptime.</Text>
          </View>
        </View>

        <View style={[styles.infoCard, styles.cardShadow]}>
          <Text style={styles.infoIcon}>📍</Text>
          <View style={styles.infoTextWrap}>
            <Text style={styles.infoTitle}>Accurate Geolocation</Text>
            <Text style={styles.infoDesc}>Share precise location to speed up emergency response.</Text>
          </View>
        </View>

        <View style={[styles.infoCard, styles.cardShadow]}>
          <Text style={styles.infoIcon}>🔒</Text>
          <View style={styles.infoTextWrap}>
            <Text style={styles.infoTitle}>Privacy First</Text>
            <Text style={styles.infoDesc}>Report anonymously or securely with your account.</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0f0f23',
  },
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
    marginBottom: 32,
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
    color: '#a0a0a0',
    marginBottom: 48,
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
    backgroundColor: 'transparent',
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
  infoIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  infoTextWrap: {
    flex: 1,
  },
  infoTitle: {
    color: '#ffffff',
    fontSize: 14,
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