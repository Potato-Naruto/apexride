/**
 * Audio output: speech synthesis + chime + a silent looping <audio> element.
 * The silent element keeps the page registered as a media session, which is what
 * lets Bluetooth intercom buttons (AVRCP play/pause/next) reach us, and helps
 * mobile browsers keep the tab's audio alive with the screen dimmed.
 */

let ctx: AudioContext | null = null;
let silent: HTMLAudioElement | null = null;

function silentWavUrl(seconds = 2, rate = 8000): string {
  const n = seconds * rate;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128); // 8-bit PCM silence
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/** Must be called from a user gesture (the Start button) - iOS Safari blocks audio otherwise. */
export async function unlockAudio(): Promise<void> {
  ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
  await ctx.resume().catch(() => {});
  if (!silent) {
    silent = new Audio(silentWavUrl());
    silent.loop = true;
    silent.volume = 0.01;
  }
  await silent.play().catch(() => {});
  if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
}

export function stopAudio() {
  silent?.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

/** Two-tone "still here" chime. Distinct from speech so riders recognise it instantly. */
export function chime() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  [660, 880].forEach((f, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t0 + i * 0.16);
    g.gain.linearRampToValueAtTime(0.35, t0 + i * 0.16 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.16 + 0.3);
    o.connect(g).connect(ctx!.destination);
    o.start(t0 + i * 0.16);
    o.stop(t0 + i * 0.16 + 0.32);
  });
}

let lastText = '';
export const lastSpoken = () => lastText;

export interface SpeakOpts {
  rate?: number;
  /** Cancel anything queued - turn cues must never wait behind chatter. */
  interrupt?: boolean;
  chime?: boolean;
}

export function speak(text: string, { rate = 1, interrupt = true, chime: withChime = false }: SpeakOpts = {}) {
  lastText = text;
  if (withChime) chime();
  if (!('speechSynthesis' in window)) return;
  if (interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  u.lang = navigator.language || 'en-US';
  u.volume = 1;
  // Delay slightly after a chime so the two don't overlap in a compressed Bluetooth stream.
  if (withChime) setTimeout(() => speechSynthesis.speak(u), 450);
  else speechSynthesis.speak(u);
}
