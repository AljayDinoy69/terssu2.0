# Route Line Not Showing - Debug Guide

## Changes Made for Debugging

### 1. Added Console Logging
The OpenRouteServiceMap now logs detailed information:
- API request details
- Response status
- Number of route coordinates
- Distance and duration
- Any errors

### 2. Visual Debug Indicator
Look at **bottom left of map** - shows: `✅ Route loaded (XXX points)`

### 3. Increased Line Visibility
- **Stroke width**: 5 → 8 (thicker line)
- **Color**: #FF5722 → #FF0000 (bright red)

---

## Testing Steps

### Step 1: Restart Your App
```bash
# Stop your app completely
# Restart Metro bundler and reload
```

### Step 2: Open Map Modal
1. Go to ResponderDashboard
2. Click "View Location" on any report
3. **Watch your console/terminal**

### Step 3: Check Console Logs

#### ✅ SUCCESS - What You Should See:
```
🗺️ Fetching route from OpenRouteService...
Origin: { latitude: 14.xxxx, longitude: 121.xxxx }
Destination: { latitude: 14.yyyy, longitude: 121.yyyy }
📡 API Response status: 200
✅ Route fetched successfully!
📍 Route has 156 coordinates
📏 Distance: 10.69 km
⏱️ Duration: 16 min
```

**If you see this:** The API is working! Route coordinates are loaded.

#### ❌ ERROR - What Might Show:
```
❌ OpenRouteService API Error: { error: { code: 2003, message: "..." } }
```

---

## Common Errors & Solutions

### Error Code 2003: API Key Invalid
**Reason:** API key is incorrect or has extra spaces

**Fix:**
1. Go to https://openrouteservice.org/dev/
2. Login and copy API key again
3. In `OpenRouteServiceMap.tsx` line 24:
   ```tsx
   const OPENROUTE_API_KEY = 'YOUR_KEY_HERE'; // Paste carefully
   ```
4. Make sure no spaces before/after the key

### Error Code 2004: Parameter Invalid
**Reason:** Coordinates might be in wrong format

**What to check:**
- Make sure latitude/longitude are valid numbers
- Check console for "Origin:" and "Destination:" values

### Error Code 2010: Rate Limit Exceeded
**Reason:** You've used more than 2,000 requests today

**Fix:**
- Wait 24 hours
- Or create a new free account
- Or switch to Google Maps (requires billing)

### HTTP 403: Forbidden
**Reason:** API key doesn't have proper permissions

**Fix:**
1. Check if you confirmed your email
2. Check if API key is active in dashboard
3. Try generating a new API key

---

## Visual Checks

### Check 1: Debug Indicator
Look at **bottom left** of the map. You should see:
```
✅ Route loaded (156 points)
```

**If you see this:** Route coordinates ARE loaded but Polyline isn't rendering.

**If you DON'T see this:** Route coordinates are NOT loaded - check console for errors.

### Check 2: Loading Spinner
You should see "Calculating route..." for 1-2 seconds when opening the modal.

**If spinner never shows:** Component might not be mounting properly.

**If spinner never disappears:** API request is hanging or failing.

### Check 3: Distance Display
Look at the bottom of modal (below map). You should see:
```
Distance: 10.69 km
ETA: 16 min
```

**If you see distance/ETA:** API is working and returning data!

**If you DON'T see distance/ETA:** API call is failing.

---

## Debugging Scenarios

### Scenario 1: Distance Shows, No Line
**Symptoms:**
- Distance: 10.69 km ✓
- ETA: shows ✓
- Markers visible ✓
- No route line ✗

**Console shows:**
```
✅ Route fetched successfully!
📍 Route has 156 coordinates
```

**Cause:** Polyline component rendering issue

**Solutions:**
1. Check if you're testing on Android or iOS (try both)
2. Try on a different device/emulator
3. Check if map is fully loaded before route renders
4. Look for any React Native Maps version issues

### Scenario 2: No Distance, No Line
**Symptoms:**
- Distance: not showing
- Markers visible ✓
- No route line ✗

**Console shows:**
```
❌ OpenRouteService API Error: ...
```

**Cause:** API call failing

**Solutions:**
1. Check API key
2. Check internet connection
3. Check if coordinates are valid
4. Check console for specific error

### Scenario 3: Nothing Loads
**Symptoms:**
- Blank map or error

**Console shows:**
```
Error: Unable to get directions
```

**Cause:** Component error

**Solutions:**
1. Check if OpenRouteServiceMap is imported correctly
2. Check if coordinates are passed as props
3. Check for TypeScript errors in IDE

---

## Quick Tests

### Test 1: Hardcode Simple Route
To test if the Polyline component works at all, try adding a simple line:

In `OpenRouteServiceMap.tsx`, temporarily add after line 151:
```tsx
{/* Test polyline - remove after testing */}
<Polyline
  coordinates={[
    { latitude: origin.latitude, longitude: origin.longitude },
    { latitude: destination.latitude, longitude: destination.longitude },
  ]}
  strokeWidth={10}
  strokeColor="#00FF00"
/>
```

**If green line shows:** Polyline works, issue is with API data
**If no line shows:** Polyline component issue

### Test 2: Check State
Add this console log in OpenRouteServiceMap after line 82:
```tsx
console.log('📊 Route coordinates state:', routeCoordinates.length);
```

Re-render the map and check console.

**If shows number:** State is set correctly
**If shows 0:** State not updating

---

## Platform-Specific Issues

### Android
- Make sure Google Play Services is installed
- Check if react-native-maps is properly linked
- Try clearing cache: `cd android && ./gradlew clean`

### iOS
- Make sure you ran `cd ios && pod install`
- Check if GoogleMaps is in Podfile
- Try cleaning: `cd ios && rm -rf build`

### Expo
- Make sure using Expo's version of react-native-maps
- Check app.json for map configuration
- Try: `expo install react-native-maps`

---

## Next Steps

1. **Restart app and check console**
2. **Look for the debug indicator** at bottom left
3. **Copy/paste console logs here** if you need help
4. **Try on different device** if issue persists

If the console shows route is loaded but line still doesn't show, it might be a react-native-maps rendering issue specific to your platform/device.

---

## Alternative: Switch Back to Google Maps

If OpenRouteService continues to have issues, you can switch back to Google Directions:

1. Enable Google billing (get $200/month free)
2. In ResponderDashboard.tsx, change:
   ```tsx
   import DirectionsMap from '../components/DirectionsMap';
   // ...
   <DirectionsMap ... />
   ```

Google Directions is more reliable but requires billing to be enabled.
