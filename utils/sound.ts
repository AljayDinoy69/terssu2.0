import { Audio } from 'expo-av';
import { isSoundEnabled } from './settings';

let sound: Audio.Sound | null = null;
let prepared = false;

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
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      await sound.loadAsync(require('../assets/sounds/ring1.mp3'));
      prepared = true;
    } catch (e) {
      console.warn('Failed to load notification sound:', e);
      // Reset to allow retry next call
      try { await sound.unloadAsync(); } catch {}
      sound = null;
      prepared = false;
    }
  }
}

export async function playNotificationSound() {
  try {
    const enabled = await isSoundEnabled();
    if (!enabled) return;
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
    }
  } catch {}
}
