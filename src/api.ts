// 唯一读数据的地方。现在全部来自 mock；以后接真实后端只改这个文件。
import { SUGGESTION_IDS, topics } from './mock/topics';
import { interests } from './mock/interests';
import { myUniverse } from './mock/universes';
import type { Interest, Planet, Topic, Universe } from './types';

const topicById = new Map(topics.map((t) => [t.id, t]));

export async function getInterests(): Promise<Interest[]> {
  return interests;
}

export async function getUniverse(userId: string): Promise<Universe> {
  if (userId === 'me') return myUniverse; // 之后改为读 localStorage
  throw new Error(`Unknown universe: ${userId}`);
}

export function getTopic(id: string): Topic | undefined {
  return topicById.get(id);
}

/** "Next: one step outside" 的建议：写死的三个后端结果，去掉已经在宇宙里的 */
export function getSuggestions(universe: Universe): Topic[] {
  const owned = new Set(universe.planets.map((p) => p.topicId));
  return SUGGESTION_IDS.map((id) => topicById.get(id)!).filter((t) => t && !owned.has(t.id));
}


/** 打卡完成：解锁一颗新星球。现在写进内存里的 mock，之后改为 localStorage */
export async function unlockPlanet(universe: Universe, topicId: string): Promise<Universe> {
  const topic = getTopic(topicId);
  if (!topic) throw new Error(`Unknown topic: ${topicId}`);
  const planet: Planet = {
    id: `p${universe.planets.length + 1}`,
    topicId,
    origin: 'checkin',
    unlockedAt: localDate(),
    read: topic.cards.map((c) => c.id),
    marked: [],
  };
  return { ...universe, planets: [...universe.planets, planet] };
}

// 用本地日期，避免 UTC 在晚上跨到第二天
function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
