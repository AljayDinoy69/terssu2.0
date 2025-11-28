import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { GOOGLE_MAPS_API_KEY } from '../config';

// Web Fallback Component
const WebMapFallback: React.FC<{
  incidentCoord: { lat: number; lon: number };
  myCoord?: { lat: number; lon: number } | null;
  distanceKm: (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => number;
}> = ({ incidentCoord, myCoord, distanceKm }) => {
  const handleOpenMaps = async () => {
    const url = `https://www.google.com/maps?q=${incidentCoord.lat},${incidentCoord.lon}`;
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      console.error('Failed to open maps:', error);
    }
  };

  return (
    <View style={styles.fallbackContainer}>
      <Text style={styles.fallbackTitle}>🗺️ Map View (Web Preview)</Text>
      <View style={styles.coordinatesContainer}>
        <Text style={styles.incidentText}>📍 Incident: {incidentCoord.lat.toFixed(5)}, {incidentCoord.lon.toFixed(5)}</Text>
        {myCoord && (
          <Text style={styles.userText}>👤 You: {myCoord.lat.toFixed(5)}, {myCoord.lon.toFixed(5)}</Text>
        )}
        {myCoord && (
          <Text style={styles.distanceText}>📏 Distance: {distanceKm(incidentCoord, myCoord).toFixed(2)} km</Text>
        )}
      </View>
      <TouchableOpacity
        style={styles.mapsButton}
        onPress={handleOpenMaps}
      >
        <Text style={styles.buttonText}>🔗 Open in Google Maps</Text>
      </TouchableOpacity>
    </View>
  );
};

// Native Map Component - conditionally loaded based on platform
const NativeMapComponent = Platform.OS === 'web'
  ? null
  : React.lazy(() => {
      // Only attempt to import react-native-maps on native platforms
      return import('react-native-maps').then((Maps: any) => {
        const MapView = Maps.default || Maps.MapView;
        const Marker = Maps.Marker;
        const PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
        const Polyline = Maps.Polyline;

        return {
          default: ({ incidentCoord, myCoord, distanceKm }: {
            incidentCoord: { lat: number; lon: number };
            myCoord?: { lat: number; lon: number } | null;
            distanceKm: (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => number;
          }) => {
            const mapRef = React.useRef<any>(null);

            return (
              <MapView
                style={{ width: '100%', height: '100%' }}
                provider={PROVIDER_GOOGLE}
                ref={(r: any) => { mapRef.current = r; }}
                initialRegion={(() => {
                  const inc = incidentCoord;
                  const me = myCoord;
                  if (inc && me) {
                    const midLat = (inc.lat + me.lat) / 2;
                    const midLon = (inc.lon + me.lon) / 2;
                    const latDelta = Math.max(Math.abs(inc.lat - me.lat), 0.002) * 2.2;
                    const lonDelta = Math.max(Math.abs(inc.lon - me.lon), 0.002) * 2.2;
                    return { latitude: midLat, longitude: midLon, latitudeDelta: latDelta, longitudeDelta: lonDelta };
                  }
                  return { latitude: inc.lat, longitude: inc.lon, latitudeDelta: 0.01, longitudeDelta: 0.01 };
                })()}
                mapType="standard"
                zoomEnabled
                zoomControlEnabled
                scrollEnabled
                rotateEnabled
                pitchEnabled
                showsCompass
                showsMyLocationButton
              >
                <Marker
                  coordinate={{ latitude: incidentCoord.lat, longitude: incidentCoord.lon }}
                  title="Incident"
                  pinColor="#d90429"
                />
                {myCoord && (
                  <Marker
                    coordinate={{ latitude: myCoord.lat, longitude: myCoord.lon }}
                    title="Me"
                    pinColor="#00aaff"
                  />
                )}
                {myCoord && (
                  <Polyline
                    coordinates={[
                      { latitude: incidentCoord.lat, longitude: incidentCoord.lon },
                      { latitude: myCoord.lat, longitude: myCoord.lon },
                    ]}
                    strokeColor="#ffd166"
                    strokeWidth={3}
                  />
                )}
              </MapView>
            );
          }
        };
      }).catch((error) => {
        console.warn('react-native-maps not available:', error);
        return {
          default: ({ incidentCoord, myCoord, distanceKm }: {
            incidentCoord: { lat: number; lon: number };
            myCoord?: { lat: number; lon: number } | null;
            distanceKm: (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => number;
          }) => <WebMapFallback incidentCoord={incidentCoord} myCoord={myCoord} distanceKm={distanceKm} />
        };
      });
    });

interface MapComponentProps {
  incidentCoord: { lat: number; lon: number };
  myCoord?: { lat: number; lon: number } | null;
  distanceKm: (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => number;
}

const styles = StyleSheet.create({
  fallbackContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    padding: 16,
  },
  fallbackTitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '600',
  },
  coordinatesContainer: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  incidentText: {
    color: '#d90429',
    fontWeight: '700',
    textAlign: 'center',
  },
  userText: {
    color: '#00aaff',
    fontWeight: '700',
    textAlign: 'center',
  },
  distanceText: {
    color: '#ffd166',
    fontWeight: '700',
    textAlign: 'center',
  },
  mapsButton: {
    marginTop: 15,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#667eea',
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff3f3',
  },
  errorText: {
    color: '#d32f2f',
    textAlign: 'center',
    marginBottom: 16,
  },
});

export const MapComponent: React.FC<MapComponentProps> = (props) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if Google Maps API key is properly configured
    if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'YOUR_API_KEY') {
      setError('Google Maps API key is not properly configured');
      setLoading(false);
      return;
    }
    setLoading(false);
  }, []);

  // Show loading state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={{ marginTop: 10 }}>Loading map...</Text>
      </View>
    );
  }

  // Show error state if API key is not configured
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>🚫 {error}</Text>
        <Text style={{ textAlign: 'center' }}>
          Please make sure to set up your Google Maps API key in the environment variables.
        </Text>
      </View>
    );
  }

  // Always use web fallback for web platform, native component for native platforms
  if (Platform.OS === 'web' || !NativeMapComponent) {
    return <WebMapFallback {...props} />;
  }

  return (
    <React.Suspense 
      fallback={
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={{ marginTop: 10 }}>Loading map component...</Text>
        </View>
      }
    >
      <NativeMapComponent {...props} />
    </React.Suspense>
  );
};
