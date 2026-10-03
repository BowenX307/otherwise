# OtherWise · Universe

OtherWise 的网页前端：一个会呼吸的宇宙。中心是 Orb，内圈是你的兴趣，越往外是你越少去的地方。每探索一个"往外一步"的 topic，就多一颗星球。

纯前端，数据写死在 `src/mock/`，不需要后端就能跑。数据本身来自后端推荐接口的真实返回（见下方「数据」）。

## 运行

```bash
npm install
npm run dev        # 打开终端里显示的地址，默认 http://localhost:5173
npm run build      # 类型检查 + 打包到 dist/
```

需要 Node 20 以上。字体打包在项目里，断网也能跑。

## 演示流程

1. 打开页面：只有中间一颗睡着的 Orb，下面写着 `PRESS N`。
2. 按 **N**（或点 Orb）：Orb 放出光波，三条轨道和 7 颗星球依次点亮，宇宙滑到右侧，左列淡入。
3. 左列索引：hover 一行，对应星球亮起；点一行（或点星球）看详情，**Esc** 返回。
4. **Next: one step outside**：三个建议。hover 一个，宇宙里它会落下的位置会亮起；选中后光波再放一次，新星球点亮。醒着时按 **N** 等于直接选第一个建议。
5. 刷新页面即可重来。

### 调试用

| 地址参数 / 接口 | 作用 |
|---|---|
| `?intro=off` | 跳过开场，直接显示醒着的完整宇宙 |
| `?planet=a` | 星球改用纯色圆（默认是带月牙阴影的画法） |
| `window.otherwise.wake()` | 唤醒宇宙（给开场动画结束时调用） |
| `window.otherwise.reset()` | 回到只有睡着的 Orb |
| `window.otherwise.unlock(topicId?)` | 解锁一颗新星球（以后打卡完成时调用） |

系统开启"减少动态效果"时，页面跳过开场、关闭漂移和视差。

### 声音

唤醒和解锁时有音效，全部用 Web Audio 实时合成（`src/universe/sound.ts`），没有音频文件。按 **M** 或点顶栏的 `Sound on / off` 静音，设置会记住。

## 代码结构

```text
src/
  types.ts              数据类型（Topic、Planet、Universe）
  api.ts                唯一读数据的地方；以后接真实后端只改这里
  mock/                 写死的演示数据
    topics.ts           所有 topic（来自后端结果）+ domain → 颜色的映射 + 下一步建议
    universes.ts        演示用的"我的宇宙"（7 颗星球）
    interests.ts        Start 选兴趣页用（页面还没做）
  pages/Universe.tsx    首页：持有宇宙数据，处理解锁
  universe/
    UniverseScene.tsx   宇宙场景：画布星空 + SVG 轨道和星球 + 每帧动画、镜头、交互
    engine.ts           模拟：轨道、物理、唤醒与解锁的时间线、空位
    starfield.ts        画布：视差星点、光波经过时星点变亮
    orbCore.ts          中心的 Orb（也是 logo）：一道缝，靠动作表达状态
    sound.ts            音效（Web Audio 合成）
    Panel.tsx           左列：索引 / 下一步建议
    PlanetFocus.tsx     左列：一颗星球的详情
    palette.ts          颜色（与 styles/tokens.css 保持一致）
  components/           AppShell（顶栏）、OrbLogo、TextButton
  styles/               颜色变量和全局样式
```

每一帧的位置和透明度直接写 DOM（`requestAnimationFrame`），React 只负责结构，所以几十个元素 60fps 动也不会重渲染。

## 数据

演示人设的兴趣是 **Photography、Artificial intelligence、Social media**。其余星球和建议都是后端 `POST /api/recommend` 对这三个兴趣的真实返回（global 模式）：

- `expansion_level: 0` 的结果放中圈（Related）
- `expansion_level: 8` 的结果放外圈（New field）
- `gap` 是后端返回的 `distance`，`nearest` 是 `nearest_interest`
- topic 名、domain、描述与后端 `catalog.json` 一致

后端有 23 个 domain，前端只有 6 个颜色，映射在 `src/mock/topics.ts` 的 `DOMAIN_FIELD`。

想换人设或换星球：用后端拿到新结果，改 `mock/topics.ts`（topic）和 `mock/universes.ts`（哪些是初始星球）。topic 名必须是后端 catalog 里有的。

后端的地址和访问码不要写进这个仓库。

## 还没做

- Start 选兴趣页、朋友的宇宙（顶栏的 Friends）、localStorage 保存。
- 只有 Cognitive psychology 有阅读内容（3 屏要点）；其他星球的详情是描述 + Google / YouTube 搜索。
