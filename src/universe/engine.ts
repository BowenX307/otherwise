// 宇宙的模拟：轨道公转、弹簧物理、鼠标与星球之间的吸引、入场编排、镜头。
// 纯数据和计算，不碰 DOM；渲染在 UniverseScene 里做。
import { getTopic } from '../api';
import { FIELD_HEX, SEED } from './palette';
import type { Planet, Topic, Universe } from '../types';

// ---------------------------------------------------------------- 轨道

const TILT = (-10 * Math.PI) / 180;
const COS_T = Math.cos(TILT);
const SIN_T = Math.sin(TILT);

/** 内、中、外三条轨道。omega 是公转角速度（弧度/秒）：内圈快、外圈慢 */
export const ORBITS = [
  { rx: 180, ry: 100, omega: 0.032, start: -70 },
  { rx: 310, ry: 175, omega: 0.019, start: -35 },
  { rx: 440, ry: 250, omega: 0.011, start: -100 },
];
export const TILT_DEG = -10;
export const SLOTS = 8;
// 槽位填充顺序：先隔开占位，星球少时也分散
const SLOT_ORDER = [0, 4, 2, 6, 1, 5, 3, 7];

export function slotAngle(orbit: number, slot: number) {
  return ((ORBITS[orbit].start + (slot * 360) / SLOTS) * Math.PI) / 180;
}

export function orbitPoint(orbit: number, theta: number): [number, number] {
  const o = ORBITS[orbit];
  const x = o.rx * Math.cos(theta);
  const y = o.ry * Math.sin(theta);
  return [x * COS_T - y * SIN_T, x * SIN_T + y * COS_T];
}

// ---------------------------------------------------------------- 星球

export type Body = {
  id: string;
  index: number; // 解锁顺序，用于 "PLANET 04"
  planet: Planet;
  topic: Topic;
  orbit: number;
  theta0: number;
  r: number; // 世界坐标下的半径
  color: string;
  seed: boolean;
  ring: boolean;
  // 物理状态
  x: number;
  y: number;
  vx: number;
  vy: number;
  // 动画状态
  activateAt: number; // 入场：第几秒从中心飞出
  appear: number; // 0 → 1
  hover: number; // 0 → 1，平滑过渡
  breathPhase: number;
  breathSpeed: number;
  labelSide: number; // 0 下 1 上 2 右 3 左
  bornAt: number | null; // 通过解锁出现的时刻（sim.t），用来做出生时的闪光
};

export type Ghost = { orbit: number; slot: number; theta0: number; filledBy: string | null };

/** 解锁一颗新星球时的波纹：Orb 收缩 → 放出光波 → 光波到达轨道时新星球点亮 */
export type Ripple = { start: number };
export const RIPPLE = {
  gather: 0.7, // Orb 收缩蓄力
  travel: 2.0, // 光波从中心扩散到最外圈之外
  reach: 1.12, // 光波最终比外圈大多少
};

/** 光波在第 x 秒（从放出开始算）的大小，相对外圈；ease-out */
export function rippleScale(x: number) {
  const p = Math.min(1, Math.max(0, x / RIPPLE.travel));
  return (1 - Math.pow(1 - p, 3)) * RIPPLE.reach;
}

/** 从按下到光波到达某条轨道一共多少秒（含 Orb 蓄力） */
export function orbitArrival(orbit: number) {
  return RIPPLE.gather + rippleArrival(orbit);
}

/** 光波到达某条轨道需要多少秒（rippleScale 的反函数） */
function rippleArrival(orbit: number) {
  const target = ORBITS[orbit].rx / ORBITS[2].rx / RIPPLE.reach;
  return (1 - Math.cbrt(1 - target)) * RIPPLE.travel;
}

export function planetRadius(p: Planet, topic: Topic | undefined) {
  if (p.origin === 'seed') return 7;
  const base = topic?.distance === 2 ? 15 : 11; // 越外圈越大
  const total = topic?.cards.length || 3;
  return base + 4 * Math.min(1, p.read.length / total); // 读得越多再大一点
}

// 固定种子的伪随机数：刷新后呼吸节奏、星点位置都不变
export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- 模拟

export type Sim = {
  universe: Universe;
  used: number[]; // 每条轨道已经占了几个槽位
  usedSlots: Set<number>[];
  ripple: Ripple | null;
  awake: boolean; // 一开始只有睡着的 Orb；唤醒后光波点亮整个宇宙
  wakeAt: number; // 唤醒的时刻（sim.t）
  t: number; // 总时间
  orbitTime: number; // 公转时间（聚焦时暂停）
  timeScale: number;
  introStart: number;
  bodies: Body[];
  ghosts: Ghost[];
  reduced: boolean;
};

export type Input = {
  pointerIn: boolean;
  worldX: number;
  worldY: number;
  dragging: boolean;
  hoveredId: string | null;
  focusedId: string | null;
};

const rand = seeded(7);

