const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// More comprehensive exclusion and aliasing of react-native-maps for web builds
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  /react-native-maps\/lib\/.*/,
  /react-native-maps\/src\/.*/,
];

// Alias react-native-maps to our web mock for web builds
config.resolver.alias = {
  ...(config.resolver.alias || {}),
  'react-native-maps': require.resolve('./react-native-maps-web-mock.js'),
};

module.exports = config;
