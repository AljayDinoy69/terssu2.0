import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import DirectionsMap from '../components/DirectionsMap';
import { RootStackParamList } from '../navigation/AppNavigator';

type DirectionsExampleProps = NativeStackScreenProps<RootStackParamList, 'DirectionsExample'>;

export default function DirectionsExampleScreen({ navigation }: DirectionsExampleProps) {
  // Example coordinates - replace with actual coordinates from your reports/responders
  const [origin] = useState({
    latitude: 14.5995, // Manila example
    longitude: 120.9842,
  });

  const [destination] = useState({
    latitude: 14.6091, // Quezon City example
    longitude: 121.0223,
  });

  const [routeInfo, setRouteInfo] = useState<{
    distance: number;
    duration: number;
  } | null>(null);

  const handleDirectionsReady = (result: { distance: number; duration: number }) => {
    setRouteInfo({
      distance: result.distance,
      duration: result.duration,
    });
  };

  const handleDirectionsError = (error: any) => {
    Alert.alert('Error', 'Failed to get directions. Please try again.');
    console.error('Directions error:', error);
  };

  return (
    <View style={styles.container}>
      {/* Route Info Card */}
      {routeInfo && (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Route Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Distance:</Text>
            <Text style={styles.infoValue}>{routeInfo.distance.toFixed(2)} km</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Duration:</Text>
            <Text style={styles.infoValue}>{Math.round(routeInfo.duration)} min</Text>
          </View>
        </View>
      )}

      {/* Map with Directions */}
      <DirectionsMap
        origin={origin}
        destination={destination}
        onReady={handleDirectionsReady}
        onError={handleDirectionsError}
        originTitle="Responder Location"
        destinationTitle="Incident Location"
        strokeColor="#FF5722"
        strokeWidth={5}
      />

      {/* Back Button */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  infoCard: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
  },
  backButton: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
