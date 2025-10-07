import { Audio } from 'expo-av';
import { isSoundEnabled, getSelectedRingtoneKey } from './settings';
import { getRingtoneByKey } from './ringtones';

let sound: Audio.Sound | null = null;
let prepared = false;
let loadedKey: string | null = null;

async function prepare() {
  if (prepared) return;
  // Allow playback in silent mode on iOS and respect other sane defaults
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {}

  if (!sound) {
    sound = new Audio.Sound();
    try {
      const key = await getSelectedRingtoneKey();
      const rt = getRingtoneByKey(key);
      await sound.loadAsync(rt.module as any);
      loadedKey = key;
      prepared = true;
    } catch (e) {
      console.warn('Failed to load notification sound:', e);
      // Reset to allow retry next call
      try { await sound.unloadAsync(); } catch {}
      sound = null;
      prepared = false;
      loadedKey = null;
    }
  }
}

export async function playNotificationSound() {
  try {
    const enabled = await isSoundEnabled();
    if (!enabled) return;
    // Ensure correct ringtone is loaded
    const key = await getSelectedRingtoneKey();
    if (sound && loadedKey && loadedKey !== key) {
      try { await sound.unloadAsync(); } catch {}
      sound = null; prepared = false; loadedKey = null;
    }
    await prepare();
    if (!sound) return;
    try { await sound.setPositionAsync(0); } catch {}
    await sound.playAsync();
  } catch (e) {
    console.warn('Failed to play notification sound:', e);
  }
}

export async function unloadNotificationSound() {
  try {
    if (sound) {
      await sound.unloadAsync();
      sound = null;
      prepared = false;
      loadedKey = null;
    }
  } catch {}
}
