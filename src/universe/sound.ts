// 声音：全部用 Web Audio 实时合成，没有音频文件。
//  唤醒 / 解锁：Orb 蓄力时一个渐强的低音 → 张开时一声带空间感的和弦（加一记低频的"推"）→ 每颗星球亮起时一声轻响，
//  音高按轨道由低到高。浏览器要求声音由用户操作触发，按 N / 点击都算。M 键或顶栏开关静音。
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'otherwise.sound';

// 每条轨道的音高（A 大调五声音阶）：内圈低、外圈高
const PING_NOTES = [
  [392.0, 440.0, 493.88],
  [587.33, 659.25, 739.99],
  [880.0, 987.77, 1108.73],
];
const BLOOM_CHORD = [110.0, 164.81, 220.0, 277.18, 329.63];

type Env = { at: number; attack: number; decay: number; peak: number };

function loadEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

class Sound {
  enabled = loadEnabled();
  private ctx: AudioContext | null = null;
  private dry!: GainNode;
  private wet!: GainNode;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  toggle = () => {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? 'on' : 'off');
    } catch {
      // 存不了也没关系，只是下次打开不记得
    }
    if (!this.enabled) void this.ctx?.suspend();
    this.listeners.forEach((fn) => fn());
  };

  /** 第一次用到时才创建音频图：干声 + 混响 → 压缩 → 输出 */
  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
      const ctx = this.ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      const master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(comp).connect(ctx.destination);
      this.dry = ctx.createGain();
      this.dry.connect(master);
      const reverb = ctx.createConvolver();
      reverb.buffer = impulse(ctx, 3.4);
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.55;
      this.wet.connect(reverb).connect(master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** 一个音：起音 → 指数衰减。wet 是送进混响的比例 */
  private tone(type: OscillatorType, freq: number, env: Env, wet = 0.6, glideTo?: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, env.at);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, env.at + env.attack + env.decay * 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, env.at);
    g.gain.linearRampToValueAtTime(env.peak, env.at + env.attack);
    g.gain.exponentialRampToValueAtTime(0.0001, env.at + env.attack + env.decay);
    osc.connect(g);
    const dryGain = ctx.createGain();
    dryGain.gain.value = 1 - wet * 0.5;
    g.connect(dryGain).connect(this.dry);
    const wetGain = ctx.createGain();
    wetGain.gain.value = wet;
    g.connect(wetGain).connect(this.wet);
    osc.start(env.at);
    osc.stop(env.at + env.attack + env.decay + 0.1);
  }

  /** Orb 蓄力：低音慢慢涨起来，像在吸气 */
  private gather(at: number, dur: number, strength: number) {
    const ctx = this.ctx!;
    for (const [freq, peak] of [
      [55, 0.1],
      [82.41, 0.05],
    ]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak * strength, at + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.25);
      osc.connect(g).connect(this.dry);
      osc.start(at);
      osc.stop(at + dur + 0.3);
    }
    // 一层被低通滤过的锯齿波，滤波器慢慢打开，听起来像气流
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = 110;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(140, at);
    lp.frequency.exponentialRampToValueAtTime(900, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.022 * strength, at + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.2);
    saw.connect(lp).connect(g).connect(this.wet);
    saw.start(at);
    saw.stop(at + dur + 0.3);
  }

  /** 两半张开：一记低频的"推"（代替震动）+ 一个长尾的和弦 + 一点高处的闪光 */
  private release(at: number, strength: number) {
    this.tone('sine', 72, { at, attack: 0.004, decay: 0.8, peak: 0.55 * strength }, 0.15, 36);
    BLOOM_CHORD.forEach((f, i) => {
      this.tone('sine', f, { at: at + i * 0.018, attack: 0.04, decay: 4.2, peak: 0.07 * strength }, 0.75);
      this.tone('triangle', f * 2, { at: at + i * 0.018, attack: 0.06, decay: 2.6, peak: 0.018 * strength }, 0.9);
    });
    this.tone('sine', 1318.5, { at: at + 0.08, attack: 0.3, decay: 3.2, peak: 0.012 * strength }, 1);
    this.tone('sine', 1760, { at: at + 0.16, attack: 0.4, decay: 3.4, peak: 0.009 * strength }, 1);
  }

  /** 一颗星球亮起：像小钟一样的一声轻响 */
  private ping(at: number, orbit: number, k: number, strength: number) {
    const notes = PING_NOTES[Math.max(0, Math.min(2, orbit))];
    const f = notes[k % notes.length];
    this.tone('sine', f, { at, attack: 0.004, decay: 1.8, peak: 0.075 * strength }, 0.8);
    this.tone('sine', f * 2.76, { at, attack: 0.002, decay: 0.45, peak: 0.018 * strength }, 0.9); // 钟声的泛音
  }

  /** 唤醒宇宙：pings 是每颗星球在第几秒亮起、在哪条轨道 */
  wake(gatherSec: number, pings: { delay: number; orbit: number }[]) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.02;
    this.gather(t0, gatherSec, 1);
    this.release(t0 + gatherSec, 1);
    pings.forEach((p, i) => this.ping(t0 + p.delay, p.orbit, i, 1));
  }

  /** 解锁一颗新星球：同一套声音，更短更轻 */
  unlock(gatherSec: number, ping: { delay: number; orbit: number }) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.02;
    this.gather(t0, gatherSec, 0.6);
    this.release(t0 + gatherSec, 0.55);
    this.ping(t0 + ping.delay, ping.orbit, 1, 1.2);
  }
}

/** 混响的脉冲响应：双声道噪声按指数衰减 */
function impulse(ctx: AudioContext, seconds: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  return buf;
}

export const sound = new Sound();

/** 组件里读声音开关 */
export function useSoundEnabled() {
  return useSyncExternalStore(sound.subscribe, () => sound.enabled);
}
