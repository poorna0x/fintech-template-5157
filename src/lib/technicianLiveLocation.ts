/**
 * Live location for the technician Android app (Capacitor wrapper).
 *
 * Notification-minimal design: enabling "Share live location" does NOT keep a
 * location service (or its status-bar notification) running. Instead the app
 * listens on a realtime channel; when an admin opens the "Technician live
 * location" view, it stamps ping_requested_at, and only then does the app
 * start the native watcher (notification appears), upload every ~15s, and
 * stop again ~90s after the last ping (notification disappears).
 *
 * On enable we run the watcher once briefly to trigger the Android permission
 * prompt and store one "last known" fix, then shut it down.
 *
 * Limitation (no push notifications yet): if Android has fully frozen the app
 * in the background, the ping is only received once the technician reopens
 * the app. The admin view shows the last-known location and its age.
 *
 * On the plain website/PWA `isNativeApp()` is false and none of this runs.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { registerTechnicianPushToken, setLocationRequestHandler } from '@/lib/technicianPush';

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

/** Watcher stops (notification disappears) this long after the last admin ping. */
const STOP_AFTER_LAST_PING_MS = 90_000;
/** Upload cadence while an admin is watching. */
const UPLOAD_INTERVAL_MS = 15_000;
/** Ignore movements smaller than this (native side filter). */
const DISTANCE_FILTER_METERS = 20;

let sharingEnabled = false;
let watcherId: string | null = null;
let startingWatcher = false;
let lastLocation: Location | null = null;
let lastPingAt = 0;
let lastUploadAt = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let pingChannel: RealtimeChannel | null = null;
let currentTechnicianId: string | null = null;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** True when the "Share live location" switch is on (listener active). */
export function isLiveTrackingActive(): boolean {
  return sharingEnabled;
}

function adminIsWatching(): boolean {
  return Date.now() - lastPingAt < STOP_AFTER_LAST_PING_MS;
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

async function stopWatcherOnly(): Promise<void> {
  const id = watcherId;
  watcherId = null;
  if (id !== null) {
    try {
      await BackgroundGeolocation.removeWatcher({ id });
    } catch {
      // watcher already gone
    }
  }
}

/**
 * Start the native watcher (this is what shows the notification).
 * `oneShot` = permission/last-known bootstrap on enable: stop after first fix
 * unless an admin started watching in the meantime.
 */
async function startWatcher(technicianId: string, oneShot: boolean): Promise<boolean> {
  if (watcherId !== null || startingWatcher) return true;
  startingWatcher = true;
  try {
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'HydrogenRO — sharing location',
        backgroundMessage: 'The office is viewing your live location right now.',
        requestPermissions: true,
        stale: oneShot, // a cached fix is fine for the enable bootstrap
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
        if (!position) return;
        lastLocation = position;
        if (Date.now() - lastUploadAt >= UPLOAD_INTERVAL_MS - 1_000 || oneShot) {
          void uploadLocation(technicianId, position);
        }
        // Native callbacks keep firing even if JS timers are throttled in the
        // background, so the stop check lives here too.
        if (!adminIsWatching() && (oneShot || lastPingAt !== 0)) {
          void stopWatcherOnly();
        }
      }
    );
    return true;
  } catch {
    watcherId = null;
    return false;
  } finally {
    startingWatcher = false;
  }
}

function onTick(): void {
  const technicianId = currentTechnicianId;
  if (!technicianId) return;

  if (adminIsWatching()) {
    // Admin is viewing: make sure the watcher runs and uploads are fresh.
    if (watcherId === null) void startWatcher(technicianId, false);
    else if (lastLocation && Date.now() - lastUploadAt >= UPLOAD_INTERVAL_MS) {
      void uploadLocation(technicianId, lastLocation);
    }
  } else if (watcherId !== null && lastPingAt !== 0) {
    // Admin closed the view: stop the watcher so the notification disappears.
    void stopWatcherOnly();
  }
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
        if (watcherId === null) void startWatcher(technicianId, false);
      }
    )
    .subscribe();

  tickTimer = setInterval(onTick, 5_000);
}

function stopPingListener(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
  if (pingChannel) {
    void supabase.removeChannel(pingChannel);
    pingChannel = null;
  }
}

/** Treat a wake-up signal (FCM push) exactly like a fresh admin ping. */
function onLocationRequested(): void {
  const technicianId = currentTechnicianId;
  if (!sharingEnabled || !technicianId) return;
  lastPingAt = Date.now();
  if (watcherId === null) void startWatcher(technicianId, false);
}

/**
 * Register for FCM push (shared with job notifications) and route silent
 * { type: 'location_request' } pushes to the watcher. The push wakes the app
 * even when the realtime websocket is frozen in the background.
 */
async function setupPushWakeup(technicianId: string): Promise<void> {
  setLocationRequestHandler(onLocationRequested);
  await registerTechnicianPushToken(technicianId);
}

/**
 * Enable location sharing: registers the ping listener, requests the location
 * permission via a brief one-shot fix, then stays notification-free until an
 * admin actually views the location.
 */
export async function startLiveTracking(technicianId: string): Promise<boolean> {
  if (!isNativeApp()) return false;
  if (sharingEnabled) return true;

  sharingEnabled = true;
  currentTechnicianId = technicianId;

  // Row marks the technician as sharing even before the first fix arrives.
  await supabase
    .from('technician_live_locations')
    .upsert(
      { technician_id: technicianId, is_tracking: true, updated_at: new Date().toISOString() },
      { onConflict: 'technician_id' }
    );

  startPingListener(technicianId);
  void setupPushWakeup(technicianId);

  const ok = await startWatcher(technicianId, true);
  if (!ok) {
    await stopLiveTracking(technicianId);
    return false;
  }
  return true;
}

/** Disable sharing entirely: stop watcher + listener, mark the row off. */
export async function stopLiveTracking(technicianId: string): Promise<void> {
  sharingEnabled = false;
  currentTechnicianId = null;
  lastPingAt = 0;
  lastLocation = null;

  stopPingListener();
  await stopWatcherOnly();

  await supabase
    .from('technician_live_locations')
    .update({ is_tracking: false, updated_at: new Date().toISOString() })
    .eq('technician_id', technicianId);
}
