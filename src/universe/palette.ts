import type { Field } from '../types';

// 与 styles/tokens.css 保持一致；画布和 SVG 里需要具体色值，所以这里再存一份
export const BG = '#09090b'; // 接近纯黑的单色
export const INK = '#f3f1ea';
export const SEED = '#b8b6c2'; // 由兴趣生成的星球，亮面用浅灰

// 领域色：比原来降一档饱和度，明度也错开，不让几个颜色同时都是最亮的一档
export const FIELD_HEX: Record<Field, string> = {
  Technology: '#d27a52',
  Psychology: '#8579d6',
  Business: '#d4b363',
  Science: '#6fae8f',
  Creativity: '#cf7ba0',
  Society: '#6a8fcc',
};

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 两个颜色按 t 混合，返回 hex */
export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
