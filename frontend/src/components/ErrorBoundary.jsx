import React from 'react';
import { RefreshCw } from 'lucide-react';

// Errors that mean the browser/service-worker is holding a stale module graph
// (typically after a new deploy/rebuild changes chunk hashes). These are safely
// recovered by a single full reload to fetch fresh assets.
const CHUNK_ERROR = /Loading chunk|dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError/i;
const RELOAD_FLAG = 'cl_reloaded';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Auto-recover from stale-chunk errors by reloading once (guarded against loops).
    if (CHUNK_ERROR.test(error?.message || '') && !sessionStorage.getItem(RELOAD_FLAG)) {
      try { sessionStorage.setItem(RELOAD_FLAG, '1'); } catch { /* ignore */ }
      window.location.reload();
      return;
    }
    console.error('App error boundary caught:', error, info);
  }

  componentDidUpdate(prevProps) {
    // When the user navigates to a different route, clear a one-off page error so
    // they aren't trapped on the fallback screen.
    if (this.state.hasError && prevProps.routeKey !== this.props.routeKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 text-center bg-[#FAFAF9]">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <RefreshCw size={22} className="text-red-500" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-neutral-800 mb-1">Something went wrong</h1>
            <p className="text-sm text-neutral-500 max-w-sm">
              This page hit an unexpected error. Reloading usually fixes it.
            </p>
          </div>
          <button
            onClick={() => { try { sessionStorage.removeItem(RELOAD_FLAG); } catch {} window.location.reload(); }}
            className="px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700 transition-colors"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
