import { AlarmTone } from '../types/study';

let activeInterval: number | null = null;
let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioCtx();
  }
  if (sharedCtx.state === 'suspended') {
    void sharedCtx.resume();
  }
  return sharedCtx;
}

function playSinglePattern(tone: AlarmTone): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  if (tone === 'classic') {
    const offsets = [0, 0.2, 0.4];
    offsets.forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now + offset);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.22, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.17);
    });
    return;
  }

  if (tone === 'gentle') {
    const notes = [523.25, 659.25, 783.99]; // C5 - E5 - G5
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.58);
    });
    return;
  }

  // 'chime' (default)
  const chimeNotes = [587.33, 739.99, 880, 1174.66]; // D5 - F#5 - A5 - D6
  chimeNotes.forEach((freq, idx) => {
    const start = now + idx * 0.14;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(0.19, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.45);
  });
}

export function previewAlarmTone(tone: AlarmTone): void {
  try {
    playSinglePattern(tone);
  } catch {
    // Ignore browser autoplay restrictions
  }
}

export function startAlarmLoop(tone: AlarmTone): void {
  stopAlarmLoop();
  try {
    playSinglePattern(tone);
    activeInterval = window.setInterval(() => {
      try {
        playSinglePattern(tone);
      } catch {
        // Ignore audio failure
      }
    }, 1600);
  } catch {
    // Ignore audio failure
  }
}

export function stopAlarmLoop(): void {
  if (activeInterval !== null) {
    window.clearInterval(activeInterval);
    activeInterval = null;
  }
}
