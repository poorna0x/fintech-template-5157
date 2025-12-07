# Google Maps Link Edit Flow in Admin Customer Edit Page

This document explains what happens when you edit or add a Google Maps link in the admin customer edit page (`EditCustomerDialog.tsx`).

## Overview

When a user types or pastes a Google Maps link in the "Google Maps Location" input field, several automatic processes are triggered to extract location data and update the customer record.

## Step-by-Step Flow

### 1. **User Input Event** (`handleGoogleMapsLinkChange`)

**Location:** `src/components/admin/EditCustomerDialog.tsx` (lines 700-730)

When a user types or pastes a Google Maps link:
- The `handleGoogleMapsLinkChange` function is called
- The input value is immediately saved to `editFormData.google_location`
- **Coordinates are extracted and saved** (if possible)
- **Reverse geocoding does NOT happen automatically** - user must click "Fetch Address" button

### 2. **Coordinate Extraction** (`extractCoordinatesFromGoogleMapsLink`)

**Location:** `src/components/admin/EditCustomerDialog.tsx` (lines 486-522)

The system attempts to extract latitude and longitude coordinates from the URL using three different patterns:

1. **Precise coordinates pattern:** `!3d([0-9.-]+)!4d([0-9.-]+)`
   - Used for URLs with precise coordinate markers
   - Example: `https://www.google.com/maps/place/...!3d12.9716!4d77.5946`

2. **Place pattern:** `/place/([0-9.-]+),([0-9.-]+)`
   - Used for standard Google Maps place URLs
   - Example: `https://www.google.com/maps/place/12.9716,77.5946`

3. **At symbol pattern:** `@([0-9.-]+),([0-9.-]+)`
   - Used for URLs with @ symbol coordinates
   - Example: `https://www.google.com/maps/@12.9716,77.5946`

**Validation:**
- Coordinates must be valid numbers
- Latitude must be between -90 and 90
- Longitude must be between -180 and 180

### 2. **Form State Update (On Input)**

**Location:** `src/components/admin/EditCustomerDialog.tsx` (lines 700-730)

When coordinates are successfully extracted:
- Only coordinates are saved to form state
- No reverse geocoding happens automatically
- User sees a toast: "Coordinates extracted: [lat], [lng]. Click 'Fetch Address' to get the address."

```typescript
{
  location: {
    latitude: coords.latitude,
    longitude: coords.longitude,
    formattedAddress: prev.location.formattedAddress || '' // Preserves existing address
  },
  google_location: value  // The original Google Maps URL
}
```

**Note:** Address fields are NOT updated automatically - user must click "Fetch Address" button.

### 3. **Manual "Fetch Address" Button** ⭐ **REQUIRED FOR REVERSE GEOCODING**

**Location:** `src/components/admin/EditCustomerDialog.tsx` (lines 633-698)

**This is the ONLY way reverse geocoding happens.** Users must click the "Fetch Address" button (`fetchAddressFromGoogleLocation`) to:

1. **Extract coordinates** from the Google Maps link (if not already extracted)
2. **Load Google Maps Script** (`loadGoogleMapsScript`) if needed
3. **Reverse geocode** (`reverseGeocode`) to get human-readable address
4. **Extract location identifier** (`extractLocationFromAddressString`)
5. **Update form fields** with address data

### 4. **Google Maps Script Loading** (`loadGoogleMapsScript`)

**Location:** `src/components/admin/EditCustomerDialog.tsx` (lines 524-580)

When "Fetch Address" button is clicked:
- Checks if Google Maps API is already loaded
- If not loaded and API key exists, dynamically loads the Google Maps JavaScript API
- Script URL: `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`
- Waits up to 10 seconds for the script to load
- Uses async/defer loading for better performance

### 5. **Reverse Geocoding** (`reverseGeocode`)

**Location:** `src/components/admin/EditCustomerDialog.tsx` (lines 582-606)

When "Fetch Address" button is clicked:
- Attempts to reverse geocode the coordinates to get a human-readable address
- Uses Google Maps Geocoder API if available
- Falls back to OpenStreetMap Nominatim API if Google Maps fails

