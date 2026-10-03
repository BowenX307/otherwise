// 数据类型，与项目计划「数据模型与接口」一节一致。方案 B 用到的字段都是可选的。

export type Card = {
  id: string;
  angle: string; // 这一屏从哪个领域来讲，如 "Cognitive science"
  text: string; // 一个要点，一到两句
  source: string;
  stance?: 'familiar' | 'another' | 'related'; // 只有方案 B 用
};

export type Topic = {
  id: string;
  title: string; // 与后端 catalog 里的 topic 名一致
  field: Field; // 我们的 6 个色系，由后端的 domain 归并而来，决定星球颜色
  domain: string; // 后端 catalog 里的原始领域名，如 "Mind & behavior"
  description: string; // 后端 catalog 里的一句话描述
  distance: 0 | 1 | 2; // 轨道：0 = 你的兴趣，1 = 相关，2 = 新领域（由后端距离划分）
  gap?: number; // 后端算出的距离（0 到 1，归一化角距离）
  nearest?: string; // 后端返回的 nearest_interest：离哪个兴趣最近
  cards: Card[]; // 阅读内容（打卡流程还没做；目前只有少数 topic 有）
  next: string[]; // 相关的 topic id，用于星球之间的吸引
};

export type Field = 'Technology' | 'Psychology' | 'Business' | 'Science' | 'Creativity' | 'Society';

export type Interest = { id: string; label: string; topicId: string };

export type Planet = {
  id: string;
  topicId: string;
  origin: 'seed' | 'checkin'; // seed = 由初始兴趣生成
  unlockedAt: string; // ISO 日期
  read: string[]; // 读过的 card id，决定星球大小
  marked: string[]; // 标了「这点我没想到」的 card id；非空则星球带环
  take?: string; // 方案 B
  reflection?: string; // 方案 B
};

export type Universe = { userId: string; name: string; planets: Planet[] };
