// Polytechnic Hub — Premium Foreground Notification Sound Player
// Uses /sounds/polytechnic-chime.wav, /sounds/polytechnic-alert.wav, and /sounds/polytechnic-soft.wav
// with Web Audio API synthesis fallback. Respects user sound settings and device Silent/DND controls.

export type NotificationSoundStyle = 'chime' | 'alert' | 'soft' | 'bell' | 'system';

export const NOTIFICATION_SOUND_OPTIONS: {
  id: NotificationSoundStyle;
  labelEn: string;
  labelBn: string;
  filePath?: string;
}[] = [
  {
    id: 'chime',
    labelEn: 'Polytechnic Chime (Harmonic)',
    labelBn: 'পলিটেকনিক প্রিমিয়াম চাইম',
    filePath: '/sounds/polytechnic-chime.wav',
  },
  {
    id: 'alert',
    labelEn: 'Crisp Alert Tone',
    labelBn: 'ক্রিস্প অ্যালার্ট টোন',
    filePath: '/sounds/polytechnic-alert.wav',
  },
  {
    id: 'soft',
    labelEn: 'Soft Gentle Bell',
    labelBn: 'সফট জেন্টল টোন',
    filePath: '/sounds/polytechnic-soft.wav',
  },
  {
    id: 'bell',
    labelEn: 'Classic Study Bell',
    labelBn: 'ক্লাসিক স্টাডি বেল',
  },
  {
    id: 'system',
    labelEn: 'Default System Tone',
    labelBn: 'ডিফল্ট সিস্টেম টোন',
  },
];

const SOUND_FILE_MAP: Partial<Record<NotificationSoundStyle, string>> = {
  chime: '/sounds/polytechnic-chime.wav',
  alert: '/sounds/polytechnic-alert.wav',
  soft: '/sounds/polytechnic-soft.wav',
};

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function playSynthBellOrChime(style: NotificationSoundStyle): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes =
    style === 'alert'
      ? [
          { freq: 987.77, offset: 0, dur: 0.22, gain: 0.14 },
          { freq: 1318.51, offset: 0.14, dur: 0.28, gain: 0.14 },
          { freq: 1567.98, offset: 0.32, dur: 0.35, gain: 0.12 },
        ]
      : style === 'soft'
        ? [
            { freq: 523.25, offset: 0, dur: 0.45, gain: 0.1 },
            { freq: 659.25, offset: 0.12, dur: 0.55, gain: 0.1 },
            { freq: 783.99, offset: 0.24, dur: 0.5, gain: 0.08 },
          ]
        : style === 'bell'
          ? [
              { freq: 880, offset: 0, dur: 0.45, gain: 0.14 },
              { freq: 1318.5, offset: 0.12, dur: 0.55, gain: 0.11 },
            ]
          : style === 'system'
            ? [{ freq: 784, offset: 0, dur: 0.22, gain: 0.1 }]
            : [
                { freq: 659.25, offset: 0, dur: 0.35, gain: 0.11 },
                { freq: 830.61, offset: 0.08, dur: 0.35, gain: 0.1 },
                { freq: 987.77, offset: 0.16, dur: 0.4, gain: 0.1 },
                { freq: 1318.51, offset: 0.24, dur: 0.5, gain: 0.12 },
              ];

  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(n.freq, now + n.offset);

    gainNode.gain.setValueAtTime(0.0001, now + n.offset);
    gainNode.gain.linearRampToValueAtTime(n.gain, now + n.offset + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + n.offset + n.dur);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(now + n.offset);
    osc.stop(now + n.offset + n.dur + 0.02);
  }
}

export async function playNotificationSound(
  style: NotificationSoundStyle = 'chime',
  soundEnabled = true
): Promise<boolean> {
  if (!soundEnabled || typeof window === 'undefined') {
    return false;
  }

  const audioFile = SOUND_FILE_MAP[style];
  if (audioFile) {
    try {
      const audio = new Audio(audioFile);
      audio.volume = style === 'soft' ? 0.55 : 0.68;
      await audio.play();
      return true;
    } catch {
      try {
        playSynthBellOrChime(style);
        return true;
      } catch {
        return false;
      }
    }
  }

  try {
    playSynthBellOrChime(style);
    return true;
  } catch {
    return false;
  }
}
