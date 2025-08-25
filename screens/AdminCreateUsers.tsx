import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, Animated, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { createResponder, createUserAdmin, getCurrentUser, listUsers, deleteAccount, updateAccount, Account } from '../utils/auth';

export type AdminCreateUsersProps = NativeStackScreenProps<RootStackParamList, 'AdminCreateUsers'>;

export default function AdminCreateUsers({ navigation }: AdminCreateUsersProps) {
  const [roleTab, setRoleTab] = useState<'user' | 'responder'>('user');
  const [userForm, setUserForm] = useState({ name: '', email: '', phone: '', password: 'password123' });
  const [respForm, setRespForm] = useState({ name: '', email: '', phone: '', password: 'responder123' });
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<Account[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; email: string; phone?: string; password?: string }>({ name: '', email: '', phone: '', password: '' });

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
      await loadUsers();
    })();
    const unsub = navigation.addListener('focus', loadUsers);
    return unsub;
  }, [navigation]);

  const loadUsers = async () => {
    const list = await listUsers();
    // Show responders and users, exclude admins from this screen
    setUsers(list);
  };

  const onCreateUser = async () => {
    if (!userForm.name || !userForm.email || !userForm.phone) return Alert.alert('Missing fields');
    try {
      setLoading(true);
      await createUserAdmin(userForm);
      Alert.alert('Success', 'Regular user account created');
      setUserForm({ name: '', email: '', phone: '', password: 'password123' });
      await loadUsers();
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
      await loadUsers();
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const onStartEdit = (u: Account) => {
    setEditingId(u.id);
    setEditForm({ name: u.name, email: u.email, phone: u.phone || '', password: '' });
  };

  const onCancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: '', email: '', phone: '', password: '' });
  };

  const onSaveEdit = async () => {
    if (!editingId) return;
    if (!editForm.name || !editForm.email) return Alert.alert('Missing fields');
    try {
      setLoading(true);
      await updateAccount(editingId, {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone,
        ...(editForm.password ? { password: editForm.password } : {}),
      });
      Alert.alert('Saved', 'Account updated');
      await loadUsers();
      onCancelEdit();
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async (id: string) => {
    Alert.alert('Delete Account', 'Are you sure you want to delete this account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          setLoading(true);
          await deleteAccount(id);
          await loadUsers();
          Alert.alert('Deleted', 'Account removed');
        } catch (e: any) {
          Alert.alert('Failed', e.message || 'Unknown error');
        } finally {
          setLoading(false);
        }
      }}
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Create Users</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.headerBtnText}>Back</Text>
        </TouchableOpacity>
      </View>

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
              <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#999" secureTextEntry value={userForm.password} onChangeText={(v)=>setUserForm(p=>({...p,password:v}))} />
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
              <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#999" secureTextEntry value={respForm.password} onChangeText={(v)=>setRespForm(p=>({...p,password:v}))} />
            </View>
            <TouchableOpacity style={[styles.primaryBtn, loading && { opacity: 0.7 }]} onPress={onCreateResponder} disabled={loading}>
              <Text style={styles.primaryBtnText}>Create Responder</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Manage Accounts</Text>

        {users.length === 0 ? (
          <Text style={styles.emptyText}>No users or responders yet.</Text>
        ) : (
          <View>
            {users.map(u => (
              <View key={u.id} style={styles.userCard}>
                {editingId === u.id ? (
                  <View>
                    <Text style={styles.userRole}>{u.role.toUpperCase()}</Text>
                    <View style={styles.row}>
                      <Text style={styles.userLabel}>Name</Text>
                      <TextInput style={styles.userInput} value={editForm.name} onChangeText={(v)=>setEditForm(p=>({...p,name:v}))} />
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.userLabel}>Email</Text>
                      <TextInput style={styles.userInput} autoCapitalize="none" keyboardType="email-address" value={editForm.email} onChangeText={(v)=>setEditForm(p=>({...p,email:v}))} />
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.userLabel}>Phone</Text>
                      <TextInput style={styles.userInput} keyboardType="phone-pad" value={editForm.phone} onChangeText={(v)=>setEditForm(p=>({...p,phone:v}))} />
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.userLabel}>Password</Text>
                      <TextInput style={styles.userInput} placeholder="Leave blank to keep" placeholderTextColor="#999" secureTextEntry value={editForm.password} onChangeText={(v)=>setEditForm(p=>({...p,password:v}))} />
                    </View>
                    <View style={styles.btnRow}>
                      <TouchableOpacity style={[styles.smallBtn, styles.btnSecondary]} onPress={onCancelEdit}>
                        <Text style={styles.smallBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallBtn, styles.btnPrimary, loading && { opacity: 0.7 }]} onPress={onSaveEdit} disabled={loading}>
                        <Text style={styles.smallBtnText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View>
                    <View style={styles.userHeader}>
                      <Text style={styles.userName}>{u.name}</Text>
                      <Text style={styles.userRole}>{u.role.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.userMeta}>📧 {u.email}</Text>
                    {!!u.phone && <Text style={styles.userMeta}>📞 {u.phone}</Text>}
                    <View style={styles.btnRow}>
                      <TouchableOpacity style={[styles.smallBtn, styles.btnSecondary]} onPress={() => onStartEdit(u)}>
                        <Text style={styles.smallBtnText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.smallBtn, styles.btnDanger]} onPress={() => onDelete(u.id)}>
                        <Text style={styles.smallBtnText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#1a1a2e' },
  title: { fontSize: 18, fontWeight: '800', color: '#fff', flex: 1 },
  headerBtn: { backgroundColor: '#2b2d42', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 },
  headerBtnText: { color: '#fff' },
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
  divider: { height: 1, backgroundColor: '#333', marginVertical: 16 },
  emptyText: { color: '#999', marginBottom: 8 },
  userCard: { backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: '#333', borderRadius: 10, padding: 12, marginBottom: 12 },
  userHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  userName: { color: '#fff', fontWeight: '800', fontSize: 16 },
  userRole: { color: '#ffd166', fontWeight: '800' },
  userMeta: { color: '#cbd5e1', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  userLabel: { color: '#cbd5e1', width: 90 },
  userInput: { flex: 1, borderWidth: 2, borderColor: '#333', borderRadius: 8, padding: 10, color: '#fff', backgroundColor: '#111a2e' },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  smallBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  smallBtnText: { color: '#fff', fontWeight: '700' },
  btnPrimary: { backgroundColor: '#667eea' },
  btnSecondary: { backgroundColor: '#2b2f4a' },
  btnDanger: { backgroundColor: '#d90429' },
});
