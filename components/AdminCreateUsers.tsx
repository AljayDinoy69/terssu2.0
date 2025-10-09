import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Animated, ScrollView } from 'react-native';
import { TextInput } from 'react-native';
import { PasswordInput } from './PasswordInput';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { createResponder, createUserAdmin, getCurrentUser } from '../utils/auth';

export type AdminCreateUsersProps = NativeStackScreenProps<RootStackParamList, 'AdminCreateUsers'>;

export default function AdminCreateUsers({ navigation }: AdminCreateUsersProps) {
  const [roleTab, setRoleTab] = useState<'user' | 'responder'>('user');
  const [userForm, setUserForm] = useState({ name: '', email: '', phone: '', password: 'password123' });
  const [respForm, setRespForm] = useState({ name: '', email: '', phone: '', password: 'responder123' });
  const [loading, setLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const tabScale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    (async () => {
      const me = await getCurrentUser();
      if (!me || me.role !== 'admin') {
        navigation.replace('Login');
        return;
      }
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    })();
  }, [navigation]);

  const onCreateUser = async () => {
    if (!userForm.name || !userForm.email || !userForm.phone) return Alert.alert('Missing fields');
    try {
      setLoading(true);
      await createUserAdmin(userForm);
      Alert.alert('Success', 'Regular user account created');
      setUserForm({ name: '', email: '', phone: '', password: 'password123' });
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const onCreateResponder = async () => {
    if (!respForm.name || !respForm.email || !respForm.phone) return Alert.alert('Missing fields');
    try {
      setLoading(true);
      await createResponder(respForm);
      Alert.alert('Success', 'Responder account created');
      setRespForm({ name: '', email: '', phone: '', password: 'responder123' });
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.tabBar, { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: tabScale }] }]}>
        <TouchableOpacity style={[styles.tab, roleTab === 'user' && styles.tabActive]} onPress={() => setRoleTab('user')}>
          <Text style={[styles.tabText, roleTab === 'user' && styles.tabTextActive]}>Regular User</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, roleTab === 'responder' && styles.tabActive]} onPress={() => setRoleTab('responder')}>
          <Text style={[styles.tabText, roleTab === 'responder' && styles.tabTextActive]}>Responder</Text>
        </TouchableOpacity>
      </Animated.View>

      <ScrollView style={styles.content} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
        {roleTab === 'user' ? (
          <View>
            <Text style={styles.sectionTitle}>Create Regular User</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput style={styles.input} placeholder="Name" placeholderTextColor="#999" value={userForm.name} onChangeText={(v)=>setUserForm(p=>({...p,name:v}))} />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#999" autoCapitalize="none" keyboardType="email-address" value={userForm.email} onChangeText={(v)=>setUserForm(p=>({...p,email:v}))} />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone</Text>
              <TextInput style={styles.input} placeholder="Phone" placeholderTextColor="#999" keyboardType="phone-pad" value={userForm.phone} onChangeText={(v)=>setUserForm(p=>({...p,phone:v}))} />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Temp Password</Text>
              <PasswordInput
                value={userForm.password}
                onChangeText={(v) => setUserForm(p => ({ ...p, password: v }))}
                placeholder="Password"
                style={styles.input}
              />
            </View>
            <TouchableOpacity style={[styles.primaryBtn, loading && { opacity: 0.7 }]} onPress={onCreateUser} disabled={loading}>
              <Text style={styles.primaryBtnText}>Create User</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <Text style={styles.sectionTitle}>Create Responder</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput style={styles.input} placeholder="Name" placeholderTextColor="#999" value={respForm.name} onChangeText={(v)=>setRespForm(p=>({...p,name:v}))} />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#999" autoCapitalize="none" keyboardType="email-address" value={respForm.email} onChangeText={(v)=>setRespForm(p=>({...p,email:v}))} />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone</Text>
              <TextInput style={styles.input} placeholder="Phone" placeholderTextColor="#999" keyboardType="phone-pad" value={respForm.phone} onChangeText={(v)=>setRespForm(p=>({...p,phone:v}))} />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Temp Password</Text>
              <PasswordInput
                value={respForm.password}
                onChangeText={(v) => setRespForm(p => ({ ...p, password: v }))}
                placeholder="Password"
                style={styles.input}
              />
            </View>
            <TouchableOpacity style={[styles.primaryBtn, loading && { opacity: 0.7 }]} onPress={onCreateResponder} disabled={loading}>
              <Text style={styles.primaryBtnText}>Create Responder</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  tabBar: { flexDirection: 'row', margin: 16, backgroundColor: '#1a1a2e', borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#333' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { backgroundColor: '#2a2a3e' },
  tabText: { color: '#999', fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  content: { flex: 1 },
  sectionTitle: { color: '#fff', fontWeight: '800', fontSize: 16, marginBottom: 12 },
  inputGroup: { marginBottom: 12 },
  label: { color: '#fff', marginBottom: 6 },
  input: { borderWidth: 2, borderColor: '#333', borderRadius: 8, padding: 12, color: '#fff', backgroundColor: '#1a1a2e' },
  primaryBtn: { backgroundColor: '#667eea', padding: 12, borderRadius: 8, marginTop: 8 },
  primaryBtnText: { color: '#fff', textAlign: 'center', fontWeight: '700' },
});
