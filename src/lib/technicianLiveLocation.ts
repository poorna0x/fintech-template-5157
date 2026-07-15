/**
 * Live location for the technician Android app (Capacitor wrapper).
 *
 * Privacy / egress model: while the "Share live location" switch is ON the
 * native watcher keeps the latest fix in memory only. Nothing is uploaded
 * except:
 *   - one write when tracking starts/stops (so admin can see who is sharing),
 *   - while an admin has the "Technician live location" view open. The admin
 *     view stamps ping_requested_at every ~25s; the app listens over realtime
 *     and uploads every ~15s only while that stamp is fresh.
 *
 * On the plain website/PWA `isNativeApp()` is false and none of this runs.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface Location {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  bearing: number | null;
  time: number | null;
}

interface CallbackError extends Error {
  code?: string;
}

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (position?: Location, error?: CallbackError) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

/** Admin ping older than this = nobody is watching, stop uploading. */
const PING_FRESH_MS = 60_000;
/** Upload cadence while an admin is watching. */
const UPLOAD_INTERVAL_MS = 15_000;
/** Ignore movements smaller than this (native side filter). */
const DISTANCE_FILTER_METERS = 30;

let watcherId: string | null = null;
let lastLocation: Location | null = null;
let lastPingAt = 0;
let lastUploadAt = 0;
let uploadTimer: ReturnType<typeof setInterval> | null = null;
let pingChannel: RealtimeChannel | null = null;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function isLiveTrackingActive(): boolean {
  return watcherId !== null;
}

async function uploadLocation(technicianId: string, loc: Location): Promise<void> {
  lastUploadAt = Date.now();
  await supabase.from('technician_live_locations').upsert(
    {
      technician_id: technicianId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
      speed: loc.speed,
      heading: loc.bearing,
      is_tracking: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'technician_id' }
  );
}

function adminIsWatching(): boolean {
  return Date.now() - lastPingAt < PING_FRESH_MS;
}

function maybeUpload(technicianId: string): void {
  if (!lastLocation || !adminIsWatching()) return;
  if (Date.now() - lastUploadAt < UPLOAD_INTERVAL_MS - 1_000) return;
  void uploadLocation(technicianId, lastLocation);
}

function startPingListener(technicianId: string): void {
  stopPingListener();
  pingChannel = supabase
    .channel(`tech-live-loc-${technicianId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'technician_live_locations',
        filter: `technician_id=eq.${technicianId}`,
      },
      (payload) => {
        const ping = (payload.new as { ping_requested_at?: string | null })?.ping_requested_at;
        if (!ping) return;
        const pingMs = new Date(ping).getTime();
        if (pingMs <= lastPingAt) return; // our own upload echoing back
        lastPingAt = pingMs;
        maybeUpload(technicianId);
      }
    )
    .subscribe();

  // Cheap 5s tick: uploads only happen while a fresh admin ping exists.
  uploadTimer = setInterval(() => maybeUpload(technicianId), 5_000);
}

function stopPingListener(): void {
  if (uploadTimer) {
    clearInterval(uploadTimer);
    uploadTimer = null;
  }
  if (pingChannel) {
    void supabase.removeChannel(pingChannel);
    pingChannel = null;
  }
}

/**
 * Start background tracking. Returns true when the watcher started
 * (permission prompts are handled by the plugin).
 */
export async function startLiveTracking(technicianId: string): Promise<boolean> {
  if (!isNativeApp() || watcherId !== null) return watcherId !== null;

  try {
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'HydrogenRO — on duty',
        backgroundMessage: 'Location is shared with the office only when requested.',
        requestPermissions: true,
        stale: false,
        distanceFilter: DISTANCE_FILTER_METERS,
      },
      (position, error) => {
        if (error) {
          if (error.code === 'NOT_AUTHORIZED') {
            void stopLiveTracking(technicianId);
            void BackgroundGeolocation.openSettings();
          }
          return;
        }
        if (position) {
          const isFirstFix = lastLocation === null;
          lastLocation = position;
          // First fix creates/updates the row so admin sees "sharing is on".
          if (isFirstFix) void uploadLocation(technicianId, position);
          else maybeUpload(technicianId);
        }
      }
    );
    startPingListener(technicianId);
    return true;
  } catch {
    watcherId = null;
    return false;
  }
}

/** Stop tracking and mark the technician's row as no longer live. */
export async function stopLiveTracking(technicianId: string): Promise<void> {
  stopPingListener();
  lastLocation = null;
  lastPingAt = 0;

  const id = watcherId;
  watcherId = null;
  if (id !== null) {
    try {
      await BackgroundGeolocation.removeWatcher({ id });
    } catch {
      // watcher already gone
    }
  }

  await supabase
    .from('technician_live_locations')
    .update({ is_tracking: false, updated_at: new Date().toISOString() })
    .eq('technician_id', technicianId);
}
