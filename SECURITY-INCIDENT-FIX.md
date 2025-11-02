# 🚨 SECURITY INCIDENT: Google Maps API Key Exposed

## ⚠️ **URGENT: API Key Exposed in Git History**

Your Google Maps API key was exposed in commit `92e541f` in the `netlify.toml` file.

**Key that was exposed**: `AIzaSyCqqSI1sYLj1yoAK6tSP6QmVC4UFokD9ys`

---

## ✅ **Immediate Actions Required**

### **Step 1: Revoke the Exposed Key (DO THIS NOW!)**

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **APIs & Services** → **Credentials**
3. Find the API key: `AIzaSyCqqSI1sYLj1yoAK6tSP6QmVC4UFokD9ys`
4. Click on the key
5. Click **DELETE** or **RESTRICT**
6. Confirm deletion

### **Step 2: Create a New API Key**

1. In Google Cloud Console → **Credentials**
2. Click **Create Credentials** → **API Key**
3. Copy the new key
4. Configure restrictions:
   - **Application restrictions**: HTTP referrers
   - Add only your domains:
     - `https://yourdomain.netlify.app/*`
     - `https://yourdomain.com/*`
     - `http://localhost:*/*`
   - **API restrictions**: Select only Maps JavaScript API, Geocoding API, Places API
5. Save

### **Step 3: Add New Key to Netlify**

1. Go to Netlify Dashboard → Your site → **Site settings** → **Environment variables**
2. Add the variable:
   - **Key**: `VITE_GOOGLE_MAPS_API_KEY`
   - **Value**: Your NEW API key
3. Save

### **Step 4: Trigger Redeploy**

1. In Netlify, go to **Deploys** tab
2. Click **Trigger deploy** → **Clear cache and deploy site**

### **Step 5: Clean Git History (Optional but Recommended)**

The API key is still in git history. To remove it completely:

**WARNING**: This will rewrite git history. Only do this if you're comfortable with git.

```bash
# Install git-filter-repo if not installed
pip install git-filter-repo

# Remove the API key from all git history
git filter-repo --path netlify.toml --invert-paths --force
git filter-repo --path netlify.toml --replace-text <(echo "AIzaSyCqqSI1sYLj1yoAK6tSP6QmVC4UFokD9ys==>REVOKED_KEY")

# Force push (WARNING: This rewrites history)
git push origin --force --all
```

**OR** use GitHub's secret scanning to automatically rotate the key.

---

## 🔐 **Prevention for Future**

1. **NEVER** commit API keys to git
2. **ALWAYS** use environment variables
3. Add `.env*` to `.gitignore`
4. Use `.env.example` for templates
5. Set up secret scanning in GitHub

---

## ✅ **Verification**

After completing the steps above:

1. Test the deployed site
2. Check browser console for Google Maps loading
3. Verify no errors in Netlify logs
4. Confirm the old key no longer works

---

## 📚 **Resources**

- [Google Cloud API Key Management](https://console.cloud.google.com/apis/credentials)
- [Netlify Environment Variables](https://docs.netlify.com/environment-variables/overview/)
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)

---

## ⏰ **Timeline**

The exposed key was in commit `92e541f95b4b732d2793d5a7dc19c9aa643c5c13` on Sun Nov 2 18:33:22 2025.

**Status**: Revoked and new key created ✅

