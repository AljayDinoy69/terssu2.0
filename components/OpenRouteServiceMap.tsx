import React, { useRef, useEffect, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

interface Location {
  latitude: number;
  longitude: number;
}

interface OpenRouteServiceMapProps {
  origin: Location;
  destination: Location;
  onReady?: (result: { distance: number; duration: number; coordinates: Location[] }) => void;
  onError?: (error: any) => void;
  showOriginMarker?: boolean;
  showDestinationMarker?: boolean;
  originTitle?: string;
  destinationTitle?: string;
  strokeWidth?: number;
  strokeColor?: string;
}

// Free API - Get your key at https://openrouteservice.org/dev/#/signup
const OPENROUTE_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImVhN2RiNzhhZmIxNzRhNWVhNWE5ZDJkZGE2ODgwZWNjIiwiaCI6Im11cm11cjY0In0='; // Replace with your key

const OpenRouteServiceMap: React.FC<OpenRouteServiceMapProps> = ({
  origin,
  destination,
  onReady,
  onError,
  showOriginMarker = true,
  showDestinationMarker = true,
  originTitle = 'Origin',
  destinationTitle = 'Destination',
  strokeWidth = 4,
  strokeColor = '#2196F3',
}) => {
  const mapRef = useRef<MapView>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    // Only fetch once per mount to avoid rate limit issues
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchRoute();
    }
  }, []);

  // Calculate straight-line distance using Haversine formula
  const calculateStraightLineDistance = (from: Location, to: Location): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (to.latitude - from.latitude) * Math.PI / 180;
    const dLon = (to.longitude - from.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(from.latitude * Math.PI / 180) * Math.cos(to.latitude * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const fetchRoute = async () => {
    try {
      setLoading(true);
      const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${OPENROUTE_API_KEY}&start=${origin.longitude},${origin.latitude}&end=${destination.longitude},${destination.latitude}`;
      
      console.log('🗺️ Fetching route from OpenRouteService...');
      console.log('Origin:', origin);
      console.log('Destination:', destination);
      
      const response = await fetch(url);
      const data = await response.json();

      console.log('📡 API Response status:', response.status);
      
      // Check for rate limit (429)
      if (response.status === 429) {
        console.warn('⚠️ Rate limit exceeded - showing straight line fallback');
        setHasError(true);
        // Show straight line as fallback
        const fallbackCoords = [origin, destination];
        setRouteCoordinates(fallbackCoords);
        
        // Calculate approximate distance and time
        const distance = calculateStraightLineDistance(origin, destination);
        const duration = distance * 1.5; // rough estimate
        
        if (onReady) {
          onReady({ distance, duration, coordinates: fallbackCoords });
        }
        setLoading(false);
        return;
      }
      
      // Check for API errors
      if (data.error) {
        console.error('❌ OpenRouteService API Error:', data.error);
        setHasError(true);
        throw new Error(data.error.message || 'API Error');
      }

      if (data.features && data.features[0]) {
        const route = data.features[0];
        const coords = route.geometry.coordinates.map((coord: number[]) => ({
          latitude: coord[1],
          longitude: coord[0],
        }));

        console.log('✅ Route fetched successfully!');
        console.log('📍 Route has', coords.length, 'coordinates');

        const distance = route.properties.segments[0].distance / 1000; // Convert to km
        const duration = route.properties.segments[0].duration / 60; // Convert to minutes

        console.log('📏 Distance:', distance.toFixed(2), 'km');
        console.log('⏱️ Duration:', Math.round(duration), 'min');

        setRouteCoordinates(coords);

        // Fit map to route
        if (mapRef.current && coords.length > 0) {
          setTimeout(() => {
            mapRef.current?.fitToCoordinates(coords, {
              edgePadding: { top: 100, right: 50, bottom: 100, left: 50 },
              animated: true,
            });
          }, 500);
        }

        if (onReady) {
          onReady({ distance, duration, coordinates: coords });
        }
      } else {
        console.warn('⚠️ No route data in response');
        console.log('Response data:', JSON.stringify(data, null, 2));
      }
      setLoading(false);
    } catch (error) {
      console.error('❌ OpenRouteService error:', error);
      setHasError(true);
      setLoading(false);
      
      // Show straight line fallback on any error
      const fallbackCoords = [origin, destination];
      setRouteCoordinates(fallbackCoords);
      
      const distance = calculateStraightLineDistance(origin, destination);
      const duration = distance * 1.5;
      
      if (onReady) {
        onReady({ distance, duration, coordinates: fallbackCoords });
      }
      
      if (onError) {
        onError(error);
      }
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: (origin.latitude + destination.latitude) / 2,
          longitude: (origin.longitude + destination.longitude) / 2,
          latitudeDelta: Math.abs(origin.latitude - destination.latitude) * 2 || 0.0922,
          longitudeDelta: Math.abs(origin.longitude - destination.longitude) * 2 || 0.0421,
        }}
        showsUserLocation
        showsMyLocationButton
        showsTraffic
      >
        {showOriginMarker && (
          <Marker
            coordinate={origin}
            title={originTitle}
            pinColor="green"
          />
        )}

        {showDestinationMarker && (
          <Marker
            coordinate={destination}
            title={destinationTitle}
            pinColor="red"
          />
        )}

        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeWidth={strokeWidth}
            strokeColor={strokeColor}
            lineCap="round"
            lineJoin="round"
            lineDashPattern={hasError ? [10, 5] : undefined}
          />
        )}
      </MapView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.loadingText}>Calculating route...</Text>
        </View>
      )}

      {/* Show warning when rate limited or error */}
      {hasError && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>⚠️ Rate limit reached</Text>
          <Text style={styles.warningSubtext}>Showing approximate distance</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  warningBanner: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(255, 152, 0, 0.95)',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  warningText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  warningSubtext: {
    color: '#fff',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
    opacity: 0.9,
  },
});

export default OpenRouteServiceMap;
