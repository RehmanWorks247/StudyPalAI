import { Component, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-svh place-items-center bg-background p-6 text-foreground">
          <div role="alert" className="max-w-md rounded-2xl border border-border bg-card p-8">
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="my-5 leading-relaxed text-muted-foreground">
              StudyPal could not display this page. Reload to try again.
            </p>
            <Button onClick={() => window.location.reload()}>Reload page</Button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
