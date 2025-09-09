import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { getAppTheme, setAppTheme, getNotificationFrequency, setNotificationFrequency, AppTheme, NotificationFrequency } from '../utils/settings';
import { useTheme } from './ThemeProvider';

export type SettingsModalProps = {
  visible: boolean;
  onClose: () => void;
  soundEnabled: boolean;
  onToggleSound: (next: boolean) => void;
};

export default function SettingsModal({ visible, onClose, soundEnabled, onToggleSound }: SettingsModalProps) {
  const { setMode, colors } = useTheme();
  const [theme, setTheme] = useState<AppTheme>('system');
  const [notifFreq, setNotifFreq] = useState<NotificationFrequency>('normal');

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const t = await getAppTheme();
        setTheme(t);
      } catch {}
      try {
        const f = await getNotificationFrequency();
        setNotifFreq(f);
      } catch {}
    })();
  }, [visible]);

  const ThemeButton = ({ value, label }: { value: AppTheme; label: string }) => (
    <TouchableOpacity
      style={[styles.choiceBtn, theme === value && styles.choiceBtnActive]}
      onPress={async () => { setTheme(value); await setAppTheme(value); await setMode(value); }}
      activeOpacity={0.8}
    >
      <Text style={[styles.choiceBtnText, theme === value && styles.choiceBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

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

          {/* Theme */}
          <View style={styles.rowColumn}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Theme</Text>
            <Text style={[styles.rowSub, { color: colors.text + '99' }]}>Choose how the app looks</Text>
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
  choiceBtnActive: {
    backgroundColor: '#667eea30',
    borderColor: '#667eea',
  },
  choiceBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
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
});
