// 宇宙首页：左列是标题、星球索引和下一步，右侧是宇宙（从右边和下边出画）。
// React 只负责搭结构；每一帧的位置、透明度都在 requestAnimationFrame 里直接写 DOM，
// 这样几十个元素 60fps 动起来也不会触发 React 重渲染。
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ORBITS,
  RIPPLE,
  TILT_DEG,
  addPlanet,
  breath,
  createSim,
  ghostPoint,
  nextGhost,
  orbitArrival,
  rippleScale,
  skipIntro,
  sleep,
  step,
  wake,
  type Body,
  type Input,
} from './engine';
import { createStarLayers, drawBackground, type View, type Wave } from './starfield';
import { OrbCore, ORB_UNITS, type OrbState } from './orbCore';
import { sound } from './sound';
import { BG, INK, mix } from './palette';
import { PlanetFocus } from './PlanetFocus';
import { PanelHome, PanelSuggest, formatGap, type PanelView } from './Panel';
import type { Topic, Universe } from '../types';
import './UniverseScene.css';

const FOCUS_ZOOM = 2.2;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.6;
const WAKE_LENGTH = RIPPLE.gather + RIPPLE.travel + 0.3; // 唤醒的光波走完要多久（秒），之后显示左列和顶栏
const ORBIT_OPACITY = [0.42, 0.28, 0.16]; // 越往外越淡
const ORBIT_NAMES = ['01 · Familiar', '02 · Related', '03 · New field'];
const ORBIT_NAME_AT = ['31%', '27%', '23%']; // 标注沿轨道写在哪里（0% 为最左端，25% 为最上方）
const ORB_R = 22; // 中心 Orb 的半径（世界单位）
const ORB_LOOK_RANGE = 240; // 鼠标在这个范围内时，Orb 会看向鼠标
const ORB_SLEEP_AFTER = 15000; // 这么久没有操作，Orb 睡着

type Props = {
  universe: Universe;
  onIntroDone?: (done: boolean) => void;
  suggestions: Topic[]; // "Next: one step outside" 的建议
  onUnlock: (topicId: string) => void; // 选中一个建议：解锁成新星球
};

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** 宇宙放在画面哪里、多大。宽屏时：没唤醒时在正中间（move = 0），唤醒后滑到右侧约 70%（move = 1），外圈从右边出画 */
function layout(W: number, H: number, move: number) {
  const wide = W >= 900;
  if (wide) {
    const base = Math.min((0.4 * W) / ORBITS[2].rx, (0.62 * H) / ORBITS[2].ry);
    const cx = (0.5 + 0.2 * move) * W;
    const cy = (0.5 + 0.03 * move) * H;
    return { wide, base, cx, cy, focusX: 0.68 * W, focusY: 0.5 * H };
  }
  return { wide, base: Math.min(W / 1000, H / 700), cx: 0.5 * W, cy: 0.66 * H, focusX: 0.5 * W, focusY: 0.28 * H };
}

// 星球画法：默认 c（月牙阴影，之后的调整都在 c 上做）；地址加 ?planet=a 可切回纯色圆作对比
type PlanetStyle = 'a' | 'c';
const PLANET_STYLE: PlanetStyle = new URLSearchParams(location.search).get('planet') === 'a' ? 'a' : 'c';
/** 绕椭圆一圈的路径（从最左端顺时针，先经过上方），给轨道标注用 */
const ellipsePath = (rx: number, ry: number) => `M ${-rx} 0 A ${rx} ${ry} 0 1 1 ${rx} 0 A ${rx} ${ry} 0 1 1 ${-rx} 0`;
/** 轨道名字沿轨道大概占据的位置（取开头、中间、结尾三个点，世界坐标），用来判断星球是否压在上面 */
function orbitNamePoints(i: number): [number, number][] {
  const { rx, ry } = ORBITS[i];
  const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const length = ORBIT_NAMES[i].length * 5.4; // 6.5px 等宽字 + 字距，约每字 5.4 个世界单位
  const start = parseFloat(ORBIT_NAME_AT[i]) / 100;
  const tilt = (TILT_DEG * Math.PI) / 180;
  return [0, 0.5, 1].map((k) => {
    const theta = Math.PI + 2 * Math.PI * (start + (k * length) / perimeter);
    const x = rx * Math.cos(theta);
    const y = ry * Math.sin(theta) - 6;
    return [x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt)];
  });
}
const ORBIT_NAME_POINTS = ORBITS.map((_, i) => orbitNamePoints(i));

