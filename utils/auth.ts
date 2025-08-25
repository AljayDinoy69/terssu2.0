import AsyncStorage from '@react-native-async-storage/async-storage';

export type Role = 'user' | 'responder' | 'admin';

export type Account = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  password: string; // plain for mock only
};

export type ReportStatus = 'Pending' | 'In-progress' | 'Resolved';

export type Report = {
  id: string;
  type: string;
  description: string;
  location: string;
  photoUri?: string;
  userId?: string; // undefined when anonymous
  responderId: string;
  status: ReportStatus;
  createdAt: number;
  // Additional optional metadata
  fullName?: string;
  contactNo?: string;
  chiefComplaint?: string;
  personsInvolved?: string;
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
  await ensureSeed();
  const accounts: Account[] = JSON.parse((await AsyncStorage.getItem(KEYS.accounts)) || '[]');
  if (accounts.find(a => a.email.toLowerCase() === email.toLowerCase())) throw new Error('Email already exists');
  const acc: Account = { id: uid('usr'), name, email, phone, role: 'user', password };
  accounts.push(acc);
  await AsyncStorage.setItem(KEYS.accounts, JSON.stringify(accounts));
  await AsyncStorage.setItem(KEYS.session, JSON.stringify({ id: acc.id }));
  return acc;
}

export async function login(email: string, password: string) {
  await ensureSeed();
  const accounts: Account[] = JSON.parse((await AsyncStorage.getItem(KEYS.accounts)) || '[]');
  const acc = accounts.find(a => a.email.toLowerCase() === email.toLowerCase() && a.password === password);
  if (!acc) throw new Error('Invalid email or password');
  await AsyncStorage.setItem(KEYS.session, JSON.stringify({ id: acc.id }));
  return acc;
}

export async function getCurrentUser(): Promise<Account | null> {
  await ensureSeed();
  const sess = JSON.parse((await AsyncStorage.getItem(KEYS.session)) || 'null');
  if (!sess?.id) return null;
  const accounts: Account[] = JSON.parse((await AsyncStorage.getItem(KEYS.accounts)) || '[]');
  return accounts.find(a => a.id === sess.id) || null;
}

export async function logout() {
  await AsyncStorage.removeItem(KEYS.session);
}

export async function listUsers() {
  await ensureSeed();
  const accounts: Account[] = JSON.parse((await AsyncStorage.getItem(KEYS.accounts)) || '[]');
  return accounts.filter(a => a.role !== 'admin');
}

export async function createResponder({ name, email, phone, password }: { name: string; email: string; phone: string; password: string; }) {
  await ensureSeed();
  const accounts: Account[] = JSON.parse((await AsyncStorage.getItem(KEYS.accounts)) || '[]');
  if (accounts.find(a => a.email.toLowerCase() === email.toLowerCase())) throw new Error('Email already exists');
  const acc: Account = { id: uid('rsp'), name, email, phone, role: 'responder', password };
  accounts.push(acc);
  await AsyncStorage.setItem(KEYS.accounts, JSON.stringify(accounts));
  return acc;
}

// Admin-only: create a regular user without logging them in
export async function createUserAdmin({ name, email, phone, password }: { name: string; email: string; phone: string; password: string; }) {
  await ensureSeed();
  const accounts: Account[] = JSON.parse((await AsyncStorage.getItem(KEYS.accounts)) || '[]');
  if (accounts.find(a => a.email.toLowerCase() === email.toLowerCase())) throw new Error('Email already exists');
  const acc: Account = { id: uid('usr'), name, email, phone, role: 'user', password };
  accounts.push(acc);
  await AsyncStorage.setItem(KEYS.accounts, JSON.stringify(accounts));
  return acc;
}

export async function deleteAccount(id: string) {
  const accounts: Account[] = JSON.parse((await AsyncStorage.getItem(KEYS.accounts)) || '[]');
  const filtered = accounts.filter(a => a.id !== id);
  await AsyncStorage.setItem(KEYS.accounts, JSON.stringify(filtered));
}

export async function updateAccount(id: string, patch: Partial<Omit<Account, 'id'>> & { role?: Role }) {
  const accounts: Account[] = JSON.parse((await AsyncStorage.getItem(KEYS.accounts)) || '[]');
  const idx = accounts.findIndex(a => a.id === id);
  if (idx === -1) throw new Error('Account not found');
  // Prevent removing admin role from the default admin accidentally
  const current = accounts[idx];
  const updated: Account = {
    ...current,
    ...patch,
    id: current.id,
  };
  accounts[idx] = updated;
  await AsyncStorage.setItem(KEYS.accounts, JSON.stringify(accounts));
  return updated;
}

export async function listResponders() {
  const accounts: Account[] = JSON.parse((await AsyncStorage.getItem(KEYS.accounts)) || '[]');
  return accounts.filter(a => a.role === 'responder');
}

export async function createReport(input: Omit<Report, 'id' | 'status' | 'createdAt'>) {
  await ensureSeed();
  const reports: Report[] = JSON.parse((await AsyncStorage.getItem(KEYS.reports)) || '[]');
  const report: Report = { id: uid('rpt'), status: 'Pending', createdAt: Date.now(), ...input };
  reports.unshift(report);
  await AsyncStorage.setItem(KEYS.reports, JSON.stringify(reports));
  return report;
}

export async function listReportsByUser(userId: string) {
  const reports: Report[] = JSON.parse((await AsyncStorage.getItem(KEYS.reports)) || '[]');
  return reports.filter(r => r.userId === userId);
}

export async function listAssignedReports(responderId: string) {
  const reports: Report[] = JSON.parse((await AsyncStorage.getItem(KEYS.reports)) || '[]');
  return reports.filter(r => r.responderId === responderId);
}

export async function updateReportStatus(reportId: string, status: ReportStatus) {
  const reports: Report[] = JSON.parse((await AsyncStorage.getItem(KEYS.reports)) || '[]');
  const idx = reports.findIndex(r => r.id === reportId);
  if (idx >= 0) {
    reports[idx].status = status;
    await AsyncStorage.setItem(KEYS.reports, JSON.stringify(reports));
    return reports[idx];
  }
  throw new Error('Report not found');
}

export async function listAllReports() {
  const reports: Report[] = JSON.parse((await AsyncStorage.getItem(KEYS.reports)) || '[]');
  return reports;
}
