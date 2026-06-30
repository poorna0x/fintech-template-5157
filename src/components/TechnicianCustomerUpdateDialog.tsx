import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MapPin, Navigation, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import DraggableMap from '@/components/DraggableMap';
import { db } from '@/lib/supabase';
import { ensureSupabaseSessionForWrite } from '@/lib/ensureSupabaseSession';
import { normalizeCustomerAddress } from '@/lib/customer-address';
import { extractLocationFromAddressString } from '@/lib/adminUtils';
import { hasValidMapCoordinates, readLocationLatLng } from '@/lib/maps';
import {
  canTechnicianEditCustomerForJob,
  capitalizeCustomerName,
} from '@/lib/technicianCustomerUpdate';
import type { Job } from '@/types';

const DEFAULT_MAP_CENTER = { lat: 12.9716, lng: 77.5946 };

async function reverseGeocodeAddress(lat: number, lng: number): Promise<string | null> {
  if (!window.google?.maps?.Geocoder) return null;
  return new Promise((resolve) => {
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === window.google.maps.GeocoderStatus.OK && results?.[0]) {
        resolve(results[0].formatted_address);
      } else {
        resolve(null);
      }
    });
  });
}

export type TechnicianCustomerUpdatePatch = {
  full_name?: string;
  email?: string;
  alternate_phone?: string;
  visible_address?: string;
  address?: Record<string, unknown>;
  location?: Record<string, unknown>;
};

interface TechnicianCustomerUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  onSaved?: (customerId: string, patch: TechnicianCustomerUpdatePatch) => void;
}

function readEmbeddedCustomerId(job: Job | null): string | null {
  if (!job) return null;
  const embedded = job.customer as Record<string, unknown> | undefined;
  return (
    (embedded?.id as string | undefined) ||
    job.customer_id ||
    (job as { customerId?: string }).customerId ||
    null
  );
}

