# Google Maps API Key Security Guide

## ⚠️ Important: Your API Key is Exposed in Frontend Code

Since we're calling Google Distance Matrix API directly from the browser, your API key is visible in the client-side code. This is **normal for Google Maps API**, but you **MUST** set up restrictions to protect it.

## 🔒 How to Secure Your API Key

### Step 1: Go to Google Cloud Console

1. Visit: https://console.cloud.google.com/
2. Select your project
3. Go to **APIs & Services** → **Credentials**
4. Find your API key and click **Edit** (pencil icon)

### Step 2: Set Application Restrictions

**HTTP referrers (web sites):**
- Add your production domain: `https://hydrogenro.com/*`
- Add your production domain with www: `https://www.hydrogenro.com/*`
- For development, you can add: `http://localhost:8080/*` (remove this in production)

**Example:**
```
https://hydrogenro.com/*
https://www.hydrogenro.com/*
http://localhost:8080/*  (development only)
```

### Step 3: Set API Restrictions

**Restrict key to these APIs:**
- ✅ **Distance Matrix API** (required for distance calculations)
- ✅ **Maps JavaScript API** (if you use maps elsewhere)
- ❌ **Do NOT** allow all APIs

**Why?** If someone steals your key, they can only use Distance Matrix API, not other Google services.

### Step 4: Set Up Usage Quotas & Alerts

1. Go to **APIs & Services** → **Dashboard**
2. Click on **Distance Matrix API**
3. Go to **Quotas** tab
4. Set daily quota limits (e.g., 1,500 requests/day = ~45,000/month)
5. Set up **alerts** for when you reach 80% of quota

### Step 5: Monitor Usage

1. Go to **APIs & Services** → **Dashboard**
2. Check **Distance Matrix API** usage
3. Set up billing alerts in **Billing** → **Budgets & alerts**

## 📊 Understanding Costs

- **Free Tier:** 40,000 elements/month
- **After Free Tier:** $5 per 1,000 elements
- **1 element** = 1 origin × 1 destination
- **Example:** 1 job location to 10 technicians = 10 elements

## 🛡️ Additional Security Measures

### Option 1: Use Server-Side Proxy (More Secure)

If you want extra security, you can:
1. Keep the Netlify function we created
2. Store API key in Netlify environment variables (not in frontend)
3. Call the function from frontend (API key stays hidden)

**Pros:** API key never exposed
**Cons:** Requires Netlify function to be running

### Option 2: Current Approach (Simpler)

**Pros:** 
- Simpler code
- No serverless function needed
- Works everywhere

**Cons:**
- API key visible in browser
- **MUST** set up restrictions (see steps above)

## ✅ Recommended Setup

For your use case, **Option 2 (current approach) is fine** IF you:
1. ✅ Set HTTP referrer restrictions (your domain only)
2. ✅ Set API restrictions (Distance Matrix only)
3. ✅ Monitor usage regularly
4. ✅ Set up billing alerts

## 🚨 What to Do If Key is Compromised

1. **Immediately** go to Google Cloud Console
2. **Regenerate** the API key
3. **Update** your environment variables
4. **Review** usage logs to see what was accessed
5. **Check** billing for unexpected charges

## 📝 Checklist

- [ ] API key has HTTP referrer restrictions set
- [ ] API key restricted to Distance Matrix API only
- [ ] Daily quota limits set
- [ ] Usage alerts configured
- [ ] Billing alerts set up
- [ ] Monitoring usage regularly

## 🔗 Useful Links

- Google Cloud Console: https://console.cloud.google.com/
- API Key Restrictions: https://console.cloud.google.com/apis/credentials
- Distance Matrix API Pricing: https://developers.google.com/maps/documentation/distance-matrix/pricing
- Best Practices: https://developers.google.com/maps/api-security-best-practices

