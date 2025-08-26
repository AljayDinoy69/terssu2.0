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
import AdminCreateUsers from '../screens/AdminCreateUsers';

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
  return (
    <NavigationContainer theme={DefaultTheme}>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Report" component={ReportScreen} options={{ title: 'Report Incident' }} />
        <Stack.Screen name="UserDashboard" component={UserDashboard} options={{ title: 'User Dashboard' }} />
        <Stack.Screen name="ResponderDashboard" component={ResponderDashboard} options={{ title: 'Responder Dashboard' }} />
        <Stack.Screen name="AdminDashboard" component={AdminDashboard} options={{ title: 'Admin Dashboard' }} />
        <Stack.Screen name="AdminCreateUsers" component={AdminCreateUsers} options={{ title: 'Create Users' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
