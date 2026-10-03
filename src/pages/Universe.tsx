import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { UniverseScene } from '../universe/UniverseScene';
import { getSuggestions, getUniverse, unlockPlanet } from '../api';
import type { Universe as UniverseData } from '../types';

export function Universe() {
  const [universe, setUniverse] = useState<UniverseData | null>(null);
  const [revealed, setRevealed] = useState(false);
  const universeRef = useRef(universe);
  universeRef.current = universe;

  useEffect(() => {
    getUniverse('me').then(setUniverse);
  }, []);

  // 解锁一颗新星球（播放波纹）。由左列的建议、N 键、window.otherwise.unlock() 触发；
  // 以后打卡完成时调用同一个流程
  const unlock = useCallback(async (topicId?: string) => {
    const current = universeRef.current;
    if (!current) return;
    const id = topicId ?? getSuggestions(current)[0]?.id;
    if (!id) return;
    setUniverse(await unlockPlanet(current, id));
  }, []);

  useEffect(() => {
    const w = window as unknown as { otherwise?: Record<string, unknown> };
    w.otherwise = Object.assign(w.otherwise ?? {}, { unlock });
  }, [unlock]);

  if (!universe) return null;

  return (
    <AppShell revealed={revealed}>
      <UniverseScene universe={universe} onIntroDone={setRevealed} suggestions={getSuggestions(universe)} onUnlock={unlock} />
    </AppShell>
  );
}
