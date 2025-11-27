# Google Maps API Usage & Free Tier Limits

## Current Implementation

### Technician Location Tracking
**Good News:** Technician location is obtained using the browser's **`navigator.geolocation` API**, which is **FREE** and doesn't count toward Google Maps API usage.

- **Update Frequency:** Every 5 minutes (only when app is open and visible)
- **API Calls:** 0 (uses browser's native geolocation)
- **Cost:** FREE

### Google Maps API Usage (Paid)

Google Maps API is used for:

1. **Distance Matrix API** - Calculate distances from technicians to job locations
   - Used when: Admin clicks "Refresh Distances" in assignment dialog
   - Frequency: On-demand (only when user clicks button)
   - Cost: ~$5 per 1,000 requests (as of 2024)

2. **Geocoding API** - Convert addresses to coordinates
   - Used when: Adding/editing customer addresses, reverse geocoding
   - Frequency: On-demand
   - Cost: ~$5 per 1,000 requests

3. **Maps JavaScript API** - Display maps in the UI
   - Used for: Map widgets, draggable maps
   - Cost: ~$7 per 1,000 map loads

## Google Maps Platform Free Tier (2024)

**Monthly Free Credit: $200 USD**

This means you get $200 worth of API usage for free every month.

### Estimated Monthly Usage

#### For Technician Location:
- **Cost:** $0 (uses browser geolocation, not Google Maps API)
- **Updates:** Every 5 minutes per active technician
- **Monthly calls:** Unlimited (free)

#### For Distance Matrix API:
- **Scenario:** Admin assigns jobs using "By Distance" method
- **Cost:** ~$5 per 1,000 distance calculations
- **With $200 credit:** ~40,000 distance calculations per month
- **Example:** If you have 10 technicians and calculate distances 10 times per day:
  - 10 technicians × 10 calculations/day = 100 distance matrix requests/day
  - 100 × 30 days = 3,000 requests/month
  - Cost: ~$15/month (well within $200 free tier)

#### For Geocoding API:
- **Cost:** ~$5 per 1,000 geocoding requests
- **With $200 credit:** ~40,000 geocoding requests per month
- **Typical usage:** Low (only when adding/editing addresses)

#### For Maps JavaScript API:
- **Cost:** ~$7 per 1,000 map loads
- **With $200 credit:** ~28,000 map loads per month
- **Typical usage:** Moderate (every time admin opens dashboard/maps)

## Recommendations

### Current Setup (Optimized):
✅ **Technician location updates are FREE** (every 5 minutes using browser geolocation)
✅ **Distance calculations are on-demand only** (only when admin clicks button)
✅ **No automatic distance calculations** (saves API calls)

### To Stay Within Free Tier:

1. **Technician Location:** ✅ Already optimal
   - Updates every 5 minutes (reasonable frequency)
   - Only when app is visible (saves battery and API calls)

2. **Distance Calculations:** ✅ Already optimized
   - Only calculates when admin explicitly clicks "Refresh Distances"
   - No automatic calculations

3. **Monitor Usage:**
   - Set up billing alerts in Google Cloud Console
   - Track API usage in Google Cloud Console → APIs & Services → Dashboard

### If You Exceed Free Tier:

**Option 1:** Optimize further
- Increase location update interval from 5 minutes to 10-15 minutes
- Cache distance calculations for same technician-job pairs

**Option 2:** Upgrade to paid tier
- Only pay for usage beyond $200
- Example: If you use $250 worth of APIs, you pay $50

## Cost Breakdown Example

### Scenario: 10 Active Technicians

**Daily:**
- Location updates (free): 10 techs × 288 updates/day (every 5 min) = 2,880 updates
- Distance calculations: ~10-20 per day (only when assigning jobs)
- Map loads: ~50-100 per day

**Monthly:**
- Location updates: FREE (no cost)
- Distance calculations: ~300-600 requests/month ≈ $1.50-$3
- Geocoding: ~100-200 requests/month ≈ $0.50-$1
- Map loads: ~1,500-3,000 loads/month ≈ $10.50-$21

**Total estimated cost: ~$12-$25/month** (well within $200 free tier)

## Summary

✅ **You're currently using Google Maps API efficiently**
✅ **Technician location tracking is FREE** (uses browser geolocation)
✅ **Current usage should stay well within $200/month free credit**
✅ **No changes needed unless you have 50+ technicians or very high usage**

### Key Points:
- **Location updates:** FREE (browser API, unlimited)
- **Update frequency:** Every 5 minutes (configurable)
- **Distance calculations:** On-demand only (optimized)
- **Free tier:** $200/month covers typical usage for 10-50 technicians

