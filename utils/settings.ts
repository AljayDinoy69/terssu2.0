import AsyncStorage from '@react-native-async-storage/async-storage';

const SOUND_PREF_KEY = 'notificationSoundEnabled';
const THEME_PREF_KEY = 'appTheme'; // 'system' | 'light' | 'dark'
const NOTIF_FREQ_KEY = 'notificationFrequency'; // 'off' | 'low' | 'normal' | 'high'
const RINGTONE_KEY = 'notificationRingtoneKey'; // e.g., 'ring1'

export type AppTheme = 'system' | 'light' | 'dark';
export type NotificationFrequency = 'off' | 'low' | 'normal' | 'high';

export async function isSoundEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(SOUND_PREF_KEY);
    if (v === null) return true; // default ON
    return v === 'true';
  } catch {
    return true;
  }
}

export async function setSoundEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(SOUND_PREF_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
}

export async function getAppTheme(): Promise<AppTheme> {
  try {
    const v = await AsyncStorage.getItem(THEME_PREF_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
    return 'system';
  } catch {
    return 'system';
  }
}

export async function setAppTheme(theme: AppTheme): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_PREF_KEY, theme);
  } catch {
    // ignore
  }
}

export async function getNotificationFrequency(): Promise<NotificationFrequency> {
  try {
    const v = await AsyncStorage.getItem(NOTIF_FREQ_KEY);
    if (v === 'off' || v === 'low' || v === 'normal' || v === 'high') return v;
    return 'normal';
  } catch {
    return 'normal';
  }
}

export async function setNotificationFrequency(freq: NotificationFrequency): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIF_FREQ_KEY, freq);
  } catch {
    // ignore
  }
}

export async function getSelectedRingtoneKey(): Promise<string> {
  try {
    const v = await AsyncStorage.getItem(RINGTONE_KEY);
    return v || 'ring1';
  } catch {
    return 'ring1';
  }
}

export async function setSelectedRingtoneKey(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(RINGTONE_KEY, key);
  } catch {
    // ignore
  }
}
