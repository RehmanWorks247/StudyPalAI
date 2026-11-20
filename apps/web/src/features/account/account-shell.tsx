import type { ReactNode } from 'react';
import './account.css';

export function AccountShell({ children }: { children: ReactNode }) {
  return (
    <main className="account-shell">
      <div className="account-brand">
        <span aria-hidden="true">S</span>StudyPal
      </div>
      <section className="account-panel">{children}</section>
    </main>
  );
}
