import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import ReportScreen from '../screens/ReportScreen';
import UserDashboard from '../screens/UserDashboard';
import ResponderDashboard from '../screens/ResponderDashboard';
import AdminDashboard from '../screens/AdminDashboard';
import AdminCreateUsers from '../components/AdminCreateUsers';
import { useTheme } from '../components/ThemeProvider';

export type RootStackParamList = {
  Home: undefined;
  Login: undefined;
  Signup: undefined;
  Report: { anonymous?: boolean } | undefined;
  UserDashboard: undefined;
  ResponderDashboard: undefined;
  AdminDashboard: undefined;
  AdminCreateUsers: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { colors } = useTheme();
  return (
    <NavigationContainer theme={DefaultTheme}>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Report" component={ReportScreen} options={{ title: 'Report Incident' }} />
        <Stack.Screen name="UserDashboard" component={UserDashboard} options={{ headerShown: false }} />
        <Stack.Screen name="ResponderDashboard" component={ResponderDashboard} options={{ headerShown: false }} />
        <Stack.Screen name="AdminDashboard" component={AdminDashboard} options={{ headerShown: false }} />
        <Stack.Screen name="AdminCreateUsers" component={AdminCreateUsers} options={{ title: 'Create Users' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
