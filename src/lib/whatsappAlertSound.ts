const SOUND_ENABLED_KEY = 'wa_alert_sound_enabled';
const SOUND_URLS = ['/whatsapp-alert.mp3', '/whatsapp-alert.wav'] as const;

let audioEl: HTMLAudioElement | null = null;
let audioUrlIndex = 0;
let unlocked = false;

export function isWhatsAppAlertSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_ENABLED_KEY) !== 'false';
  } catch {
    return true;
  }
}

/** Browsers block audio until the user interacts with the page once. */
export function unlockWhatsAppAlertSound(): void {
  if (unlocked || typeof window === 'undefined') return;
  unlocked = true;
  try {
    const probe = new Audio(SOUND_URLS[0]);
    probe.volume = 0.001;
    void probe.play().then(() => probe.pause()).catch(() => {
      /* ignore — will retry on next alert */
    });
  } catch {
    /* ignore */
  }
}

function playWebAudioFallback(): void {
  try {
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    };
    const t = ctx.currentTime;
    playTone(880, t, 0.09);
    playTone(1174, t + 0.11, 0.1);
    window.setTimeout(() => void ctx.close(), 400);
  } catch {
    /* ignore */
  }
}

function getAudio(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio(SOUND_URLS[audioUrlIndex]);
    audioEl.preload = 'auto';
    audioEl.volume = 0.65;
  }
  return audioEl;
}

/** Short message alert — replace `public/whatsapp-alert.mp3` with your preferred tone. */
export function playWhatsAppAlertSound(): void {
  if (!isWhatsAppAlertSoundEnabled()) return;
  if (typeof window === 'undefined') return;

  const audio = getAudio();
  audio.currentTime = 0;
  const playPromise = audio.play();
  if (!playPromise) return;
  void playPromise.catch(() => {
    if (audioUrlIndex < SOUND_URLS.length - 1) {
      audioUrlIndex += 1;
      audioEl = new Audio(SOUND_URLS[audioUrlIndex]);
      audioEl.volume = 0.65;
      void audioEl.play().catch(() => playWebAudioFallback());
      return;
    }
    playWebAudioFallback();
  });
}
