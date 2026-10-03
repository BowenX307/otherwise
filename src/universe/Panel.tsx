// 左列：三种视图
//  home    — 标题、统计、按轨道分组的星球索引、"Next: one step outside"
//  suggest — 下一步的三个建议（后端结果），hover 时宇宙里高亮它会落下的空位，点选即解锁
//  focus   — 一颗星球的详情（PlanetFocus）
import type { CSSProperties } from 'react';
import { TextButton } from '../components/TextButton';
import { pad2 } from '../lib/format';
import { FIELD_HEX, INK, mix } from './palette';
import type { Body } from './engine';
import type { Topic } from '../types';
import './Panel.css';

export type PanelView = 'home' | 'suggest';

const GROUPS = [
  { orbit: 0, label: '01 · Familiar' },
  { orbit: 1, label: '02 · Related' },
  { orbit: 2, label: '03 · New field' },
];

/** 距离显示成两位小数，如 0.35 */
export const formatGap = (gap?: number) => (gap === undefined ? '' : gap.toFixed(2));

type HomeProps = {
  bodies: Body[];
  simT: number;
  hoveredId: string | null;
  canSuggest: boolean;
  onHover: (id: string | null) => void;
  onFocus: (id: string) => void;
  onOpenSuggest: () => void;
};

export function PanelHome({ bodies, simT, hoveredId, canSuggest, onHover, onFocus, onOpenSuggest }: HomeProps) {
  const domains = new Set(bodies.map((b) => b.topic.domain)).size;
  const outer = bodies.filter((b) => b.orbit === 2).length;
  return (
    <div className="panel-home">
      <h1 className="headline">Most of your universe is still dark.</h1>
      <p className="stats mono">
        {pad2(bodies.length)} planets · {pad2(domains)} fields · outer orbit {pad2(outer)} / 08
      </p>

      <div className="index" role="list" aria-label="Planets by orbit">
        {GROUPS.map(({ orbit, label }) => {
          const rows = bodies.filter((b) => b.orbit === orbit);
          if (!rows.length) return null;
          return (
            <section key={orbit} className="index-group">
              <h2 className="index-label mono">{label}</h2>
              <ol>
                {rows.map((b) => {
                  const wait = b.bornAt !== null ? Math.max(0, b.bornAt - simT) : 0;
                  return (
                    <li key={b.id} className={b.bornAt !== null && b.planet.origin === 'checkin' && wait > 0 ? 'is-new' : ''} style={{ '--wait': `${wait}s` } as CSSProperties}>
                      <button
                        className={`row ${hoveredId === b.id ? 'is-hover' : ''}`}
                        style={{ '--c': b.color } as CSSProperties}
                        onPointerEnter={() => onHover(b.id)}
                        onPointerLeave={() => onHover(null)}
                        onFocus={() => onHover(b.id)}
                        onBlur={() => onHover(null)}
                        onClick={() => onFocus(b.id)}
                      >
                        <span className="row-num mono">{pad2(b.index + 1)}</span>
                        <span className="row-dot" aria-hidden />
                        <span className="row-name">{b.topic.title}</span>
                        <span className="row-meta mono">{b.seed ? 'Seed' : formatGap(b.topic.gap)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>

      {canSuggest && (
        <TextButton className="next" onClick={onOpenSuggest}>
          Next: one step outside
        </TextButton>
      )}
      <p className="hint mono">Drag · Scroll to zoom · Click a planet</p>
    </div>
  );
}

type SuggestProps = {
  suggestions: Topic[];
  previewId: string | null;
  onPreview: (id: string | null) => void;
  onPick: (topicId: string) => void;
  onClose: () => void;
};

export function PanelSuggest({ suggestions, previewId, onPreview, onPick, onClose }: SuggestProps) {
  let i = 0;
  const step = () => ({ '--i': i++ }) as CSSProperties;
  return (
    <section className="suggest" aria-label="One step outside">
      <p className="focus-meta mono" style={step()}>
        One step outside · {pad2(suggestions.length)} ideas
      </p>
      <h2 className="suggest-title" style={step()}>
        Just past your edge.
      </h2>
      <p className="suggest-sub" style={step()}>
        Each is one step beyond something you already read about. Pick one to add it to your universe.
      </p>
      <ol className="suggest-list">
        {suggestions.map((t) => (
          <li key={t.id} style={step()}>
            <button
              className={`option ${previewId === t.id ? 'is-hover' : ''}`}
              style={{ '--c': mix(FIELD_HEX[t.field], INK, 0.25), '--dot': FIELD_HEX[t.field] } as CSSProperties}
              onPointerEnter={() => onPreview(t.id)}
              onPointerLeave={() => onPreview(null)}
              onFocus={() => onPreview(t.id)}
              onBlur={() => onPreview(null)}
              onClick={() => onPick(t.id)}
            >
              <span className="option-head">
                <span className="option-dot" aria-hidden />
                <span className="option-name">{t.title}</span>
                <span className="option-gap mono">{formatGap(t.gap)}</span>
              </span>
              <span className="option-desc">{t.description}</span>
              <span className="option-from mono">
                {t.domain} · from {t.nearest}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="focus-actions" style={step()}>
        <TextButton onClick={onClose}>Back</TextButton>
        <span className="mono focus-esc">Esc</span>
      </div>
    </section>
  );
}
