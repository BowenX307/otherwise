// 宇宙中心的 Orb，也是产品 logo：扁平纯色，没有明暗和光晕。
// 形态只有一种："上下两半"，中间一道缝。所有状态只靠这道缝的动作表达：
// 呼吸、转向、变细、张开。移植自桌面端 Orb（productspace/app/renderer/orb-mark.js）。
// 不自己跑动画循环，由 UniverseScene 每帧调用 update()。
import { INK } from './palette';

const NS = 'http://www.w3.org/2000/svg';
export const ORB_UNITS = 100; // 内部坐标里的半径，外面用 scale 缩放到实际大小
export const ORB_GAP = 9; // 缝中间的宽度
const FLARE = 1.4; // 缝两端比中间宽多少倍，让两半的边是弧线
export const ORB_ROUND = 4; // 圆角程度

export type OrbState = 'whole' | 'sleep' | 'idle' | 'look' | 'greet' | 'reading' | 'release';

type Slit = { angle: number; offset: number; width: number };

// 每个状态给出这道缝此刻的样子
const STATES: Record<OrbState, { breathe: number; slit: (t: number, look: number) => Slit }> = {
  // 还没醒来（入场前、解锁蓄力时）：缝合上，是一个完整的圆
  whole: { breathe: 0.01, slit: () => ({ angle: 0, offset: 0, width: 0 }) },
  // 很久没人动：缝变细，呼吸放慢
  sleep: { breathe: 0.02, slit: (t) => ({ angle: Math.sin(t * 0.25) * 3, offset: 0, width: ORB_GAP * 0.45 }) },
  // 待机：缝缓慢起伏、微微倾斜
  idle: {
    breathe: 0.012,
    slit: (t) => ({ angle: Math.sin(t * 0.7) * 6, offset: Math.sin(t * 0.9) * 8, width: ORB_GAP * (0.9 + 0.15 * Math.sin(t * 1.3)) }),
  },
  // 看向某处：缝转过去，指向 hover 的星球或附近的鼠标
  look: { breathe: 0.012, slit: (t, look) => ({ angle: look + Math.sin(t * 1.3) * 2, offset: 0, width: ORB_GAP }) },
  // 鼠标放在 Orb 上：两半轻轻分开
  greet: { breathe: 0.015, slit: (t) => ({ angle: Math.sin(t * 0.8) * 4, offset: 0, width: ORB_GAP * (2.1 + 0.25 * Math.sin(t * 3)) }) },
  // 你在读一颗星球：缝来回摆动，像在扫读
  reading: { breathe: 0.008, slit: (t) => ({ angle: Math.sin(t * 1.6) * 22, offset: 0, width: ORB_GAP }) },
  // 解锁放出光波：两半大幅分开，光从缝里出去
  release: { breathe: 0, slit: () => ({ angle: 0, offset: 0, width: ORB_GAP * 4.2 }) },
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** 缝的轮廓：中间宽 w，越靠近圆边越宽（平滑变宽），两半的边因此是弧线 */
export function slitPath(w: number, d: number) {
  const R = ORB_UNITS;
  if (w <= 0.01) return '';
  const L = Math.sqrt(Math.max(R * R - d * d, 400));
  const half = (x: number) => (w / 2) * (1 + FLARE * Math.min(1, (x / L) ** 2));
  const STEPS = 16;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const x = -L + (2 * L * i) / STEPS;
    top.push(`${x.toFixed(1)},${(-half(x)).toFixed(2)}`);
    bottom.unshift(`${x.toFixed(1)},${half(x).toFixed(2)}`);
  }
  const end = (w / 2) * (1 + FLARE);
  const ext = L + 60;
  return `M${-ext},${-end} L${top.join(' L')} L${ext},${-end} L${ext},${end} L${bottom.join(' L')} L${-ext},${end}Z`;
}

/** 圆角滤镜的两步阈值：先收缩再膨胀，削掉缝留下的尖角 */
export const roundThreshold = (at: number) => `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 ${0.5 - 20 * at}`;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

export class OrbCore {
  private slitEl: SVGPathElement;
  private body: SVGGElement;
  private nodes: Element[];
  private cur: Slit = { angle: 0, offset: 0, width: 0 };
  private state: OrbState = 'whole';
  private look = 0;
  private t = 0;
  private breathe = 0;
  private squeeze = 1;

  constructor(parent: SVGGElement, defs: SVGDefsElement, id = 'orb') {
    const round = el('filter', { id: `${id}-round`, filterUnits: 'userSpaceOnUse', x: -130, y: -130, width: 260, height: 260 }, defs);
    el('feGaussianBlur', { stdDeviation: ORB_ROUND }, round);
    el('feColorMatrix', { type: 'matrix', values: roundThreshold(0.85) }, round);
    el('feGaussianBlur', { stdDeviation: ORB_ROUND }, round);
    el('feColorMatrix', { type: 'matrix', values: roundThreshold(0.15) }, round);

    const mask = el('mask', { id: `${id}-slit`, maskUnits: 'userSpaceOnUse', x: -130, y: -130, width: 260, height: 260 }, defs);
    el('rect', { x: -130, y: -130, width: 260, height: 260, fill: '#fff' }, mask);
    this.slitEl = el('path', { fill: '#000' }, mask);

    this.body = el('g', { filter: `url(#${id}-round)` }, parent);
    el('circle', { r: ORB_UNITS, fill: INK, mask: `url(#${id}-slit)` }, this.body);
    this.nodes = [round, mask, this.body];
  }

  destroy() {
    this.nodes.forEach((n) => n.remove());
  }

  setState(state: OrbState) {
    this.state = state;
  }

  /** 让缝指向某个方向（角度，0° 为正右方） */
  setLook(deg: number) {
    this.look = deg;
  }

  /** 整体缩放：解锁时先收缩蓄力，再弹开 */
  setSqueeze(v: number) {
    this.squeeze = v;
  }

  update(dt: number, reduced: boolean) {
    this.t += reduced ? 0 : dt;
    const st = STATES[this.state];
    // 张开（release）要快，其余平滑过渡
    const k = 1 - Math.exp(-dt * (reduced ? 20 : this.state === 'release' ? 14 : 6));
    const target = st.slit(this.t, this.look);

    // 一条缝转 180° 还是同一条缝：取最近的等价角度，避免过渡时乱转
    const n = Math.round((this.cur.angle - target.angle) / 180);
    const angle = target.angle + n * 180;
    const offset = n % 2 ? -target.offset : target.offset;
    if (this.cur.width < 0.3) {
      this.cur.angle = angle;
      this.cur.offset = offset;
    } else {
      this.cur.angle = lerp(this.cur.angle, angle, k);
      this.cur.offset = lerp(this.cur.offset, offset, k);
    }
    this.cur.width = lerp(this.cur.width, target.width, k);
    this.slitEl.setAttribute('d', slitPath(this.cur.width, this.cur.offset));
    this.slitEl.setAttribute('transform', `rotate(${this.cur.angle}) translate(0 ${this.cur.offset})`);

    this.breathe = lerp(this.breathe, reduced ? 0 : st.breathe, k);
    this.body.setAttribute('transform', `scale(${(1 + this.breathe * Math.sin(this.t * 1.5)) * this.squeeze})`);
  }
}
