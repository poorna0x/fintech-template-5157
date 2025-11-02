# 🚨 Netlify Environment Variables Not Loading - Quick Fix

## The Problem

If you added `VITE_GOOGLE_MAPS_API_KEY` to Netlify but it's still showing "not configured", it's usually because:

1. **Environment variables are added but deployment hasn't been retriggered**
2. **Variable name is wrong** (typo or missing `VITE_` prefix)
3. **Variable value has extra spaces/quotes**
4. **Build cache issue**

---

## ✅ **Step-by-Step Fix**

### **Step 1: Verify Variable in Netlify Dashboard**

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Select your site
3. Go to **Site settings** → **Environment variables**
4. Check:
   - ✅ **Key** is exactly: `VITE_GOOGLE_MAPS_API_KEY`
   - ✅ **Value** is your actual API key (no spaces before/after, no quotes)
   - ✅ **Scope** is set (should be "All scopes" or "Production")

### **Step 2: Clear Deploy Log Cache & Redeploy**

**CRITICAL**: After adding environment variables, you MUST redeploy!

1. Go to **Deploys** tab in Netlify
2. Click **Trigger deploy** → **Clear cache and deploy site**
3. Wait for the deployment to complete

### **Step 3: Verify in Deploy Logs**

1. Click on the latest deploy
2. Expand **Environment variables** section
3. Check if `VITE_GOOGLE_MAPS_API_KEY` appears in the list

**Note**: The actual value will be hidden for security (shows as `***`), but the key name should be visible.

---

## 🛠️ **Common Issues & Fixes**

### **Issue 1: Variable Not Appearing in Deploy Logs**

**Cause**: Variable wasn't saved properly

**Fix**:
1. Delete the variable
2. Add it again
3. Clear cache and redeploy

### **Issue 2: Variable Shows in Logs But Still Doesn't Work**

**Cause**: Typo in variable name or extra characters in value

**Fix**:
- Double-check the variable name: `VITE_GOOGLE_MAPS_API_KEY`
- Make sure value has no leading/trailing spaces
- Make sure value has no quotes around it
- Example:
  - ❌ Wrong: `"AIzaSy..."` (quotes)
  - ❌ Wrong: ` AIzaSy... ` (spaces)
  - ✅ Correct: `AIzaSy...` (clean)

### **Issue 3: Works Locally But Not in Production**

**Cause**: Different values in local `.env.local` vs Netlify

**Fix**:
1. Check your local `.env.local` has the same key
2. Make sure Netlify has the production API key (not test key)
3. Redeploy after making changes

---

## 🧪 **How to Test**

After redeploying, open your deployed site and check the browser console:

**Expected Output** (if working):
```
✅ Google Maps API key loaded successfully
```

**Error Output** (if not working):
```
❌ Google Maps API key not configured properly!
Please set VITE_GOOGLE_MAPS_API_KEY in your environment variables.
```

---

## 📝 **Quick Checklist**

- [ ] Variable name is: `VITE_GOOGLE_MAPS_API_KEY`
- [ ] Variable value is your real API key (no spaces, no quotes)
- [ ] Clicked "Save" after adding the variable
- [ ] Cleared cache and triggered new deploy
- [ ] Waited for deployment to complete
- [ ] Checked deploy logs show the variable
- [ ] Tested on deployed site (not localhost)

---

## 🆘 **Still Not Working?**

If after all these steps it still doesn't work:

1. **Check Netlify status**: https://www.netlifystatus.com/
2. **Check GitHub Actions** (if using CI/CD): Make sure it's also set there
3. **Try a different variable name**: Sometimes there are caching issues
4. **Contact Netlify support** with your site name and deploy log

---

## 📚 **Reference**

- [Netlify Environment Variables Docs](https://docs.netlify.com/environment-variables/overview/)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Google Maps API Setup](https://console.cloud.google.com/google/maps-apis)

