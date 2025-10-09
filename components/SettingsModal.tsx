import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { getAppTheme, setAppTheme, getNotificationFrequency, setNotificationFrequency, AppTheme, NotificationFrequency, getSelectedRingtoneKey, setSelectedRingtoneKey } from '../utils/settings';
import { getRingtones } from '../utils/ringtones';
import { playNotificationSound } from '../utils/sound';
import { useTheme } from './ThemeProvider';

export type SettingsModalProps = {
  visible: boolean;
  onClose: () => void;
  soundEnabled: boolean;
  onToggleSound: (next: boolean) => void;
};

const LOCKED_THEME: AppTheme = 'dark';

export default function SettingsModal({ visible, onClose, soundEnabled, onToggleSound }: SettingsModalProps) {
  const { setMode, colors } = useTheme();
  const [theme, setTheme] = useState<AppTheme>(LOCKED_THEME);
  const [notifFreq, setNotifFreq] = useState<NotificationFrequency>('normal');
  const [ringtoneKey, setRingtoneKey] = useState<string>('ring1');
  const ringtones = getRingtones();
  const [ringtoneOpen, setRingtoneOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        await setAppTheme(LOCKED_THEME);
        await setMode(LOCKED_THEME);
        setTheme(LOCKED_THEME);
      } catch {}
      try {
        const f = await getNotificationFrequency();
        setNotifFreq(f);
      } catch {}
      try {
        const rk = await getSelectedRingtoneKey();
        setRingtoneKey(rk);
      } catch {}
    })();
  }, [visible]);

  const ThemeButton = ({ value, label }: { value: AppTheme; label: string }) => {
    const isLockedOption = value === LOCKED_THEME;
    return (
      <TouchableOpacity
        style={[styles.choiceBtn, !isLockedOption && styles.choiceBtnDisabled, theme === value && styles.choiceBtnActive]}
        onPress={async () => {
          await setAppTheme(LOCKED_THEME);
          await setMode(LOCKED_THEME);
          setTheme(LOCKED_THEME);
        }}
        activeOpacity={isLockedOption ? 0.8 : 1}
        disabled={!isLockedOption}
      >
        <Text
          style={[
            styles.choiceBtnText,
            !isLockedOption && styles.choiceBtnTextDisabled,
            theme === value && styles.choiceBtnTextActive,
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const FreqButton = ({ value, label }: { value: NotificationFrequency; label: string }) => (
    <TouchableOpacity
      style={[styles.choiceBtn, notifFreq === value && styles.choiceBtnActive]}
      onPress={async () => { setNotifFreq(value); await setNotificationFrequency(value); }}
      activeOpacity={0.8}
    >
      <Text style={[styles.choiceBtnText, notifFreq === value && styles.choiceBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.background, borderColor: colors.text + '22' }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>⚙️ Settings</Text>

          {/* Notification Sound */}
          <View style={styles.row}>
            <View style={styles.rowTextWrap}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Notification Sound</Text>
              <Text style={[styles.rowSub, { color: colors.text + '99' }]}>Play a sound when new activity arrives</Text>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={(v) => onToggleSound(v)}
              trackColor={{ false: '#999', true: '#667eea' }}
              thumbColor={soundEnabled ? '#fff' : '#888'}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.text + '22' }]} />

          {/* Ringtone Picker (Dropdown) */}
          <View style={styles.rowColumn}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Ringtone</Text>
            <Text style={[styles.rowSub, { color: colors.text + '99' }]}>Choose the sound to play for notifications</Text>
            <View style={{ marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.dropdownHeader, { borderColor: colors.text + '22' }]}
                onPress={() => setRingtoneOpen(o => !o)}
                activeOpacity={0.85}
              >
                <Text style={[styles.dropdownHeaderText, { color: colors.text }]}>
                  {ringtones.find(r => r.key === ringtoneKey)?.label || 'Select ringtone'}
                </Text>
                <Text style={[styles.dropdownChevron, { color: colors.text + '99' }]}>{ringtoneOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {ringtoneOpen && (
                <View style={[styles.dropdownList, { borderColor: colors.text + '22' }]}> 
                  {ringtones.map(rt => (
                    <TouchableOpacity
                      key={rt.key}
                      style={[styles.dropdownItem, ringtoneKey === rt.key && styles.dropdownItemActive]}
                      onPress={async () => {
                        setRingtoneKey(rt.key);
                        await setSelectedRingtoneKey(rt.key);
                        setRingtoneOpen(false);
                        await playNotificationSound();
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.dropdownItemText, { color: colors.text }]}>
                        {rt.label}
                        {ringtoneKey === rt.key ? '  ✓' : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          {/* Theme */}
          <View style={styles.rowColumn}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Theme</Text>
            <Text style={[styles.rowSub, { color: colors.text + '99' }]}>Theme is temporarily locked to Dark mode</Text>
            <View style={styles.choicesRow}>
              <ThemeButton value="system" label="System" />
              <ThemeButton value="light" label="Light" />
              <ThemeButton value="dark" label="Dark" />
            </View>
          </View>

          <View style={styles.divider} />

          {/* Notification Frequency */}
          <View style={styles.rowColumn}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Notification Frequency</Text>
            <Text style={[styles.rowSub, { color: colors.text + '99' }]}>Control how often to alert you</Text>
            <View style={styles.choicesRow}>
              <FreqButton value="off" label="Off" />
              <FreqButton value="low" label="Low" />
              <FreqButton value="normal" label="Normal" />
              <FreqButton value="high" label="High" />
            </View>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.closeBtn, { borderColor: colors.text + '22' }]} onPress={onClose} activeOpacity={0.8}>
              <Text style={[styles.closeBtnText, { color: colors.text }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#0f0f23',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  rowColumn: {
    paddingVertical: 12,
  },
  rowTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  rowTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  rowSub: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#1f1f35',
    marginVertical: 8,
  },
  actionsRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  choicesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  choiceBtn: {
    backgroundColor: '#1a1a2e',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  choiceBtnDisabled: {
    opacity: 0.5,
  },
  choiceBtnActive: {
    backgroundColor: '#667eea30',
    borderColor: '#667eea',
  },
  choiceBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  choiceBtnTextDisabled: {
    color: '#777',
  },
  choiceBtnTextActive: {
    color: '#c3d3ff',
  },
  closeBtn: {
    backgroundColor: '#2a2a3e',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  closeBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a2e',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  dropdownHeaderText: {
    fontWeight: '800',
    fontSize: 13,
  },
  dropdownChevron: {
    fontSize: 12,
  },
  dropdownList: {
    marginTop: 6,
    backgroundColor: '#151528',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dropdownItemActive: {
    backgroundColor: '#667eea30',
  },
  dropdownItemText: {
    fontWeight: '700',
    fontSize: 13,
  },
});