function makeBody(sim: Sim, planet: Planet, index: number, chosenSlot?: number): Body | null {
  const topic = getTopic(planet.topicId);
  if (!topic) return null;
  const orbit = topic.distance;
  const slot = chosenSlot ?? SLOT_ORDER[sim.used[orbit] % SLOTS];
  sim.used[orbit]++;
  sim.usedSlots[orbit].add(slot);
  const ghost = sim.ghosts.find((g) => g.orbit === orbit && g.slot === slot);
  if (ghost) ghost.filledBy = planet.id;
  const seed = planet.origin === 'seed';
  return {
    id: planet.id,
    index,
    planet,
    topic,
    orbit,
    theta0: slotAngle(orbit, slot),
    r: planetRadius(planet, topic),
    color: seed ? SEED : FIELD_HEX[topic.field],
    seed,
    ring: planet.marked.length > 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    activateAt: 0,
    appear: 0,
    hover: 0,
    breathPhase: rand() * Math.PI * 2,
    breathSpeed: 0.9 + rand() * 0.7,
    labelSide: 0,
    bornAt: null,
  };
}

export function createSim(universe: Universe, reduced: boolean): Sim {
  const sim: Sim = {
    universe,
    used: [0, 0, 0],
    usedSlots: [new Set(), new Set(), new Set()],
    ripple: null,
    awake: false,
    wakeAt: Infinity,
    t: 0,
    orbitTime: 0,
    timeScale: 1,
    introStart: 0,
    bodies: [],
    ghosts: [],
    reduced,
  };

  // 中圈和外圈的每个槽位先都放一个"空位"标记；被星球占了就藏起来，表示「还没去过的地方」
  for (const orbit of [1, 2]) {
    for (let slot = 0; slot < SLOTS; slot++) sim.ghosts.push({ orbit, slot, theta0: slotAngle(orbit, slot), filledBy: null });
  }

  universe.planets.forEach((planet, index) => {
    const b = makeBody(sim, planet, index);
    if (b) sim.bodies.push(b);
  });
  sleep(sim);

  if (reduced) skipIntro(sim);
  return sim;
}

/** 回到一开始的样子：只有睡着的 Orb，所有星球和轨道都还没出现 */
export function sleep(sim: Sim) {
  sim.awake = false;
  sim.wakeAt = Infinity;
  sim.ripple = null;
  sim.introStart = sim.t;
  for (const b of sim.bodies) {
    b.activateAt = Infinity;
    b.appear = 0;
    b.bornAt = null;
    b.vx = b.vy = 0;
    [b.x, b.y] = orbitPoint(b.orbit, b.theta0 + ORBITS[b.orbit].omega * sim.orbitTime);
  }
}

/** 唤醒：Orb 放出光波，光波扫到哪条轨道，那条轨道上的星球就在原地依次点亮 */
export function wake(sim: Sim) {
  if (sim.awake) return;
  sim.awake = true;
  sim.wakeAt = sim.t;
  sim.introStart = sim.t;
  sim.ripple = { start: sim.t };
  sim.bodies.forEach((b, i) => {
    const delay = orbitArrival(b.orbit) + (i % 4) * 0.06; // 同一条轨道上的星球错开一点点
    b.activateAt = delay;
    b.bornAt = sim.t + delay;
    b.vx = b.vy = 0;
    [b.x, b.y] = orbitPoint(b.orbit, b.theta0 + ORBITS[b.orbit].omega * (sim.orbitTime + delay));
  });
}

// 宇宙在右侧、外圈从右边出画，左边又被左列挡住：可见区域大约在世界坐标 x ∈ (-370, 330)
const VISIBLE_CENTER_X = -20;

/** 解锁新星球时选哪个空位：在还空着的槽位里，挑点亮那一刻离可见区域中线最近的一个 */
function pickSlot(sim: Sim, orbit: number): number {
  const delay = orbitArrival(orbit);
  let best = -1;
  let bestScore = Infinity;
  for (let slot = 0; slot < SLOTS; slot++) {
    if (sim.usedSlots[orbit].has(slot)) continue;
    const [x] = orbitPoint(orbit, slotAngle(orbit, slot) + ORBITS[orbit].omega * (sim.orbitTime + delay));
    const score = Math.abs(x - VISIBLE_CENTER_X);
    if (score < bestScore) {
      bestScore = score;
      best = slot;
    }
  }
  return best >= 0 ? best : SLOT_ORDER[sim.used[orbit] % SLOTS];
}

/** 某条轨道上，下一颗新星球会落在哪个空位（选建议时提前高亮那个位置） */
export function nextGhost(sim: Sim, orbit: number): Ghost | undefined {
  const slot = pickSlot(sim, orbit);
  return sim.ghosts.find((g) => g.orbit === orbit && g.slot === slot);
}