const TechnicianCustomerUpdateDialog: React.FC<TechnicianCustomerUpdateDialogProps> = ({
  open,
  onOpenChange,
  job,
  onSaved,
}) => {
  const jobSnapshotRef = useRef<Job | null>(null);
  const loadedSessionRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [fullName, setFullName] = useState('');
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [email, setEmail] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [visibleAddress, setVisibleAddress] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [mapCenter, setMapCenter] = useState(DEFAULT_MAP_CENTER);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [formattedAddress, setFormattedAddress] = useState('');

  const [initialFullName, setInitialFullName] = useState('');
  const [initialEmail, setInitialEmail] = useState('');
  const [initialAlternatePhone, setInitialAlternatePhone] = useState('');
  const [initialVisibleAddress, setInitialVisibleAddress] = useState('');
  const [initialAddressStreet, setInitialAddressStreet] = useState('');
  const [initialCoords, setInitialCoords] = useState<{ lat: number; lng: number } | null>(null);

  const activeJob = jobSnapshotRef.current ?? job;
  const jobId = activeJob?.id;

  const jobNumber = useMemo(
    () => String(activeJob?.job_number || activeJob?.jobNumber || ''),
    [activeJob]
  );

  const jobAllowed = useMemo(() => canTechnicianEditCustomerForJob(activeJob), [activeJob]);

  const assertJobAllowed = (): boolean => {
    if (!jobId || !jobAllowed) {
      toast.error('Customer details can only be updated for your active assigned jobs');
      return false;
    }
    return true;
  };

  const resetForm = useCallback(() => {
    setCustomerId('');
    setFullName('');
    setPrimaryPhone('');
    setEmail('');
    setAlternatePhone('');
    setVisibleAddress('');
    setAddressStreet('');
    setMapCenter(DEFAULT_MAP_CENTER);
    setCoords(null);
    setFormattedAddress('');
    setInitialFullName('');
    setInitialEmail('');
    setInitialAlternatePhone('');
    setInitialVisibleAddress('');
    setInitialAddressStreet('');
    setInitialCoords(null);
    setLoading(false);
    setSaving(false);
    setGpsLoading(false);
  }, []);

  const hydrateFromRow = useCallback((row: Record<string, unknown>) => {
    const address = normalizeCustomerAddress(row.address, {
      visible_address: row.visible_address,
    });
    const location = (row.location as Record<string, unknown>) || {};
    const latLng = readLocationLatLng(location);
    const street = address.street || String(location.formattedAddress || location.formatted_address || '');
    const vis =
      String(row.visible_address || address.visible_address || '').trim() ||
      (street ? extractLocationFromAddressString(street)?.substring(0, 20) || '' : '');
    const name = capitalizeCustomerName(String(row.full_name || 'Customer'));

    setCustomerId(String(row.id));
    setFullName(name);
    setPrimaryPhone(String(row.phone || ''));
    setEmail(String(row.email || ''));
    setAlternatePhone(String(row.alternate_phone || ''));
    setVisibleAddress(vis);
    setAddressStreet(street);
    setFormattedAddress(String(location.formattedAddress || location.formatted_address || street || ''));

    setInitialFullName(name);
    setInitialEmail(String(row.email || ''));
    setInitialAlternatePhone(String(row.alternate_phone || ''));
    setInitialVisibleAddress(vis);
    setInitialAddressStreet(street);
    setInitialCoords(latLng);

    if (latLng) {
      setCoords(latLng);
      setMapCenter(latLng);
    } else {
      setCoords(null);
      setMapCenter(DEFAULT_MAP_CENTER);
    }
  }, []);

  useEffect(() => {
    if (open && job) {
      jobSnapshotRef.current = job;
    }
    if (!open) {
      jobSnapshotRef.current = null;
      loadedSessionRef.current = null;
      resetForm();
    }
  }, [open, job, resetForm]);

  useEffect(() => {
    if (!open || !jobId) return;

    const sessionKey = jobId;
    if (loadedSessionRef.current === sessionKey) return;
    loadedSessionRef.current = sessionKey;

    const snapshot = jobSnapshotRef.current ?? job;
    const embedded = snapshot?.customer as Record<string, unknown> | undefined;
    const id = readEmbeddedCustomerId(snapshot);

    if (!id) {
      toast.error('Customer not found for this job');
      onOpenChange(false);
      return;
    }

    if (embedded) {
      hydrateFromRow({
        id,
        full_name: embedded.full_name || embedded.fullName,
        phone: embedded.phone,
        email: embedded.email,
        alternate_phone: embedded.alternate_phone || embedded.alternatePhone,
        visible_address: embedded.visible_address,
        address: embedded.address,
        location: embedded.location,
      });
    } else {
      setLoading(true);
    }

    let cancelled = false;

    void (async () => {
      const { data, error } = await db.customers.getByIdForTechnicianUpdate(String(id));
      if (cancelled) return;
      setLoading(false);

      if (error || !data) {
        if (!embedded) {
          toast.error('Could not load customer details');
          onOpenChange(false);
        }
        return;
      }

      hydrateFromRow(data as Record<string, unknown>);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, jobId, hydrateFromRow, onOpenChange, job]);

  const applyMapCoords = useCallback(async (lat: number, lng: number) => {
    const next = { lat, lng };
    setCoords(next);
    setMapCenter(next);
    const address = await reverseGeocodeAddress(lat, lng);
    if (address) {
      setFormattedAddress(address);
      setAddressStreet((prev) => (prev.trim() ? prev : address));
      setVisibleAddress((prev) => {
        if (prev.trim()) return prev;
        const extracted = extractLocationFromAddressString(address);
        return extracted ? extracted.substring(0, 20) : prev;
      });
    }
  }, []);

  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Location is not supported on this device');
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setGpsLoading(false);
        await applyMapCoords(position.coords.latitude, position.coords.longitude);
        toast.success('Location set from GPS — drag the pin if needed');
      },
      (error) => {
        setGpsLoading(false);
        toast.error(error.message || 'Could not get your location');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, [applyMapCoords]);

  const handleMapDrag = useCallback(
    async (location: { lat: number; lng: number }) => {
      await applyMapCoords(location.lat, location.lng);
    },
    [applyMapCoords]
  );

  const handleNameBlur = () => {
    const capped = capitalizeCustomerName(fullName);
    if (capped !== fullName) setFullName(capped);
  };

  const handleSave = async () => {
    if (!customerId || !jobId) return;
    if (!assertJobAllowed()) return;

    const cappedName = capitalizeCustomerName(fullName);
    if (cappedName !== fullName) setFullName(cappedName);

    const trimmedEmail = email.trim();
    const trimmedAlternate = alternatePhone.trim();
    const nameChanged = cappedName !== initialFullName.trim();
    const locationChanged =
      coords &&
      (!initialCoords ||
        Math.abs(coords.lat - initialCoords.lat) > 0.00001 ||
        Math.abs(coords.lng - initialCoords.lng) > 0.00001);
    const visibleChanged = visibleAddress.trim() !== initialVisibleAddress.trim();
    const streetChanged = addressStreet.trim() !== initialAddressStreet.trim();
    const emailChanged = trimmedEmail !== initialEmail.trim();
    const alternateChanged = trimmedAlternate !== initialAlternatePhone.trim();

    if (
      !nameChanged &&
      !emailChanged &&
      !alternateChanged &&
      !locationChanged &&
      !visibleChanged &&
      !streetChanged
    ) {
      toast.info('No changes to save');
      return;
    }

    if (nameChanged && !cappedName) {
      toast.error('Customer name is required');
      return;
    }

    if ((visibleChanged || streetChanged || locationChanged) && !coords) {
      toast.error('Set the location on the map or use current GPS before saving address');
      return;
    }

    const sessionReady = await ensureSupabaseSessionForWrite();
    if (!sessionReady.ok) {
      toast.error('Could not refresh your session. Please try again.');
      return;
    }

    setSaving(true);
    try {
      const updatePayload: Record<string, unknown> = {};

      if (nameChanged) {
        updatePayload.full_name = cappedName;
      }
      if (emailChanged) {
        updatePayload.email = trimmedEmail;
      }
      if (alternateChanged) {
        updatePayload.alternate_phone = trimmedAlternate;
      }

      if (locationChanged || visibleChanged || streetChanged) {
        const street = addressStreet.trim() || formattedAddress.trim();
        const googleLocation = coords
          ? `https://www.google.com/maps/place/${coords.lat},${coords.lng}`
          : undefined;

        updatePayload.visible_address = visibleAddress.trim();
        updatePayload.address = {
          street,
          area: '',
          city: '',
          state: '',
          pincode: '',
        };
        updatePayload.location = {
          latitude: coords!.lat,
          longitude: coords!.lng,
          formattedAddress: street,
          ...(googleLocation ? { googleLocation } : {}),
        };
      }

      const { error } = await db.customers.updateByTechnician(customerId, jobId, updatePayload);
      if (error) {
        toast.error(error.message || 'Could not save customer details');
        return;
      }

      toast.success('Customer details updated');
      onSaved?.(customerId, updatePayload as TechnicianCustomerUpdatePatch);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const showMap = coords && hasValidMapCoordinates(coords);

  const handleDialogOpenChange = (next: boolean) => {
    if (!next && saving) return;
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5" />
            Update customer details
          </DialogTitle>
          <DialogDescription asChild>
            <span>
              {jobNumber ? `Job #${jobNumber} · ` : ''}
              Update name, contact, and location. Primary phone cannot be changed here.
            </span>
          </DialogDescription>
        </DialogHeader>

        {loading && !customerId ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading customer…
          </div>
        ) : !jobAllowed ? (
          <div className="py-8 text-center text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4">
            Customer details can only be updated while this job is active and assigned to you.
          </div>
        ) : (
          <div className="space-y-5 py-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tech-cust-name">Customer name</Label>
                <Input
                  id="tech-cust-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={handleNameBlur}
                  placeholder="Customer full name"
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tech-cust-primary-phone">Primary phone</Label>
                <Input
                  id="tech-cust-primary-phone"
                  value={primaryPhone}
                  readOnly
                  className="bg-muted/50"
                  tabIndex={-1}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tech-cust-email">Email</Label>
              <Input
                id="tech-cust-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@email.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tech-cust-alt-phone">Alternate phone</Label>
              <Input
                id="tech-cust-alt-phone"
                type="tel"
                value={alternatePhone}
                onChange={(e) => setAlternatePhone(e.target.value)}
                placeholder="Secondary contact (optional)"
              />
            </div>

            <div className="space-y-3 pt-1 border-t">
              <div className="flex items-center justify-between gap-2">
                <Label className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" />
                  Location
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={gpsLoading}
                  onClick={handleUseCurrentLocation}
                >
                  {gpsLoading ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Navigation className="w-4 h-4 mr-1.5" />
                  )}
                  Use current GPS
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tech-cust-visible-address">Area / locality</Label>
                <Input
                  id="tech-cust-visible-address"
                  value={visibleAddress}
                  onChange={(e) => setVisibleAddress(e.target.value)}
                  placeholder="e.g. HSR Layout"
                  maxLength={20}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tech-cust-street">House / flat / full address</Label>
                <Textarea
                  id="tech-cust-street"
                  value={addressStreet}
                  onChange={(e) => setAddressStreet(e.target.value)}
                  placeholder="Flat no., building, street…"
                  rows={2}
                />
              </div>

              {showMap ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Drag the pin on the map to correct the exact location.
                  </p>
                  <div className="rounded-lg overflow-hidden border">
                    <DraggableMap
                      key={customerId || 'map'}
                      center={mapCenter}
                      onLocationChange={handleMapDrag}
                      zoom={17}
                      height="260px"
                    />
                  </div>
                  {coords && (
                    <p className="text-xs text-muted-foreground font-mono">
                      {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
                  Tap <strong>Use current GPS</strong> to open the map, then drag the pin to the correct spot.
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={loading || saving || !jobAllowed || !customerId}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              'Save changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TechnicianCustomerUpdateDialog;
