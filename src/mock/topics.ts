import type { Field, Topic } from '../types';

// 写死的演示数据，全部来自后端 POST /api/recommend 的真实返回（2026-10-03）。
// 人设的兴趣：Photography、Artificial intelligence、Social media（global 模式）。
// expansion_level 0 返回的放「相关」轨道，expansion_level 8 返回的放「新领域」轨道。
// title / domain 与后端 catalog.json 一致，description 按 catalog 整理成句；gap 是后端返回的 distance。

/** 后端 23 个 domain 归并到我们的 6 个色系（这里只列演示数据用到的） */
export const DOMAIN_FIELD: Record<string, Field> = {
  'Computing & information': 'Technology',
  'Engineering & transport': 'Technology',
  'Economics & organizations': 'Business',
  'Mind & behavior': 'Psychology',
  Philosophy: 'Psychology',
  'Society & relationships': 'Society',
  'Politics & law': 'Society',
  'Literature & storytelling': 'Creativity',
  'Visual arts & design': 'Creativity',
  'Music & performance': 'Creativity',
  'Earth & environment': 'Science',
  'Health & medicine': 'Science',
  'Food & agriculture': 'Science',
  'Physics & astronomy': 'Science',
  'Biology & nature': 'Science',
  'Chemistry & materials': 'Science',
  Mathematics: 'Science',
  'History & culture': 'Society',
  'Geography & travel': 'Society',
  'Learning & language': 'Society',
  'Religion & spirituality': 'Society',
  'Home & crafts': 'Creativity',
  'Games & sports': 'Technology',
};

type Raw = Omit<Topic, 'field' | 'next' | 'cards'> & Partial<Pick<Topic, 'next' | 'cards'>>;
const topic = (t: Raw): Topic => ({ next: [], cards: [], ...t, field: DOMAIN_FIELD[t.domain] ?? 'Society' });

export const topics: Topic[] = [
  // ---- 你的兴趣（内圈，由偏好生成，没有阅读内容）
  topic({
    id: 'photography',
    title: 'Photography',
    domain: 'Visual arts & design',
    description: 'Creating images with cameras through choices of light, composition and timing.',
    distance: 0,
    next: ['food-styling', 'optics'],
  }),
  topic({
    id: 'artificial-intelligence',
    title: 'Artificial intelligence',
    domain: 'Computing & information',
    description: 'The field that builds software able to behave intelligently.',
    distance: 0,
    next: ['cognitive-psychology', 'transhumanism'],
  }),
  topic({
    id: 'social-media',
    title: 'Social media',
    domain: 'Computing & information',
    description: 'Online communities where people share and talk.',
    distance: 0,
    next: ['digital-public-spaces', 'platform-economics', 'civic-technology'],
  }),

  // ---- 相关（中圈，expansion_level 0）
  topic({
    id: 'digital-public-spaces',
    title: 'Digital public spaces',
    domain: 'Politics & law',
    description: 'Examining online environments for civic discussion and shared community life.',
    distance: 1,
    gap: 0.312,
    nearest: 'Social media',
    next: ['platform-economics', 'civic-technology'],
  }),
  topic({
    id: 'food-styling',
    title: 'Food styling',
    domain: 'Food & agriculture',
    description: 'Arranging food visually for photographs, film and presentation.',
    distance: 1,
    gap: 0.324,
    nearest: 'Photography',
    next: ['photography'],
  }),

  // ---- 新领域（外圈，expansion_level 8）
  topic({
    id: 'cognitive-psychology',
    title: 'Cognitive psychology',
    domain: 'Mind & behavior',
    description: 'Studying mental processes such as attention, memory and reasoning.',
    distance: 2,
    gap: 0.353,
    nearest: 'Artificial intelligence',
    next: ['artificial-intelligence'],
    cards: [
      {
        id: 'cp-1',
        angle: 'Experimental psychology',
        text: 'Asked to find the rule behind 2, 4, 6, most people only test examples that fit their guess. Few try one that could prove them wrong.',
        source: 'Peter Wason, 2-4-6 task (1960)',
      },
      {
        id: 'cp-2',
        angle: 'Cognitive science',
        text: 'Confirmation bias shows up in how we search, what we remember, and how we read the same evidence differently depending on what we already believe.',
        source: 'Raymond Nickerson, Review of General Psychology (1998)',
      },
      {
        id: 'cp-3',
        angle: 'Behavioral economics',
        text: 'Fast, intuitive thinking jumps to a coherent story. Slower thinking is needed to ask what evidence is missing.',
        source: 'Daniel Kahneman, Thinking, Fast and Slow (2011)',
      },
    ],
  }),
  topic({
    id: 'platform-economics',
    title: 'Platform economics',
    domain: 'Economics & organizations',
    description: 'Examining markets organized through digital intermediaries.',
    distance: 2,
    gap: 0.373,
    nearest: 'Social media',
    next: ['digital-public-spaces'],
  }),

  // ---- 下一步的建议（"Next: one step outside"），都在外圈
  topic({
    id: 'optics',
    title: 'Optics',
    domain: 'Physics & astronomy',
    description: 'Studying light and its interactions with matter.',
    distance: 2,
    gap: 0.355,
    nearest: 'Photography',
    next: ['photography'],
  }),
  topic({
    id: 'civic-technology',
    title: 'Civic technology',
    domain: 'Politics & law',
    description: 'Using technology to support public participation and civic institutions.',
    distance: 2,
    gap: 0.365,
    nearest: 'Social media',
    next: ['digital-public-spaces'],
  }),
  topic({
    id: 'transhumanism',
    title: 'Transhumanism',
    domain: 'Engineering & transport',
    description: 'A movement to use technology to enhance human minds and bodies.',
    distance: 2,
    gap: 0.353,
    nearest: 'Artificial intelligence',
    next: ['cognitive-psychology'],
  }),
];

/** "Next: one step outside" 给出的三个建议，按顺序 */
export const SUGGESTION_IDS = ['optics', 'civic-technology', 'transhumanism'];
