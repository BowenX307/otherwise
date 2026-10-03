import type { CSSProperties } from 'react';
import { TextButton } from '../components/TextButton';
import { formatDate, pad2 } from '../lib/format';
import { formatGap } from './Panel';
import type { Body } from './engine';
import './PlanetFocus.css';

type Props = { body: Body; color: string; onClose: () => void };

const searchUrl = (provider: 'google' | 'youtube', q: string) =>
  provider === 'youtube'
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
    : `https://www.google.com/search?q=${encodeURIComponent(q)}`;

// 点开一颗星球后，左列从索引换成这颗星球的内容；宇宙在右侧把镜头推近它
export function PlanetFocus({ body, color, onClose }: Props) {
  const { planet, topic } = body;
  const cards = topic.cards.filter((c) => planet.read.includes(c.id));
  let i = 0;
  const step = () => ({ '--i': i++ }) as CSSProperties;

  return (
    <section className="focus" style={{ '--c': color } as CSSProperties} aria-label={topic.title}>
      <p className="focus-meta mono" style={step()}>
        Planet {pad2(body.index + 1)} · {body.seed ? 'Seed' : `Orbit ${body.orbit + 1}`} · {formatDate(planet.unlockedAt)}
      </p>
      <h2 className="focus-title" style={step()}>
        {topic.title}
      </h2>
      <p className="focus-field mono" style={step()}>
        {topic.domain}
      </p>

      <p className="focus-desc" style={step()}>
        {topic.description}
      </p>
      <p className="focus-from mono" style={step()}>
        {body.seed ? 'One of your interests' : `One step from ${topic.nearest} · distance ${formatGap(topic.gap)}`}
      </p>

      {cards.length > 0 && (
        <ol className="focus-points">
          {cards.map((card) => (
            <li key={card.id} style={step()}>
              <p className="point-angle mono">
                {card.angle}
                {planet.marked.includes(card.id) && <span className="point-mark"> · Didn't see this coming</span>}
              </p>
              <p className="point-text">{card.text}</p>
              <p className="point-source">{card.source}</p>
            </li>
          ))}
        </ol>
      )}

      <div className="focus-search" style={step()}>
        <a className="text-button mono" href={searchUrl('google', topic.title)} target="_blank" rel="noreferrer">
          Search Google
        </a>
        <a className="text-button mono" href={searchUrl('youtube', topic.title)} target="_blank" rel="noreferrer">
          Search YouTube
        </a>
      </div>

      <div className="focus-actions" style={step()}>
        <TextButton onClick={onClose}>Back to universe</TextButton>
        <span className="mono focus-esc">Esc</span>
      </div>
    </section>
  );
}
