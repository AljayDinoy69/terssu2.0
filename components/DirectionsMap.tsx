import React, { useRef, useEffect, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { GOOGLE_MAPS_API_KEY } from '../config';

interface Location {
  latitude: number;
  longitude: number;
}

interface DirectionsMapProps {
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

const DirectionsMap: React.FC<DirectionsMapProps> = ({
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
  const [showFallbackLine, setShowFallbackLine] = useState(false);
  const [directionsLoaded, setDirectionsLoaded] = useState(false);

  // Calculate straight-line distance (Haversine formula)
  const calculateDistance = (from: Location, to: Location): number => {
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

  useEffect(() => {
    // Show fallback after 3 seconds if directions haven't loaded
    const timer = setTimeout(() => {
      if (!directionsLoaded) {
        console.warn('Directions taking too long, showing fallback line');
        setShowFallbackLine(true);
        
        // Calculate approximate straight-line distance and time
        const distance = calculateDistance(origin, destination);
        const duration = distance * 1.5; // Rough estimate: 1.5 min per km
        
        if (onReady) {
          onReady({
            distance,
            duration,
            coordinates: [origin, destination]
          });
        }
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [origin, destination, directionsLoaded]);

  const handleDirectionsReady = (result: any) => {
    console.log('Route distance:', result.distance, 'km');
    console.log('Route duration:', result.duration, 'min');
    
    setDirectionsLoaded(true);
    setShowFallbackLine(false);

    // Fit map to show the entire route
    if (mapRef.current) {
      mapRef.current.fitToCoordinates(result.coordinates, {
        edgePadding: { top: 100, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }

    if (onReady) {
      onReady(result);
    }
  };

  const handleDirectionsError = (errorMessage: any) => {
    console.error('Error getting directions:', errorMessage);
    setShowFallbackLine(true);
    
    // Calculate straight-line distance as fallback
    const distance = calculateDistance(origin, destination);
    const duration = distance * 1.5; // Rough estimate
    
    if (onReady) {
      onReady({
        distance,
        duration,
        coordinates: [origin, destination]
      });
    }
    
    if (onError) {
      onError(errorMessage);
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

        {/* Try to load Google Directions */}
        {!showFallbackLine && (
          <MapViewDirections
            origin={origin}
            destination={destination}
            apikey={GOOGLE_MAPS_API_KEY}
            strokeWidth={strokeWidth}
            strokeColor={strokeColor}
            optimizeWaypoints={true}
            onReady={handleDirectionsReady}
            onError={handleDirectionsError}
          />
        )}

        {/* Fallback: Show straight line if API fails */}
        {showFallbackLine && (
          <Polyline
            coordinates={[origin, destination]}
            strokeWidth={strokeWidth}
            strokeColor={strokeColor}
            lineDashPattern={[10, 5]} // Dashed line to indicate it's not actual route
          />
        )}
      </MapView>

      {/* Show warning when using fallback */}
      {showFallbackLine && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>⚠️ Showing straight-line distance</Text>
          <Text style={styles.warningSubtext}>Enable Google billing for accurate routing</Text>
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
    fontSize: 14,
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

export default DirectionsMap;
