import type { ReactNode } from 'react';
import { OrbLogo } from './OrbLogo';
import './AppShell.css';

type Props = {
  revealed?: boolean; // 入场动画结束后再淡入顶栏
  children: ReactNode;
};

export function AppShell({ revealed = true, children }: Props) {
  return (
    <div className={`shell ${revealed ? 'is-revealed' : ''}`}>
      {children}
      <header className="shell-top">
        <div className="wordmark">
          <OrbLogo size={20} />
          <span>OtherWise</span>
        </div>
        <nav className="shell-nav mono" aria-label="Main">
          <a className="is-active" aria-current="page">Universe</a>
          <a className="is-disabled" aria-disabled="true" title="Coming soon">Friends</a>
        </nav>
      </header>
    </div>
  );
}
