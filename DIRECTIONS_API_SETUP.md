# Google Directions API Integration

This project now includes Google Directions API for routing between locations.

## What's Been Set Up

### 1. **Installed Packages**
- `react-native-maps-directions` - For route drawing on React Native Maps

### 2. **Created Files**
- **`config.ts`** - Contains the Google Maps API key
- **`components/DirectionsMap.tsx`** - Reusable map component with directions
- **`screens/DirectionsExampleScreen.tsx`** - Example screen showing how to use the component
- **`react-native-maps-directions-web-mock.js`** - Web mock for testing

### 3. **Updated Files**
- **`metro.config.js`** - Added alias for web builds
- **`navigation/AppNavigator.tsx`** - Added DirectionsExample screen

## How to Use

### Basic Usage

```tsx
import DirectionsMap from '../components/DirectionsMap';

<DirectionsMap
  origin={{ latitude: 14.5995, longitude: 120.9842 }}
  destination={{ latitude: 14.6091, longitude: 121.0223 }}
  onReady={(result) => {
    console.log('Distance:', result.distance, 'km');
    console.log('Duration:', result.duration, 'min');
  }}
/>
```

### Props

- **`origin`** - Starting point coordinates `{ latitude: number, longitude: number }`
- **`destination`** - Ending point coordinates `{ latitude: number, longitude: number }`
- **`onReady`** - Callback when route is calculated (optional)
- **`onError`** - Callback when route calculation fails (optional)
- **`showOriginMarker`** - Show origin marker (default: true)
- **`showDestinationMarker`** - Show destination marker (default: true)
- **`originTitle`** - Origin marker title (default: 'Origin')
- **`destinationTitle`** - Destination marker title (default: 'Destination')
- **`strokeWidth`** - Route line width (default: 4)
- **`strokeColor`** - Route line color (default: '#2196F3')

## Testing the Implementation

### Navigate to the example screen:
```tsx
navigation.navigate('DirectionsExample');
```

## Integration with Your Report System

### Example: Show route from responder to incident

```tsx
import DirectionsMap from '../components/DirectionsMap';

const ShowRoute = ({ reportLocation, responderLocation }) => {
  const [routeInfo, setRouteInfo] = useState(null);

  return (
    <View style={{ flex: 1 }}>
      <DirectionsMap
        origin={responderLocation}
        destination={reportLocation}
        originTitle="Responder Location"
        destinationTitle="Incident Location"
        strokeColor="#FF5722"
        onReady={(result) => {
          setRouteInfo(result);
          // You can save this info to your database or display it
        }}
      />
      {routeInfo && (
        <Text>
          Distance: {routeInfo.distance} km, 
          ETA: {Math.round(routeInfo.duration)} min
        </Text>
      )}
    </View>
  );
};
```

## Security Recommendations

### ⚠️ IMPORTANT: Secure Your API Key

1. **Restrict your API key in Google Cloud Console:**
   - Go to https://console.cloud.google.com/
   - Navigate to "APIs & Services" > "Credentials"
   - Click on your API key
   - Set "Application restrictions" to your app's package name
   - Set "API restrictions" to only allow:
     - Maps SDK for Android
     - Maps SDK for iOS
     - Directions API
     - Geocoding API (if needed)

2. **For production:**
   - Use environment variables (e.g., `react-native-config`)
   - Consider using a backend proxy for API calls
   - Implement rate limiting
   - Monitor API usage in Google Cloud Console

3. **Current API Key Location:**
   - File: `config.ts`
   - **This key should be replaced with a restricted version before deployment**

## API Costs

- **Free tier:** First $200/month (≈40,000 direction requests)
- **After free tier:** $5 per 1,000 requests
- Monitor usage at: https://console.cloud.google.com/

## Features

- ✅ Real-time route calculation
- ✅ Distance and duration estimation
- ✅ Traffic-aware routing
- ✅ Automatic map zoom to fit route
- ✅ Customizable route appearance
- ✅ Origin and destination markers
- ✅ Web build support (with mocks)

## Troubleshooting

### Route not showing?
- Check API key is valid
- Verify API is enabled in Google Cloud Console
- Check console for error messages
- Ensure coordinates are valid

### "Directions API not enabled" error?
- Enable Directions API in Google Cloud Console
- Wait a few minutes for changes to propagate

## Next Steps

1. Test the example screen
2. Integrate with your report/responder screens
3. Secure the API key with restrictions
4. Add route tracking to your database
5. Consider adding waypoint support for multi-stop routes
