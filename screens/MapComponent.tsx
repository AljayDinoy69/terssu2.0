import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Platform } from 'react-native';

// Web Fallback Component
const WebMapFallback: React.FC<{
  incidentCoord: { lat: number; lon: number };
  myCoord?: { lat: number; lon: number } | null;
  distanceKm: (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => number;
}> = ({ incidentCoord, myCoord, distanceKm }) => (
  <View style={{ width: '100%', height: '100%', backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', borderRadius: 10 }}>
    <Text style={{ fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 10 }}>🗺️ Map View (Web Preview)</Text>
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Text style={{ color: '#d90429', fontWeight: '700' }}>📍 Incident: {incidentCoord.lat.toFixed(5)}, {incidentCoord.lon.toFixed(5)}</Text>
      {myCoord && (
        <Text style={{ color: '#00aaff', fontWeight: '700' }}>👤 You: {myCoord.lat.toFixed(5)}, {myCoord.lon.toFixed(5)}</Text>
      )}
      {myCoord && (
        <Text style={{ color: '#ffd166', fontWeight: '700' }}>📏 Distance: {distanceKm(incidentCoord, myCoord).toFixed(2)} km</Text>
      )}
    </View>
    <TouchableOpacity
      style={{ marginTop: 15, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#667eea', borderRadius: 6 }}
      onPress={() => {
        const url = `https://www.google.com/maps?q=${incidentCoord.lat},${incidentCoord.lon}`;
        alert(`Open in Google Maps: ${url}`);
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700' }}>🔗 Open in Google Maps</Text>
    </TouchableOpacity>
  </View>
);

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

export const MapComponent: React.FC<MapComponentProps> = (props) => {
  // Always use web fallback for web platform, native component for native platforms
  if (Platform.OS === 'web' || !NativeMapComponent) {
    return <WebMapFallback {...props} />;
  }

  return (
    <React.Suspense fallback={<View style={{ width: '100%', height: '100%', backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' }}><Text>Loading map...</Text></View>}>
      <NativeMapComponent {...props} />
    </React.Suspense>
  );
};