**Fallback Process** (`reverseGeocodeOpenStreetMap`):
- Makes a request to: `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
- Extracts `display_name` from the response
- Used when Google Maps API is unavailable or fails

### 6. **Location Extraction** (`extractLocationFromAddressString`)

**Location:** `src/lib/adminUtils.ts` (imported function)

After getting the address (via "Fetch Address" button):
- Extracts a short location identifier (e.g., "Koramangala", "Whitefield")
- Used to populate the `visible_address` field (one-word location identifier)
- Only updates if `locationManuallyEditedRef.current` is false (user hasn't manually edited it)

### 7. **Form State Update (After Fetch Address)**

**Location:** `src/components/admin/EditCustomerDialog.tsx` (lines 663-681)

After clicking "Fetch Address" button, the form state is updated with:

```typescript
{
  location: {
    latitude: coords.latitude,
    longitude: coords.longitude,
    formattedAddress: address || prev.location.formattedAddress || ''
  },
  address: {
    street: address || prev.address.street || '',
    area: '',
    city: '',
    state: '',
    pincode: ''
  },
  visible_address: extractedLocation ? extractedLocation.substring(0, 20) : prev.visible_address
}
```

**Note:** The `address` fields (area, city, state, pincode) are cleared and only `street` is populated with the full address.

### 8. **User Feedback**

**Toast Notifications:**

- **On Input:** "Coordinates extracted: [lat], [lng]. Click 'Fetch Address' to get the address."
- **On Fetch Address Success:** Shows fetched address (first 50 characters)
- **On Fetch Address Info:** Shows location identifier if extracted
- **On Fetch Address Warning:** If coordinates extracted but address fetch failed
- **On Invalid Link:** "Please enter a valid Google Maps link"

### 9. **Saving to Database** (`handleUpdateCustomer`)

**Location:** `src/components/admin/EditCustomerDialog.tsx` (lines 827-910)

When the user clicks "Update Customer":

1. **Location Object Construction** (lines 840-850):
   ```typescript
   const updatedLocation: any = {
     latitude: editFormData.location.latitude || 0,
     longitude: editFormData.location.longitude || 0,
     formattedAddress: editFormData.address.street || editFormData.location.formattedAddress || '',
   };
   
   if (editFormData.google_location && editFormData.google_location.trim()) {
     updatedLocation.googleLocation = editFormData.google_location;
   }
   ```

2. **Database Update** (line 885):
   ```typescript
   const { data: updatedCustomerFromDb, error } = await db.customers.update(customer.id, updateData);
   ```

3. **Update Data Structure**:
   - Includes `address` object with street, area, city, state, pincode
   - Includes `location` object with latitude, longitude, formattedAddress, and **googleLocation**
   - The `googleLocation` field stores the original Google Maps URL

### 10. **Auto-Save on Dialog Close**

**Location:** `src/components/admin/EditCustomerDialog.tsx` (lines 922-997)

If the user closes the dialog without clicking "Update Customer":
- Checks if there are unsaved changes (`hasUnsavedChangesRef.current`)
- Automatically saves the customer data including the Google Maps link
- Uses the same update logic as manual save

### 11. **Database Storage**

**Location:** `src/lib/supabase.ts` (lines 154-168)

The update is performed via Supabase:
```typescript
async update(id: string, updates: Database['public']['Tables']['customers']['Update']) {
  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select();
  
  return { data: data?.[0] || null, error: null };
}
```

The `location` field in the database stores:
- `latitude`: number
- `longitude`: number
- `formatted_address`: string (full address)
- `googleLocation`: string (the Google Maps URL)

## Special Cases

### Short Links (goo.gl/maps, maps.app.goo.gl)

- Short links are saved but cannot extract coordinates automatically
- User sees: "Google Maps link saved. Note: Short links cannot extract address automatically."
- User can manually click "Fetch Address" button, but it may not work if the short link doesn't resolve to coordinates

### Empty/Invalid Links

- If the input is cleared, coordinates are reset to 0,0
- If coordinates can't be extracted, the link is still saved but no address is fetched
- If address fetch fails, coordinates are still saved

### Location Already Set

- If `visible_address` is already set and `locationManuallyEditedRef.current` is true, the visible address won't be auto-updated
- This prevents overwriting user's manual location edits

## UI Components

**Input Field:**
- Located at line 1149-1155
- Placeholder: "Paste Google Maps share link here..."
- Triggers `handleGoogleMapsLinkChange` on change

**Action Buttons:**
1. **Fetch Address** (lines 1158-1168):
   - Only visible when `google_location` has a value
   - Manually triggers address fetching
   - Shows download icon

2. **Test** (lines 1169-1181):
   - Opens the Google Maps link in a new tab
   - Uses `window.open` with security flags (`noopener,noreferrer`)

## Error Handling

1. **Invalid URL:** Shows error toast if URL doesn't contain Google Maps patterns
2. **Coordinate Extraction Failure:** Shows error toast, but still saves the link
3. **Geocoding Failure:** Falls back to OpenStreetMap, shows warning if both fail
4. **Script Loading Failure:** Continues with OpenStreetMap fallback
5. **Database Update Failure:** Shows error toast with error message

## Dependencies

- **Google Maps API Key:** Required for reverse geocoding (stored in `VITE_GOOGLE_MAPS_API_KEY`)
- **OpenStreetMap Nominatim:** Fallback service (no API key required)
- **adminUtils.extractLocationFromAddressString:** Extracts location identifier from address string

## Summary

When editing or adding a Google Maps link:

1. ✅ Link is immediately saved to form state
2. ✅ Coordinates are extracted from URL (if possible) and saved
3. ⚠️ **Reverse geocoding does NOT happen automatically**
4. ✅ User must click **"Fetch Address"** button to trigger reverse geocoding
5. ✅ When "Fetch Address" is clicked:
   - Google Maps API script is loaded (if needed)
   - Address is reverse geocoded from coordinates
   - Location identifier is extracted from address
   - Form fields are populated (address, location)
6. ✅ User receives feedback via toast notifications
7. ✅ Data is saved to database when user clicks "Update Customer" or closes dialog
8. ✅ Original Google Maps URL is stored in `location.googleLocation` field

**Important:** Reverse geocoding is **manual** - users must click the "Fetch Address" button after pasting the link!