/** 解锁：新星球不从中心飞出，而是在光波到达它的轨道时，在原地（空位标记处）点亮 */
export function addPlanet(sim: Sim, planet: Planet, index: number) {
  if (sim.bodies.some((b) => b.id === planet.id)) return;
  const b = makeBody(sim, planet, index, pickSlot(sim, getTopic(planet.topicId)?.distance ?? 2));
  if (!b) return;
  const delay = sim.reduced ? 0 : RIPPLE.gather + rippleArrival(b.orbit);
  b.activateAt = sim.t - sim.introStart + delay;
  // 放到点亮那一刻它应该在的位置
  [b.x, b.y] = orbitPoint(b.orbit, b.theta0 + ORBITS[b.orbit].omega * (sim.orbitTime + delay));
  b.bornAt = sim.t + delay;
  sim.bodies.push(b);
  sim.ripple = { start: sim.t };
}

/** 跳过开场（?intro=off、减少动态效果）：宇宙直接是醒着、完整的样子 */
export function skipIntro(sim: Sim) {
  sim.awake = true;
  sim.wakeAt = sim.t - 100;
  sim.introStart = sim.t - 100;
  sim.ripple = null;
  for (const b of sim.bodies) {
    [b.x, b.y] = orbitPoint(b.orbit, b.theta0 + ORBITS[b.orbit].omega * sim.orbitTime);
    b.activateAt = 0;
    b.bornAt = null;
    b.appear = 1;
  }
}

export function ghostPoint(sim: Sim, g: Ghost) {
  return orbitPoint(g.orbit, g.theta0 + ORBITS[g.orbit].omega * sim.orbitTime);
}

const SPRING = 7; // 拉回轨道位置的弹簧
const CURSOR_PULL = 110; // 鼠标的引力
const CURSOR_RANGE = 170; // 鼠标引力范围（世界单位，按缩放换算前）
const KIN_PULL = 22; // 同领域星球之间常驻的微弱引力
const HOVER_KIN_PULL = 70; // hover 时，同领域的星球被拉向它

export function step(sim: Sim, dt: number, inp: Input, zoom: number) {
  sim.t += dt;

  // 聚焦或减少动态效果时，公转慢慢停下
  const targetScale = sim.reduced || inp.focusedId ? 0 : 1;
  sim.timeScale += (targetScale - sim.timeScale) * (1 - Math.exp(-dt * 2.5));
  sim.orbitTime += dt * sim.timeScale;

  const introT = sim.t - sim.introStart;
  const hovered = sim.bodies.find((b) => b.id === inp.hoveredId);
  const cursorRange = CURSOR_RANGE / zoom;
  const calm = sim.reduced || !!inp.focusedId;

  for (const b of sim.bodies) {
    const active = introT >= b.activateAt;
    if (b.bornAt !== null && !active) continue;
    b.appear += ((active ? 1 : 0) - b.appear) * (1 - Math.exp(-dt * 3.2));
    if (!active) continue;

    const [tx, ty] = orbitPoint(b.orbit, b.theta0 + ORBITS[b.orbit].omega * sim.orbitTime);
    let fx = SPRING * (tx - b.x);
    let fy = SPRING * (ty - b.y);

    if (!calm) {
      // 鼠标附近的星球被轻轻拉向鼠标
      if (inp.pointerIn && !inp.dragging) {
        const dx = inp.worldX - b.x;
        const dy = inp.worldY - b.y;
        const d = Math.hypot(dx, dy);
        if (d > 1 && d < cursorRange) {
          const f = CURSOR_PULL * (1 - d / cursorRange) ** 2;
          fx += (dx / d) * f;
          fy += (dy / d) * f;
        }
      }
      for (const o of sim.bodies) {
        if (o === b || introT < o.activateAt) continue;
        const dx = o.x - b.x;
        const dy = o.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        // 相关的星球彼此吸引；hover 时被 hover 的那颗拉得更明显
        if (related(b, o)) {
          const pull = hovered === o ? HOVER_KIN_PULL : KIN_PULL;
          fx += (dx / d) * pull;
          fy += (dy / d) * pull;
        }
        // 太近就互相推开，保证不重叠
        const min = b.r + o.r + 26;
        if (d < min) {
          const push = 260 * (1 - d / min);
          fx -= (dx / d) * push;
          fy -= (dy / d) * push;
        }
      }
    }

    // 刚飞出时阻尼小，会冲过头再弹回；稳定后阻尼变大
    const settle = Math.min(1, (introT - b.activateAt) / 2.5);
    const damping = 2.4 + 2.8 * settle;
    b.vx = (b.vx + fx * dt) * Math.exp(-dt * damping);
    b.vy = (b.vy + fy * dt) * Math.exp(-dt * damping);
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    const h = inp.hoveredId === b.id || inp.focusedId === b.id ? 1 : 0;
    b.hover += (h - b.hover) * (1 - Math.exp(-dt * 9));
  }
}

/** 同领域，或通过推荐（next）互相连着，就算相关 */
export function related(a: Body, b: Body) {
  return (
    (a.topic.field === b.topic.field && a.seed === b.seed) ||
    a.topic.next.includes(b.topic.id) ||
    b.topic.next.includes(a.topic.id)
  );
}

/** 呼吸：0 到 1 之间缓慢起伏 */
export function breath(sim: Sim, b: Body) {
  if (sim.reduced) return 0.5;
  return 0.5 + 0.5 * Math.sin(sim.t * b.breathSpeed + b.breathPhase);
}
