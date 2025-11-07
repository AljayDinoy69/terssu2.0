# Google Maps Billing Error - Solutions

## The Error
```
You must enable Billing on the Google Cloud Project
```

This error occurs because **Google Directions API requires billing to be enabled**, even though there's a generous free tier.

---

## Solution 1: Enable Billing (Recommended)

### Why It's Safe
- **$200 FREE credit every month**
- Covers ~40,000 direction requests/month
- You'll only be charged if you exceed the free tier
- You can set billing alerts and limits

### Steps to Enable Billing

#### 1. Go to Google Cloud Console
Visit: https://console.cloud.google.com/

#### 2. Select Your Project
Click on the project dropdown and select your project

#### 3. Enable Billing
- Click **☰ Menu** → **Billing**
- Click **"Link a Billing Account"**
- If you don't have a billing account:
  - Click **"Create Billing Account"**
  - Enter your payment information
  - Agree to terms

#### 4. Set Up Budget Alerts (Highly Recommended)
- Go to **Billing** → **Budgets & Alerts**
- Click **"Create Budget"**
- Set amount to $10 or $20
- Enable email alerts at 50%, 90%, 100%

#### 5. Set API Usage Limits (Optional but Recommended)
- Go to **APIs & Services** → **Credentials**
- Click on your API key
- Under **API restrictions**, select:
  - Maps SDK for Android
  - Maps SDK for iOS
  - Directions API
  - Geocoding API
- Under **Application restrictions**, add your app's package name

#### 6. Wait & Test
- Wait 2-5 minutes for changes to propagate
- Restart your app
- Test the directions feature

### Pricing After Free Tier
- **First $200/month**: FREE
- **After $200**: $5 per 1,000 requests
- **For emergency app**: Unlikely to exceed free tier

---

## Solution 2: Use OpenRouteService (Free Forever)

If you prefer not to add billing:

### 1. Sign Up for OpenRouteService
- Visit: https://openrouteservice.org/dev/#/signup
- Create free account
- Get your API key (no credit card required)
- Free tier: 2,000 requests/day

### 2. Replace DirectionsMap Component

In `ResponderDashboard.tsx`, change:

```tsx
// OLD
import DirectionsMap from '../components/DirectionsMap';

// NEW
import OpenRouteServiceMap from '../components/OpenRouteServiceMap';
```

Then replace in the modal:

```tsx
// OLD
<DirectionsMap
  origin={{ latitude: myCoord.lat, longitude: myCoord.lon }}
  destination={{ latitude: incidentCoord.lat, longitude: incidentCoord.lon }}
  originTitle="Your Location"
  destinationTitle="Incident Location"
  strokeColor="#FF5722"
  strokeWidth={5}
  onReady={(result) => {
    setRouteInfo({ distance: result.distance, duration: result.duration });
  }}
  onError={(error) => {
    console.error('Directions error:', error);
    setMapError('Unable to get route. Check your internet connection.');
  }}
/>

// NEW
<OpenRouteServiceMap
  origin={{ latitude: myCoord.lat, longitude: myCoord.lon }}
  destination={{ latitude: incidentCoord.lat, longitude: incidentCoord.lon }}
  originTitle="Your Location"
  destinationTitle="Incident Location"
  strokeColor="#FF5722"
  strokeWidth={5}
  onReady={(result) => {
    setRouteInfo({ distance: result.distance, duration: result.duration });
  }}
  onError={(error) => {
    console.error('Directions error:', error);
    setMapError('Unable to get route. Check your internet connection.');
  }}
/>
```

### 3. Update the API Key

In `OpenRouteServiceMap.tsx`, replace:
```tsx
const OPENROUTE_API_KEY = 'YOUR_KEY_HERE';
```

With your actual API key from OpenRouteService.

---

## Solution 3: Mapbox Directions API (Free Tier)

Another free alternative with 50,000 requests/month free.

### Setup
1. Sign up at: https://www.mapbox.com/
2. Get your access token
3. Install: `npm install @mapbox/polyline`
4. Use fetch API to get directions

### Example Implementation

```tsx
const getMapboxRoute = async (start: Location, end: Location) => {
  const MAPBOX_TOKEN = 'YOUR_MAPBOX_TOKEN';
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?geometries=geojson&access_token=${MAPBOX_TOKEN}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.routes && data.routes[0]) {
    const route = data.routes[0];
    const coords = route.geometry.coordinates.map((coord: number[]) => ({
      latitude: coord[1],
      longitude: coord[0],
    }));
    
    return {
      coordinates: coords,
      distance: route.distance / 1000, // km
      duration: route.duration / 60, // minutes
    };
  }
};
```

---

## Comparison

| Service | Free Tier | Billing Required | Quality |
|---------|-----------|------------------|---------|
| **Google Maps** | $200/month (~40k requests) | ✅ Yes (card) | ⭐⭐⭐⭐⭐ Best |
| **OpenRouteService** | 2,000/day (~60k/month) | ❌ No | ⭐⭐⭐⭐ Very Good |
| **Mapbox** | 50,000/month | ❌ No | ⭐⭐⭐⭐ Very Good |

---

## Recommendation

### For Production App (Best Quality)
**Enable Google Billing** with:
- Budget alerts set to $10
- API usage limits configured
- Package name restrictions

### For Development/Testing
**Use OpenRouteService** or **Mapbox**:
- No billing required
- Good enough for development
- Can switch to Google later

---

## Quick Decision Matrix

**Choose Google Maps if:**
- ✓ You want the best routing quality
- ✓ You need traffic-aware routing
- ✓ You're okay with adding a payment method
- ✓ Your app will be used commercially

**Choose OpenRouteService if:**
- ✓ You want completely free service
- ✓ 2,000 requests/day is enough
- ✓ You're still in development
- ✓ You prefer no billing at all

---

## Still Having Issues?

### Common Problems

1. **"API key invalid"**
   - Make sure you enabled Directions API
   - Check API key restrictions match your app

2. **"Billing not enabled"** (after enabling)
   - Wait 5-10 minutes
   - Clear app cache and restart
   - Verify billing is actually active in console

3. **Route not showing**
   - Check internet connection
   - Verify coordinates are valid
   - Check console for error messages

### Need Help?
- Google Maps: https://developers.google.com/maps/support
- OpenRouteService: https://ask.openrouteservice.org/
- Mapbox: https://docs.mapbox.com/help/
