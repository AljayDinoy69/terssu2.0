// Mock react-native-maps-directions for web builds
const React = require('react');

// Mock MapViewDirections component
const MapViewDirections = ({ onReady, onError }) => {
  // Simulate successful route calculation after a delay
  React.useEffect(() => {
    if (onReady) {
      setTimeout(() => {
        onReady({
          distance: 5.2,
          duration: 12,
          coordinates: [],
        });
      }, 100);
    }
  }, [onReady]);

  return null;
};

module.exports = {
  default: MapViewDirections,
};
