const AUDIO_PRIMED_KEY = 'songguessr_audio_primed';

const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTAAAAAA';

export function isAudioPlaybackPrimed(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(AUDIO_PRIMED_KEY) === '1';
}

function markAudioPlaybackPrimed(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(AUDIO_PRIMED_KEY, '1');
}

export async function primeAudioPlayback(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  let primed = false;

  const AudioContextCtor =
    window.AudioContext ||
    ((window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null);

  if (AudioContextCtor) {
    try {
      const context = new AudioContextCtor();
      if (context.state === 'suspended') {
        await context.resume();
      }

      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      gainNode.gain.value = 0.0001;

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      oscillator.start();
      oscillator.stop(context.currentTime + 0.05);

      primed = true;
      window.setTimeout(() => {
        context.close().catch(() => undefined);
      }, 150);
    } catch {
      // Ignore and try the media element path below.
    }
  }

  try {
    const audio = new Audio(SILENT_WAV_DATA_URI);
    audio.volume = 0;
    audio.muted = true;
    audio.setAttribute('playsinline', 'true');
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    primed = true;
  } catch {
    // Some browsers only allow one of the two priming strategies.
  }

  if (primed) {
    markAudioPlaybackPrimed();
  }

  return primed;
}