/** 标签和索引里用的颜色：亮面色混一点白，保证小字对比度 */
const labelColor = (b: Body) => (b.seed ? 'var(--grey)' : mix(b.color, INK, 0.25));

export function UniverseScene({ universe, onIntroDone, suggestions, onUnlock }: Props) {
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [sim] = useState(() => {
    const s = createSim(universe, reduced);
    if (new URLSearchParams(location.search).get('intro') === 'off') skipIntro(s);
    return s;
  });
  const [, setVersion] = useState(0);
  const layers = useMemo(createStarLayers, []);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [introDone, setIntroDone] = useState(sim.awake && sim.t - sim.wakeAt > WAKE_LENGTH);
  const [awake, setAwake] = useState(sim.awake);
  const [panelView, setPanelView] = useState<PanelView>('home');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;
  const previewRef = useRef<string | null>(null);
  previewRef.current = previewId;
  const panelViewRef = useRef(panelView);
  panelViewRef.current = panelView;
  const onUnlockRef = useRef(onUnlock);
  onUnlockRef.current = onUnlock;
  const [dragging, setDragging] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const youRef = useRef<SVGGElement>(null);
  const defsRef = useRef<SVGDefsElement>(null);
  const orbHostRef = useRef<SVGGElement>(null);
  const rippleRef = useRef<SVGGElement>(null);
  const orbHover = useRef(false);
  const lastActivity = useRef(performance.now());
  const orbitRefs = useRef<(SVGGElement | null)[]>([]);
  const orbitNameRefs = useRef<(SVGTextElement | null)[]>([]);
  const orbitNameFade = useRef(ORBITS.map(() => 1));
  const ghostRefs = useRef<(SVGCircleElement | null)[]>([]);
  const bodyRefs = useRef(new Map<string, { g: SVGGElement; lit: SVGElement; halo: SVGCircleElement; flash: SVGCircleElement }>());
  const labelRefs = useRef(new Map<string, HTMLDivElement>());
  const labelSizes = useRef(new Map<string, { w: number; h: number }>());

  const input = useRef<Input>({ pointerIn: false, worldX: 0, worldY: 0, dragging: false, hoveredId: null, focusedId: null });
  const pointer = useRef({ x: 0, y: 0, downX: 0, downY: 0, lastT: 0, moved: false, onEmpty: false });
  const parallax = useRef({ tx: 0, ty: 0, x: 0, y: 0 });
  const cam = useRef({ x: 0, y: 0, k: 1, tx: 0, ty: 0, tk: 1, vx: 0, vy: 0, animating: false, saved: { x: 0, y: 0, k: 1 } });
  const viewRef = useRef<View | null>(null);
  const introDoneRef = useRef(introDone);

  const hover = useCallback((id: string | null) => {
    input.current.hoveredId = id;
    setHoveredId(id);
  }, []);

  const focus = useCallback(
    (id: string) => {
      const c = cam.current;
      if (!input.current.focusedId) c.saved = { x: c.x, y: c.y, k: c.k };
      input.current.focusedId = id;
      c.animating = true;
      c.vx = c.vy = 0;
      setFocusedId(id);
      setPanelView('home');
      setPreviewId(null);
      hover(null);
    },
    [hover],
  );

  const unfocus = useCallback(() => {
    if (!input.current.focusedId) return;
    const c = cam.current;
    input.current.focusedId = null;
    c.tx = c.saved.x;
    c.ty = c.saved.y;
    c.tk = c.saved.k;
    c.animating = true;
    setFocusedId(null);
  }, []);

  const openSuggest = useCallback(() => {
    unfocus();
    setPanelView('suggest');
  }, [unfocus]);

  const closeSuggest = useCallback(() => {
    setPreviewId(null);
    setPanelView('home');
  }, []);

  const pick = useCallback((topicId: string) => {
    setPreviewId(null);
    setPanelView('home');
    onUnlockRef.current(topicId);
  }, []);

  const wakeUp = useCallback(() => {
    if (sim.awake) return;
    wake(sim);
    sound.wake(
      RIPPLE.gather,
      sim.bodies.map((b) => ({ delay: (b.bornAt ?? sim.t) - sim.t, orbit: b.orbit })).sort((a, b) => a.delay - b.delay),
    );
    lastActivity.current = performance.now();
    cam.current = { ...cam.current, tx: 0, ty: 0, tk: 1, vx: 0, vy: 0, animating: true };
    setAwake(true);
  }, [sim]);

  const resetToSleep = useCallback(() => {
    input.current.focusedId = null;
    setFocusedId(null);
    sleep(sim);
    cam.current = { ...cam.current, x: 0, y: 0, k: 1, tx: 0, ty: 0, tk: 1, vx: 0, vy: 0, animating: false };
    introDoneRef.current = false;
    setIntroDone(false);
    setAwake(false);
  }, [sim]);

  // ------------------------------------------------------------ 主循环
  useEffect(() => {
    const root = rootRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let W = 0;
    let H = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = root.clientWidth;
      H = root.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(root);

    const orb = new OrbCore(orbHostRef.current!, defsRef.current!);
    const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const inp = input.current;
      const c = cam.current;
      // 唤醒后，宇宙从正中间滑到右侧（光波刚放出时开始，约 2 秒）
      const m = Math.min(1, Math.max(0, (sim.t - sim.wakeAt - RIPPLE.gather - 0.4) / 2.0));
      const L = layout(W, H, sim.awake ? m * m * (3 - 2 * m) : 0);

      // ---- 镜头：聚焦时把星球推到右侧区域中间；否则拖拽惯性
      if (inp.focusedId) {
        const b = sim.bodies.find((x) => x.id === inp.focusedId);
        if (b) {
          const St = L.base * FOCUS_ZOOM;
          c.tk = FOCUS_ZOOM;
          c.tx = b.x - (L.focusX - L.cx) / St;
          c.ty = b.y - (L.focusY - L.cy) / St;
        }
      }
      if (c.animating) {
        const a = 1 - Math.exp(-dt * (reduced ? 12 : 3.4));
        c.x += (c.tx - c.x) * a;
        c.y += (c.ty - c.y) * a;
        c.k += (c.tk - c.k) * a;
        if (!inp.focusedId && Math.abs(c.tx - c.x) < 0.3 && Math.abs(c.ty - c.y) < 0.3 && Math.abs(c.tk - c.k) < 0.002) c.animating = false;
      } else if (!inp.dragging) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.vx *= Math.exp(-dt * 3.5);
        c.vy *= Math.exp(-dt * 3.5);
      }
      c.x = Math.max(-520, Math.min(520, c.x));
      c.y = Math.max(-340, Math.min(340, c.y));
      // 光波放出的那一刻，整个宇宙被轻轻"推"一下（和低频的声音同步），代替震动
      const sinceRelease = sim.ripple ? sim.t - sim.ripple.start - RIPPLE.gather : -1;
      const thump = !reduced && sinceRelease >= 0 ? 1 + 0.012 * Math.exp(-sinceRelease * 6) : 1;
      const S = L.base * c.k * thump;

      // ---- 鼠标视差（平滑跟随）
      const p = parallax.current;
      const pa = 1 - Math.exp(-dt * 2.5);
      p.x += ((reduced ? 0 : p.tx) - p.x) * pa;
      p.y += ((reduced ? 0 : p.ty) - p.y) * pa;
      const shiftX = -p.x * 14;
      const shiftY = -p.y * 14;
      const ox = L.cx + shiftX;
      const oy = L.cy + shiftY;
      const toScreen = (x: number, y: number): [number, number] => [ox + (x - c.x) * S, oy + (y - c.y) * S];
      inp.worldX = c.x + (pointer.current.x - ox) / S;
      inp.worldY = c.y + (pointer.current.y - oy) / S;

      step(sim, dt, inp, S);

      // ---- 解锁的波纹：Orb 合上、收缩蓄力 → 两半张开，光波放出 → 光波扫过时星点亮起、新星球点亮
      let wave: Wave | null = null;
      let rippleOrb: OrbState | null = null;
      let squeeze = 1;
      const rp = sim.ripple;
      if (rp) {
        const x = sim.t - rp.start;
        if (x < RIPPLE.gather) {
          const g = x / RIPPLE.gather;
          rippleOrb = 'whole';
          squeeze = 1 - 0.18 * (g * g * (3 - 2 * g));
        } else {
          const y = x - RIPPLE.gather;
          rippleOrb = y < 0.9 ? 'release' : null;
          squeeze = 1 + 0.12 * Math.exp(-y * 5) - 0.18 * Math.exp(-y * 30);
          const s = rippleScale(y);
          const fade = Math.max(0, 1 - y / RIPPLE.travel);
          wave = { rx: ORBITS[2].rx * s * S, ry: ORBITS[2].ry * s * S, strength: 0.9 * fade };
          rippleRef.current?.setAttribute('transform', `rotate(${TILT_DEG}) scale(${Math.max(0.001, s)})`);
          rippleRef.current?.setAttribute('opacity', String(fade));
          if (y > RIPPLE.travel + 0.3) {
            sim.ripple = null;
            rippleRef.current?.setAttribute('opacity', '0');
          }
        }
      }

      const view: View = { W, H, S, cx: ox, cy: oy, camX: c.x, camY: c.y, parX: p.x, parY: p.y, toScreen };
      viewRef.current = view;
      drawBackground(ctx, view, sim, layers, wave);

      worldRef.current?.setAttribute('transform', `translate(${ox} ${oy}) scale(${S}) translate(${-c.x} ${-c.y})`);

      // ---- Orb：页面打开时在黑暗里慢慢亮起；状态只靠那道缝的动作表达
      const ignite = easeOut((sim.t - 0.2) / 1.6);
      youRef.current?.setAttribute('transform', `scale(${0.4 + 0.6 * ignite})`);
      youRef.current?.setAttribute('opacity', String(ignite));

      const introT = sim.t - sim.introStart;
      const hoveredBody = sim.bodies.find((b) => b.id === inp.hoveredId);
      const deg = (x: number, y: number) => (Math.atan2(y, x) * 180) / Math.PI;
      const previewTopic = suggestionsRef.current.find((t) => t.id === previewRef.current);
      const previewGhost = previewTopic ? nextGhost(sim, previewTopic.distance) : undefined;
      let orbState: OrbState = 'idle';
      if (rippleOrb) orbState = rippleOrb;
      else if (!sim.awake) orbState = orbHover.current ? 'greet' : 'sleep'; // 还没唤醒：睡着；鼠标放上去时微微张开，提示可以点
      else if (inp.focusedId) orbState = 'reading';
      else if (orbHover.current) orbState = 'greet';
      else if (hoveredBody) {
        orbState = 'look';
        orb.setLook(deg(hoveredBody.x, hoveredBody.y));
      } else if (previewGhost) {
        const [gx, gy] = ghostPoint(sim, previewGhost);
        orbState = 'look';
        orb.setLook(deg(gx, gy));
      } else if (now - lastActivity.current > ORB_SLEEP_AFTER) orbState = 'sleep';
      else if (inp.pointerIn && !inp.dragging && Math.hypot(inp.worldX, inp.worldY) < ORB_LOOK_RANGE) {
        orbState = 'look';
        orb.setLook(deg(inp.worldX, inp.worldY));
      }
      orb.setState(orbState);
      orb.setSqueeze(squeeze);
      orb.update(dt, reduced);

      // ---- 轨道、空槽位
      // 光波扫到哪条轨道，那条轨道才浮现出来
      const orbitIn = ORBITS.map((_, i) => easeOut((sim.t - sim.wakeAt - orbitArrival(i) + 0.15) / 0.9));
      orbitRefs.current.forEach((el, i) => {
        el?.setAttribute('opacity', String(orbitIn[i] * (ORBIT_OPACITY[i] + (hoveredBody?.orbit === i ? 0.18 : 0))));
      });
      // 轨道名字：有星球（连同它的标签）靠近时淡出，离开后再出现
      ORBIT_NAME_POINTS.forEach((pts, i) => {
        let d = Infinity;
        for (const b of sim.bodies) {
          if (b.appear < 0.05) continue;
          for (const [x, y] of pts) d = Math.min(d, Math.hypot(b.x - x, b.y + 10 - y) - b.r);
        }
        const target = Math.min(1, Math.max(0, (d - 22) / 30));
        orbitNameFade.current[i] += (target - orbitNameFade.current[i]) * (1 - Math.exp(-dt * 6));
        orbitNameRefs.current[i]?.setAttribute('opacity', String(orbitNameFade.current[i]));
      });

      sim.ghosts.forEach((g, i) => {
        const el = ghostRefs.current[i];
        if (!el) return;
        const [x, y] = ghostPoint(sim, g);
        const owner = g.filledBy ? sim.bodies.find((b) => b.id === g.filledBy) : null;
        el.setAttribute('cx', String(x));
        el.setAttribute('cy', String(y));
        // 转到左列下面的空位标记藏起来，免得和索引里的文字混在一起
        const behindPanel = L.wide && toScreen(x, y)[0] < 0.36 * W + 12;
        const isPreview = g === previewGhost;
        // 选建议时：它会落下的那个空位放大、变亮、轻轻跳动
        el.setAttribute('r', String(isPreview ? 4 + 1.2 * Math.sin(sim.t * 5) : 2.6));
        el.classList.toggle('is-preview', isPreview);
        el.setAttribute(
          'opacity',
          String(isPreview ? 1 : behindPanel ? 0 : orbitIn[g.orbit] * 0.55 * (owner ? 1 - Math.min(1, owner.appear * 2) : 1)),
        );
      });

      // ---- 星球：扁平两色，亮面永远朝向中心的 Orb（唯一光源）
      for (const b of sim.bodies) {
        const refs = bodyRefs.current.get(b.id);
        if (!refs) continue;
        const br = breath(sim, b);
        const since = b.bornAt !== null ? sim.t - b.bornAt : -1;
        const flash = since >= 0 ? Math.exp(-since * 1.6) : 0;
        const scale = (0.35 + 0.65 * b.appear) * (1 + 0.04 * (br - 0.5)) * (1 + 0.18 * b.hover) * (1 + 0.25 * flash);
        refs.g.setAttribute('transform', `translate(${b.x} ${b.y}) scale(${scale})`);
        refs.g.setAttribute('opacity', String(Math.min(1, b.appear * 1.4)));
        refs.g.style.pointerEvents = b.appear > 0.5 ? '' : 'none'; // 还没出现的星球不能被点到
        refs.lit.setAttribute('transform', `rotate(${deg(-b.x, -b.y)})`);
        refs.halo.setAttribute('opacity', String(b.hover * 0.6));
        // 新星球出生时，一圈细线向外散开
        refs.flash.setAttribute('r', String(b.r * (1 + 2.6 * (1 - flash))));
        refs.flash.setAttribute('opacity', String(since >= 0 ? flash * 0.8 : 0));
      }

      // ---- 标签：屏幕坐标，不随缩放变大；优先放在星球正下方，放不下再换方向
      const taken: Rect[] = sim.bodies.map((b) => {
        const [x, y] = toScreen(b.x, b.y);
        const rr = b.r * S * (1 + 0.18 * b.hover);
        return { x: x - rr, y: y - rr, w: rr * 2, h: rr * 2 };
      });
      const order = [...sim.bodies].sort((a, b) => b.r - a.r || a.index - b.index);
      for (const b of order) {
        const el = labelRefs.current.get(b.id);
        if (!el) continue;
        let size = labelSizes.current.get(b.id);
        if (!size || size.w === 0) {
          const name = el.querySelector('.label-name') as HTMLElement;
          size = { w: name.offsetWidth, h: name.offsetHeight };
          labelSizes.current.set(b.id, size);
        }
        const [x, y] = toScreen(b.x, b.y);
        const rr = b.r * S * (1 + 0.18 * b.hover);
        const { w, h } = size;
        const candidates: Rect[] = [
          { x: x - w / 2, y: y + rr + 9, w, h },
          { x: x - w / 2, y: y - rr - 9 - h, w, h },
          { x: x + rr + 11, y: y - h / 2, w, h },
          { x: x - rr - 11 - w, y: y - h / 2, w, h },
        ];
        const self = sim.bodies.indexOf(b);
        // 标签要完整留在画面里，并且不和别的星球、标签重叠
        const inView = (r: Rect) => r.x >= 8 && r.y >= 8 && r.x + r.w <= W - 8 && r.y + r.h <= H - 8;
        const fits = (r: Rect) => inView(r) && taken.every((t, i) => i === self || !overlaps(r, t));
        if (fits(candidates[0])) b.labelSide = 0;
        else if (!fits(candidates[b.labelSide])) {
          const free = candidates.findIndex(fits);
          if (free >= 0) b.labelSide = free;
        }
        const r = candidates[b.labelSide];
        taken.push(r);
        el.style.transform = `translate(${r.x}px, ${r.y}px)`;
        el.dataset.side = String(b.labelSide);
        el.style.opacity = String(Math.min(1, Math.max(0, (introT - b.activateAt - 0.7) / 0.6)));
      }

      if (!introDoneRef.current && sim.awake && sim.t - sim.wakeAt > WAKE_LENGTH) {
        introDoneRef.current = true;
        setIntroDone(true);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // 给开场动画和演示用：wake() 唤醒宇宙，reset() 回到只有睡着的 Orb
    const w = window as unknown as { otherwise?: Record<string, unknown> };
    w.otherwise = Object.assign(w.otherwise ?? {}, { wake: wakeUp, reset: resetToSleep, playIntro: wakeUp });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      orb.destroy();
    };
  }, [sim, layers, reduced, wakeUp, resetToSleep]);

  useEffect(() => onIntroDone?.(introDone), [introDone, onIntroDone]);

  // universe 多出新星球时：加进模拟，镜头回到全景，播放波纹
  useEffect(() => {
    const before = sim.bodies.length;
    universe.planets.forEach((planet, index) => addPlanet(sim, planet, index));
    if (sim.bodies.length > before) {
      const born = sim.bodies[sim.bodies.length - 1];
      sound.unlock(RIPPLE.gather, { delay: (born.bornAt ?? sim.t) - sim.t, orbit: born.orbit });
      unfocus();
      cam.current = { ...cam.current, tx: 0, ty: 0, tk: 1, animating: true };
      setVersion((v) => v + 1);
    }
  }, [universe, sim, unfocus]);

  // ------------------------------------------------------------ 键盘、滚轮
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      lastActivity.current = performance.now();
      if (e.key.toLowerCase() === 'm' && !e.repeat && !e.metaKey && !e.ctrlKey) sound.toggle();
      if (e.key === 'Escape') {
        if (panelViewRef.current === 'suggest') closeSuggest();
        else unfocus();
      }
      if (e.key.toLowerCase() === 'n' && !e.repeat && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement)) {
        if (!sim.awake) wakeUp();
        else if (!sim.ripple && suggestionsRef.current[0]) pick(suggestionsRef.current[0].id);
      }
    };
    const root = rootRef.current!;
    const onWheel = (e: WheelEvent) => {
      lastActivity.current = performance.now();
      if ((e.target as Element).closest('.panel')) return; // 左列里的滚动交给浏览器
      e.preventDefault();
      const v = viewRef.current;
      if (!v || input.current.focusedId) return;
      const c = cam.current;
      const rect = root.getBoundingClientRect();
      const mx = e.clientX - rect.left - v.cx;
      const my = e.clientY - rect.top - v.cy;
      // 以鼠标位置为锚点缩放：缩放前后鼠标下的世界坐标不变
      const wx = c.x + mx / v.S;
      const wy = c.y + my / v.S;
      const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, c.k * Math.exp(-e.deltaY * 0.0018)));
      const S2 = (v.S / c.k) * k;
      c.k = c.tk = k;
      c.x = c.tx = wx - mx / S2;
      c.y = c.ty = wy - my / S2;
      c.animating = false;
    };
    window.addEventListener('keydown', onKey);
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey);
      root.removeEventListener('wheel', onWheel);
    };
  }, [unfocus, sim, wakeUp, closeSuggest, pick]);

  // ------------------------------------------------------------ 指针：拖拽平移、视差、点空白处返回
  const onPointerMove = (e: ReactPointerEvent) => {
    const rect = rootRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pt = pointer.current;
    const inp = input.current;
    inp.pointerIn = true;
    lastActivity.current = performance.now();
    parallax.current.tx = (x / rect.width - 0.5) * 2;
    parallax.current.ty = (y / rect.height - 0.5) * 2;
    if (inp.dragging && viewRef.current) {
      const S = viewRef.current.S;
      const c = cam.current;
      const dx = x - pt.x;
      const dy = y - pt.y;
      c.x -= dx / S;
      c.y -= dy / S;
      const dtMs = Math.max(8, e.timeStamp - pt.lastT);
      c.vx = (-dx / S / dtMs) * 1000;
      c.vy = (-dy / S / dtMs) * 1000;
      if (Math.hypot(x - pt.downX, y - pt.downY) > 4) pt.moved = true;
    }
    pt.x = x;
    pt.y = y;
    pt.lastT = e.timeStamp;
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    const target = e.target as Element;
    if (target.closest('.panel')) return; // 左列是普通界面，不拖拽宇宙
    const onBody = target.closest('[data-body]');
    const pt = pointer.current;
    pt.downX = pt.x;
    pt.downY = pt.y;
    pt.moved = false;
    pt.onEmpty = !onBody;
    if (onBody || input.current.focusedId) return;
    input.current.dragging = true;
    cam.current.animating = false;
    cam.current.vx = cam.current.vy = 0;
    setDragging(true);
    rootRef.current!.setPointerCapture(e.pointerId);
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const pt = pointer.current;
    if (input.current.dragging) {
      input.current.dragging = false;
      setDragging(false);
      // 停住不动再松手，就不要惯性
      if (performance.now() - pt.lastT > 80) cam.current.vx = cam.current.vy = 0;
    }
    const inPanel = (e.target as Element).closest('.panel');
    if (pt.onEmpty && !pt.moved && !inPanel && input.current.focusedId) unfocus();
  };

  const bodies = sim.bodies;
  const focusedBody = bodies.find((b) => b.id === focusedId) ?? null;

  return (
    <div
      ref={rootRef}
      className={`scene ${focusedId ? 'is-focus' : ''} ${dragging ? 'is-dragging' : ''} ${introDone ? 'is-ready' : ''} ${awake ? '' : 'is-asleep'}`}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={() => (input.current.pointerIn = false)}
    >
      <canvas ref={canvasRef} className="scene-canvas" aria-hidden />

      <svg className="scene-svg">
        <defs ref={defsRef}>
          <filter id="soft-shade" primitiveUnits="objectBoundingBox" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="0.035" />
          </filter>
          {ORBITS.map((o, i) => (
            <path key={i} id={`orbit-path-${i}`} d={ellipsePath(o.rx, o.ry)} />
          ))}
        </defs>

        <g ref={worldRef}>
          {/* 轨道：虚线 + 沿轨道写的名字；外圈再加一圈刻度，像古星图 */}
          {ORBITS.map((o, i) => (
            <g
              key={i}
              ref={(el) => {
                orbitRefs.current[i] = el;
              }}
              className="orbit"
              transform={`rotate(${TILT_DEG})`}
              opacity={0}
            >
              <ellipse className="orbit-line" rx={o.rx} ry={o.ry} />
              <text
                className="orbit-name"
                dy={-6}
                ref={(el) => {
                  orbitNameRefs.current[i] = el;
                }}
              >
                <textPath href={`#orbit-path-${i}`} startOffset={ORBIT_NAME_AT[i]}>
                  {ORBIT_NAMES[i]}
                </textPath>
              </text>
              {i === 2 && <OrbitTicks rx={o.rx} ry={o.ry} />}
            </g>
          ))}

          <g ref={rippleRef} className="ripple" opacity={0}>
            <ellipse className="ripple-glow" rx={ORBITS[2].rx} ry={ORBITS[2].ry} />
            <ellipse className="ripple-line" rx={ORBITS[2].rx} ry={ORBITS[2].ry} />
          </g>

          {sim.ghosts.map((_, i) => (
            <circle
              key={i}
              ref={(el) => {
                ghostRefs.current[i] = el;
              }}
              className="ghost"
              r={2.6}
              opacity={0}
            />
          ))}

          <g className="you" aria-label="You">
            <g ref={youRef} opacity={0}>
              <g ref={orbHostRef} transform={`scale(${ORB_R / ORB_UNITS})`} />
              <circle
                className="orb-hit"
                r={ORB_R + 10}
                onPointerEnter={() => (orbHover.current = true)}
                onPointerLeave={() => (orbHover.current = false)}
                onClick={wakeUp}
              />
            </g>
          </g>

          {bodies.map((b) => (
            <g key={b.id} className={`body ${b.id === focusedId ? 'is-focused' : ''}`}>
              <g
                ref={(el) => {
                  const lit = el?.querySelector<SVGElement>('.body-lit');
                  const halo = el?.querySelector<SVGCircleElement>('.body-halo');
                  const flash = el?.querySelector<SVGCircleElement>('.body-flash');
                  if (el && lit && halo && flash) bodyRefs.current.set(b.id, { g: el, lit, halo, flash });
                  else bodyRefs.current.delete(b.id);
                }}
                opacity={0}
              >
                <circle className="body-halo" r={b.r + 6} opacity={0} />
                <circle className="body-flash" r={b.r} stroke={b.color} opacity={0} />
                {b.ring && <Ring r={b.r} color={b.color} half="back" />}
                <PlanetBody b={b} />
                {b.ring && <Ring r={b.r} color={b.color} half="front" />}
                <circle
                  className="body-hit"
                  data-body={b.id}
                  r={b.r + 12}
                  role="button"
                  tabIndex={0}
                  aria-label={`${b.topic.title}, ${b.seed ? 'seed' : `orbit ${b.orbit + 1}`}`}
                  onPointerEnter={() => !focusedId && hover(b.id)}
                  onPointerLeave={() => hover(null)}
                  onFocus={() => !focusedId && hover(b.id)}
                  onBlur={() => hover(null)}
                  onClick={() => !pointer.current.moved && focus(b.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), focus(b.id))}
                />
              </g>
            </g>
          ))}
        </g>
      </svg>

      <div className="labels" aria-hidden>
        {bodies.map((b) => (
          <div
            key={b.id}
            ref={(el) => {
              if (el) labelRefs.current.set(b.id, el);
              else labelRefs.current.delete(b.id);
            }}
            className="label"
            style={{ '--c': labelColor(b) } as CSSProperties}
          >
            <div className={`label-inner ${hoveredId === b.id ? 'is-hover' : ''}`}>
              <span className="label-name">{b.topic.title}</span>
              <span className="label-meta">{b.seed ? 'Your interest' : `${formatGap(b.topic.gap)} from ${b.topic.nearest}`}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 左列：标题、星球索引、下一步；点开星球时换成这颗星球的内容 */}
      <aside className="panel">
        {focusedBody ? (
          <PlanetFocus key={focusedBody.id} body={focusedBody} color={labelColor(focusedBody)} onClose={unfocus} />
        ) : panelView === 'suggest' && suggestions.length > 0 ? (
          <PanelSuggest suggestions={suggestions} previewId={previewId} onPreview={setPreviewId} onPick={pick} onClose={closeSuggest} />
        ) : (
          <PanelHome
            bodies={bodies}
            simT={sim.t}
            hoveredId={hoveredId}
            canSuggest={suggestions.length > 0}
            onHover={hover}
            onFocus={focus}
            onOpenSuggest={openSuggest}
          />
        )}
      </aside>

      <p className="wake-hint mono" aria-live="polite">
        Press N
      </p>
    </div>
  );
}

