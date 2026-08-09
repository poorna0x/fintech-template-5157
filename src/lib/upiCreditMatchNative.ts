/**
 * Admin APK: sync Supabase session to native UPI credit listener
 * and open Notification access settings.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

interface UpiCreditMatchPlugin {
  syncSession(options: {
    supabaseUrl: string;
    anonKey: string;
    accessToken: string;
    enabled?: boolean;
  }): Promise<{ ok: boolean; notificationAccess?: boolean }>;
  clearSession(): Promise<{ ok: boolean }>;
  getStatus(): Promise<{
    enabled: boolean;
    notificationAccess: boolean;
    hasSession: boolean;
  }>;
  setEnabled(options: { enabled: boolean }): Promise<{ enabled: boolean }>;
  openNotificationAccessSettings(): Promise<void>;
}

const UpiCreditMatch = registerPlugin<UpiCreditMatchPlugin>('UpiCreditMatch');

function resolveSupabaseConfig(): { url: string; anonKey: string } {
  const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  return { url, anonKey };
}

/** Call after admin login / token refresh so the listener can settle while app is backgrounded. */
export async function syncUpiCreditSessionToNative(accessToken?: string | null): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  try {
    const { url, anonKey } = resolveSupabaseConfig();
    let token = String(accessToken || '').trim();
    if (!token) {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token || '';
    }
    if (!url || !anonKey || !token) return;
    await UpiCreditMatch.syncSession({
      supabaseUrl: url,
      anonKey,
      accessToken: token,
      enabled: true,
    });
  } catch {
    // Old APK without plugin — ignore.
  }
}

export async function clearUpiCreditSessionOnNative(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  try {
    await UpiCreditMatch.clearSession();
  } catch {
    /* ignore */
  }
}

export async function getUpiCreditMatchStatus(): Promise<{
  enabled: boolean;
  notificationAccess: boolean;
  hasSession: boolean;
} | null> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return null;
  try {
    return await UpiCreditMatch.getStatus();
  } catch {
    return null;
  }
}

export async function setUpiCreditMatchEnabled(enabled: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  try {
    await UpiCreditMatch.setEnabled({ enabled });
  } catch {
    /* ignore */
  }
}

export async function openUpiCreditNotificationAccessSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  try {
    await UpiCreditMatch.openNotificationAccessSettings();
  } catch {
    /* ignore */
  }
}
