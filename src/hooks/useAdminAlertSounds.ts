import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

type AlertNode = { ctx: AudioContext; osc: OscillatorNode; gain: GainNode };

export function useAdminAlertSounds() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeAlertsRef = useRef<Set<AlertNode>>(new Set());
  const alertTokenRef = useRef(0);

  // Initialize audio context on first user interaction (required for sound on hosted)
  useEffect(() => {
    const handleUserInteraction = async () => {
      try {
        const Ac = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ac) return;
        if (audioContextRef.current?.state === 'closed') {
          audioContextRef.current = null;
        }
        if (!audioContextRef.current) {
          audioContextRef.current = new Ac();
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
      } catch {
        // ignore
      }
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      document.removeEventListener('pointerdown', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
    document.addEventListener('click', handleUserInteraction, { once: true });
    document.addEventListener('keydown', handleUserInteraction, { once: true });
    document.addEventListener('pointerdown', handleUserInteraction, { once: true });
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
      document.removeEventListener('pointerdown', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
  }, []);

  const teardownActiveAlert = useCallback(() => {
    const nodes = activeAlertsRef.current;
    if (nodes.size === 0) return;
    nodes.forEach((node) => {
      const now = node.ctx.currentTime;
      try {
        node.gain.gain.cancelScheduledValues(now);
      } catch {
        /* ignore */
      }
      try {
        node.gain.gain.setValueAtTime(Math.max(node.gain.gain.value, 0.0001), now);
        node.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      } catch {
        /* ignore */
      }
      try {
        node.osc.stop(now + 0.04);
      } catch {
        /* ignore */
      }
      try {
        node.osc.disconnect();
        node.gain.disconnect();
      } catch {
        /* ignore */
      }
    });
    nodes.clear();
  }, []);

  const stopNotificationSound = useCallback(() => {
    alertTokenRef.current++;
    teardownActiveAlert();
  }, [teardownActiveAlert]);

  const playNotificationSound = useCallback(async () => {
    const myToken = ++alertTokenRef.current;
    try {
      const Ac = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ac) return;
      if (audioContextRef.current?.state === 'closed') {
        audioContextRef.current = null;
      }
      if (!audioContextRef.current) {
        audioContextRef.current = new Ac();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (ctx.state !== 'running') {
        toast.info('Click anywhere on this page once to enable sound', { duration: 5000 });
        return;
      }
      if (myToken !== alertTokenRef.current) return;
      teardownActiveAlert();
      const t = ctx.currentTime;
      const durationSec = 4;
      const beepDuration = 0.5;
      const gap = 0.25;
      const cycleSec = beepDuration + gap;
      const beepCount = Math.max(1, Math.ceil((durationSec + gap) / cycleSec));
      const endsAt = t + durationSec;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, t);

      for (let i = 0; i < beepCount; i++) {
        const start = t + i * cycleSec;
        if (start >= endsAt) break;
        const end = Math.min(start + beepDuration, endsAt);
        gain.gain.setValueAtTime(0.25, start);
        gain.gain.exponentialRampToValueAtTime(0.01, end);
        const after = Math.min(end + 0.001, endsAt);
        gain.gain.setValueAtTime(0.0001, after);
      }

      gain.gain.setValueAtTime(0.0001, endsAt);

      const entry: AlertNode = { ctx, osc, gain };
      activeAlertsRef.current.add(entry);
      osc.onended = () => {
        activeAlertsRef.current.delete(entry);
      };

      osc.start(t);
      osc.stop(endsAt + 0.05);
    } catch (e) {
      console.warn('Notification sound failed:', e);
    }
  }, [teardownActiveAlert]);

  const playCompletedJobSound = useCallback(async () => {
    try {
      const Ac = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ac) return;
      if (audioContextRef.current?.state === 'closed') {
        audioContextRef.current = null;
      }
      if (!audioContextRef.current) {
        audioContextRef.current = new Ac();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (ctx.state !== 'running') {
        toast.info('Click anywhere on this page once to enable sound', { duration: 5000 });
        return;
      }

      const t = ctx.currentTime;
      const beepDuration = 0.25;
      const gap = 0.25;

      for (let i = 0; i < 5; i++) {
        const start = t + i * (beepDuration + gap);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.25, start);
        gain.gain.exponentialRampToValueAtTime(0.01, start + beepDuration);
        osc.start(start);
        osc.stop(start + beepDuration);
      }
    } catch (e) {
      console.warn('Completed job sound failed:', e);
    }
  }, []);

  return {
    playNotificationSound,
    stopNotificationSound,
    playCompletedJobSound,
  };
}
