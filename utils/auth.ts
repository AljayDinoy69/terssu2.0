import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

export type Role = 'user' | 'responder' | 'admin';

export type Account = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  password?: string; // optional: server does not return password
};

export type ReportStatus = 'Pending' | 'In-progress' | 'Resolved';

export type Report = {
  id: string;
  type: string;
  description: string;
  location: string;
  photoUri?: string;
  photoUrl?: string;
  userId?: string; // undefined when anonymous
  responderId: string;
  status: ReportStatus;
  createdAt: number | string;
  // Additional optional metadata
  fullName?: string;
  contactNo?: string;
  chiefComplaint?: string;
  personsInvolved?: string;
};

export type Notification = {
  id: string;
  userId: string;
  title: string;
  reportId?: string;
  kind: 'new' | 'update';
  read: boolean;
  createdAt?: string | number;
};

const KEYS = {
  accounts: 'ERS_ACCOUNTS',
  session: 'ERS_SESSION',
  reports: 'ERS_REPORTS',
};

const defaultAdmin: Account = {
  id: 'admin-1',
  name: 'System Admin',
  email: 'admin@ers.local',
  phone: '0000000000',
  role: 'admin',
  password: 'admin123',
};

async function ensureSeed() {
  const accStr = await AsyncStorage.getItem(KEYS.accounts);
  if (!accStr) {
    const seed: Account[] = [defaultAdmin];
    await AsyncStorage.setItem(KEYS.accounts, JSON.stringify(seed));
  } else {
    // Ensure default admin exists even if accounts were previously created
    const accounts: Account[] = JSON.parse(accStr);
    const hasAdmin = accounts.some(a => a.role === 'admin');
    if (!hasAdmin) {
      accounts.unshift(defaultAdmin);
      await AsyncStorage.setItem(KEYS.accounts, JSON.stringify(accounts));
    }
  }
  const repStr = await AsyncStorage.getItem(KEYS.reports);
  if (!repStr) await AsyncStorage.setItem(KEYS.reports, JSON.stringify([]));
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function signUpUser({ name, email, password, phone }: { name: string; email: string; password: string; phone: string; }) {
  // Use server API
  const { user } = await api.post<{ user: Account }>('/auth/signup', { name, email, password, phone });
  // Store session with full user for quick access
  await AsyncStorage.setItem(KEYS.session, JSON.stringify({ id: user.id, user }));
  return user;
}

export async function login(email: string, password: string) {
  // Use server API
  const { user } = await api.post<{ user: Account }>('/auth/login', { email, password });
  await AsyncStorage.setItem(KEYS.session, JSON.stringify({ id: user.id, user }));
  return user;
}

export async function getCurrentUser(): Promise<Account | null> {
  const sess = JSON.parse((await AsyncStorage.getItem(KEYS.session)) || 'null');
  if (sess?.user) return sess.user as Account;
  return null;
}

export async function logout() {
  await AsyncStorage.removeItem(KEYS.session);
}

export async function listUsers() {
  const { users } = await api.get<{ users: Account[] }>('/users');
  return users;
}

export async function createResponder({ name, email, phone, password }: { name: string; email: string; phone: string; password: string; }) {
  const { user } = await api.post<{ user: Account }>('/users', { name, email, phone, password, role: 'responder' });
  return user;
}

// Admin-only: create a regular user without logging them in
export async function createUserAdmin({ name, email, phone, password }: { name: string; email: string; phone: string; password: string; }) {
  const { user } = await api.post<{ user: Account }>('/users', { name, email, phone, password, role: 'user' });
  return user;
}

export async function deleteAccount(id: string) {
  await api.delete<void>(`/users/${id}`);
}

export async function updateAccount(id: string, patch: Partial<Omit<Account, 'id'>> & { role?: Role }) {
  const { user } = await api.patch<{ user: Account }>(`/users/${id}`, patch);
  return user;
}

export async function listResponders() {
  const { responders } = await api.get<{ responders: Account[] }>('/responders');
  return responders;
}

export async function createReport(input: Omit<Report, 'id' | 'status' | 'createdAt'>) {
  const { report } = await api.post<{ report: Report }>('/reports', input);
  return report;
}

export async function listReportsByUser(userId: string) {
  const { reports } = await api.get<{ reports: Report[] }>(`/reports/user/${userId}`);
  return reports;
}

export async function listAssignedReports(responderId: string) {
  const { reports } = await api.get<{ reports: Report[] }>(`/reports/responder/${responderId}`);
  return reports;
}

export async function updateReportStatus(reportId: string, status: ReportStatus) {
  const { report } = await api.patch<{ report: Report }>(`/reports/${reportId}/status`, { status });
  return report;
}

export async function listAllReports() {
  const { reports } = await api.get<{ reports: Report[] }>('/reports');
  return reports;
}

// Notifications
export async function listNotifications(userId: string) {
  const { notifications } = await api.get<{ notifications: Notification[] }>(`/notifications?userId=${encodeURIComponent(userId)}`);
  return notifications;
}

export async function markNotificationRead(id: string, read: boolean) {
  const { notification } = await api.patch<{ notification: Notification }>(`/notifications/${id}/read`, { read });
  return notification;
}

export async function deleteNotification(id: string) {
  await api.delete<void>(`/notifications/${id}`);
}

export async function markAllNotificationsRead(userId: string) {
  const res = await api.post<{ ok: boolean }>(`/notifications/mark-all-read`, { userId });
  return res.ok;
}