/** 行星环：拆成后半圈（画在星球后面）和前半圈（画在前面），1px 细线 */
function Ring({ r, color, half }: { r: number; color: string; half: 'back' | 'front' }) {
  const rx = r * 1.9;
  const ry = r * 0.42;
  const d = half === 'back' ? `M ${-rx} 0 A ${rx} ${ry} 0 0 1 ${rx} 0` : `M ${rx} 0 A ${rx} ${ry} 0 0 1 ${-rx} 0`;
  return (
    <path
      d={d}
      transform="rotate(-20)"
      fill="none"
      stroke={color}
      strokeWidth={1}
      opacity={half === 'back' ? 0.4 : 0.9}
      vectorEffect="non-scaling-stroke"
    />
  );
}

/** 外圈刻度：每 5° 一短刻，每 30° 一长刻，沿法线朝外 */
function OrbitTicks({ rx, ry }: { rx: number; ry: number }) {
  const ticks = [];
  for (let i = 0; i < 72; i++) {
    const t = (i * 5 * Math.PI) / 180;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    let nx = Math.cos(t) / rx;
    let ny = Math.sin(t) / ry;
    const len = Math.hypot(nx, ny);
    nx /= len;
    ny /= len;
    const major = i % 6 === 0;
    const l = major ? 9 : 4;
    ticks.push(
      <line key={i} className={major ? 'tick is-major' : 'tick'} x1={x + nx * 3} y1={y + ny * 3} x2={x + nx * (3 + l)} y2={y + ny * (3 + l)} />,
    );
  }
  return <g>{ticks}</g>;
}

export type { Body };

/** 星球本体。.body-lit 那一层每帧会被转向中心（亮面朝向 Orb） */
function PlanetBody({ b }: { b: Body }) {
  switch (PLANET_STYLE) {
    case 'a': // 纯色圆（备选）
      return (
        <>
          <circle r={b.r} fill={b.color} />
          <g className="body-lit" />
        </>
      );
    default: // c：月牙形阴影：整颗先涂暗色，再把一个偏向 Orb 的亮色圆盖上去，露出背光一侧的月牙；
      // 只把明暗交界那条弧线虚化一点，星球外轮廓仍然是清晰的圆
      return (
        <>
          <clipPath id={`clip-${b.id}`}>
            <circle r={b.r} />
          </clipPath>
          <g clipPath={`url(#clip-${b.id})`}>
            <circle r={b.r} fill={mix(b.color, BG, 0.6)} />
            <g className="body-lit">
              <circle cx={b.r * 0.38} r={b.r * 1.02} fill={b.color} filter="url(#soft-shade)" />
            </g>
          </g>
        </>
      );
  }
}
