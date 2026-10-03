import type { Universe } from '../types';

// 演示用的「我的宇宙」：3 颗由兴趣生成的内圈星球 + 4 颗探索得到的星球，第一次唤醒时全部点亮。
export const myUniverse: Universe = {
  userId: 'me',
  name: 'You',
  planets: [
    { id: 'p1', topicId: 'photography', origin: 'seed', unlockedAt: '2026-10-01', read: [], marked: [] },
    { id: 'p2', topicId: 'artificial-intelligence', origin: 'seed', unlockedAt: '2026-10-01', read: [], marked: [] },
    { id: 'p3', topicId: 'social-media', origin: 'seed', unlockedAt: '2026-10-01', read: [], marked: [] },
    { id: 'p4', topicId: 'digital-public-spaces', origin: 'checkin', unlockedAt: '2026-10-02', read: [], marked: [] },
    { id: 'p5', topicId: 'food-styling', origin: 'checkin', unlockedAt: '2026-10-02', read: [], marked: [] },
    { id: 'p6', topicId: 'cognitive-psychology', origin: 'checkin', unlockedAt: '2026-10-03', read: ['cp-1', 'cp-2', 'cp-3'], marked: ['cp-2'] },
    { id: 'p7', topicId: 'platform-economics', origin: 'checkin', unlockedAt: '2026-10-03', read: [], marked: [] },
  ],
};
