import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import AppNavigator from './navigation/AppNavigator';
import { Provider } from 'react-redux';
import { store } from './store';
import NetworkProvider from './components/NetworkProvider';
import { ThemeProvider, useTheme } from './components/ThemeProvider';

export default function App() {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <NetworkProvider>
          <ThemedAppShell />
        </NetworkProvider>
      </ThemeProvider>
    </Provider>
  );
}

function ThemedAppShell() {
  const { colors, theme } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppNavigator />
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
