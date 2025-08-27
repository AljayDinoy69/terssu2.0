// Mock react-native-maps for web builds
const React = require('react');
const { View, Text } = require('react-native');

// Mock MapView component
const MapView = ({ children, ...props }) => (
  <View {...props} style={{ backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' }}>
    <Text>🗺️ Map View (Web Mock)</Text>
    {children}
  </View>
);

// Mock Marker component
const Marker = () => null;

// Mock Polyline component
const Polyline = () => null;

// Mock PROVIDER_GOOGLE
const PROVIDER_GOOGLE = 'google';

module.exports = {
  default: MapView,
  MapView,
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
};
