const { getDefaultConfig } = require('@expo/metro-config');
const { resolve } = require('metro-resolver');

const config = getDefaultConfig(__dirname);

// Only alias react-native-maps packages for WEB builds. Native builds should
// resolve the real package from node_modules.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (moduleName === 'react-native-maps') {
      return {
        type: 'sourceFile',
        filePath: require.resolve('./react-native-maps-web-mock.js'),
      };
    }
    if (moduleName === 'react-native-maps-directions') {
      return {
        type: 'sourceFile',
        filePath: require.resolve('./react-native-maps-directions-web-mock.js'),
      };
    }
  }
  // Fall back to Metro's default resolver
  return resolve(context, moduleName, platform);
};

module.exports = config;
