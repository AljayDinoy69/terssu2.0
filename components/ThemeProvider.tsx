import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import { AppTheme, getAppTheme, setAppTheme } from '../utils/settings';

export type ThemeContextType = {
  mode: AppTheme; // persisted preference
  systemScheme: Exclude<ColorSchemeName, 'no-preference'> | null;
  theme: 'light' | 'dark'; // resolved effective theme
  setMode: (m: AppTheme) => Promise<void>;
  colors: {
    background: string;
    text: string;
  };
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<AppTheme>('system');
  const [systemScheme, setSystemScheme] = useState<Exclude<ColorSchemeName, 'no-preference'> | null>(Appearance.getColorScheme() as any);

  useEffect(() => {
    (async () => {
      const pref = await getAppTheme();
      setModeState(pref);
    })();
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme as any);
    });
    return () => sub.remove();
  }, []);

  const theme: 'light' | 'dark' = useMemo(() => {
    if (mode === 'light') return 'light';
    if (mode === 'dark') return 'dark';
    return (systemScheme || 'light') === 'dark' ? 'dark' : 'light';
  }, [mode, systemScheme]);

  const setMode = async (m: AppTheme) => {
    setModeState(m);
    await setAppTheme(m);
  };

  const colors = useMemo(() => ({
    background: theme === 'dark' ? '#0f0f23' : '#ffffff',
    text: theme === 'dark' ? '#ffffff' : '#0f0f23',
  }), [theme]);

  const value: ThemeContextType = { mode, systemScheme, theme, setMode, colors };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
