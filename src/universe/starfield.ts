// 画布背景：接近纯黑的单色底 + 稀疏、微弱的视差星点。解锁时光波扫过，星点会亮一下。
// 不再有星云和暗雾：颜色只出现在星球的亮面上。
import { seeded, type Sim } from './engine';
import { BG } from './palette';

type Star = { x: number; y: number; r: number; a: number; speed: number; phase: number };
type Layer = { depth: number; stars: Star[] };

// 星点铺在一块 TILE × TILE 的区域里，超出时取模平铺，拖多远都有星星
const TILE = 2600;

export function createStarLayers(): Layer[] {
  const rand = seeded(42);
  const make = (count: number, rMin: number, rMax: number, aMax: number) =>
    Array.from({ length: count }, () => ({
      x: rand() * TILE,
      y: rand() * TILE,
      r: rMin + rand() * (rMax - rMin),
      a: 0.12 + rand() * (aMax - 0.12),
      speed: 0.4 + rand() * 1.6,
      phase: rand() * Math.PI * 2,
    }));
  return [
    { depth: 0.15, stars: make(480, 0.3, 0.6, 0.35) }, // 远
    { depth: 0.4, stars: make(170, 0.45, 0.85, 0.5) }, // 中
    { depth: 0.75, stars: make(45, 0.7, 1.2, 0.7) }, // 近
  ];
}

export type View = {
  W: number;
  H: number;
  S: number; // 世界单位 → 像素
  cx: number; // 宇宙中心在屏幕上的位置
  cy: number;
  camX: number;
  camY: number;
  parX: number; // 鼠标视差，-1 到 1
  parY: number;
  toScreen: (x: number, y: number) => [number, number];
};

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** 解锁时的光波（屏幕坐标）：椭圆，和轨道同样倾斜 */
export type Wave = { rx: number; ry: number; strength: number };
const WAVE_COS = Math.cos((10 * Math.PI) / 180);
const WAVE_SIN = Math.sin((10 * Math.PI) / 180);

export function drawBackground(ctx: CanvasRenderingContext2D, view: View, sim: Sim, layers: Layer[], wave: Wave | null) {
  const { W, H, S } = view;
  const [cx, cy] = view.toScreen(0, 0);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#f3f1ea';
  for (const layer of layers) {
    // 越近的层，随镜头和鼠标移动得越多
    const ox = -view.camX * S * layer.depth - view.parX * 22 * layer.depth;
    const oy = -view.camY * S * layer.depth - view.parY * 22 * layer.depth;
    for (const s of layer.stars) {
      const x = mod(s.x + ox, TILE) - (TILE - W) / 2;
      const y = mod(s.y + oy, TILE) - (TILE - H) / 2;
      if (x < -2 || y < -2 || x > W + 2 || y > H + 2) continue;
      const twinkle = sim.reduced ? 0.8 : 0.55 + 0.45 * Math.sin(sim.t * s.speed + s.phase);
      let boost = 0;
      if (wave) {
        // 星点离光波的椭圆越近，越亮
        const dx = x - cx;
        const dy = y - cy;
        const e = Math.hypot((dx * WAVE_COS - dy * WAVE_SIN) / wave.rx, (dx * WAVE_SIN + dy * WAVE_COS) / wave.ry);
        boost = wave.strength * Math.exp(-(((e - 1) / 0.07) ** 2));
      }
      ctx.globalAlpha = Math.min(1, s.a * twinkle + boost);
      ctx.beginPath();
      ctx.arc(x, y, s.r * (1 + boost * 1.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
