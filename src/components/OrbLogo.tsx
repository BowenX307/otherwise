import { useId } from 'react';
import { ORB_GAP, ORB_ROUND, ORB_UNITS, roundThreshold, slitPath } from '../universe/orbCore';

// 静态的 Orb logo，和宇宙中心那个是同一个图形：一个圆，中间一道横缝分成上下两半
export function OrbLogo({ size = 18 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="-110 -110 220 220" aria-hidden>
      <defs>
        <filter id={`${id}-r`} filterUnits="userSpaceOnUse" x={-130} y={-130} width={260} height={260}>
          <feGaussianBlur stdDeviation={ORB_ROUND} />
          <feColorMatrix type="matrix" values={roundThreshold(0.85)} />
          <feGaussianBlur stdDeviation={ORB_ROUND} />
          <feColorMatrix type="matrix" values={roundThreshold(0.15)} />
        </filter>
        <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x={-130} y={-130} width={260} height={260}>
          <rect x={-130} y={-130} width={260} height={260} fill="#fff" />
          {/* 小尺寸下缝要宽一点才看得清 */}
          <path d={slitPath(ORB_GAP * 1.7, 0)} fill="#000" />
        </mask>
      </defs>
      <g filter={`url(#${id}-r)`}>
        <circle r={ORB_UNITS} fill="currentColor" mask={`url(#${id}-m)`} />
      </g>
    </svg>
  );
}
