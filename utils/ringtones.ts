export type Ringtone = {
  key: string; // e.g., 'ring1'
  label: string; // e.g., 'Ring 1'
  // Module reference for bundler
  module: number;
};

// Registry of bundled ringtones. To add more, place the mp3 in assets/sounds and add a line here.
// Note: React Native requires static require calls; dynamic scanning of a folder is not supported at runtime.
export const RINGTONES: Ringtone[] = [
  { key: 'ring1', label: 'Ring 1', module: require('../assets/sounds/ring1.mp3') },
  { key: 'ring2', label: 'Ring 2', module: require('../assets/sounds/ring2.mp3') },
  { key: 'ring3', label: 'Ring 3', module: require('../assets/sounds/ring3.mp3') },
  { key: 'ring4', label: 'Ring 4', module: require('../assets/sounds/ring4.mp3') },
  { key: 'ring5', label: 'Ring 5', module: require('../assets/sounds/ring5.mp3') },
];

export function getRingtones(): Ringtone[] {
  return RINGTONES;
}

export function getRingtoneByKey(key?: string | null): Ringtone {
  const fallback = RINGTONES[0];
  if (!key) return fallback;
  return RINGTONES.find(r => r.key === key) || fallback;
}
