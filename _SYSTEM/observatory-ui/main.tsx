/**
 * main.tsx — standalone entry for the YURI Trading Observatory.
 *
 * Mounts ObservatoryPage standalone (no router / no nexuslink shell) on its own
 * port (4250) via vite.observatory.config.mts, reusing the shared dashboard
 * components from ../src/. Backend data comes direct from the observatory server
 * (VITE_OBSERVATORY_BASE → :4243, CORS-allowed).
 *
 * A top-level error boundary surfaces any runtime render error as a visible panel
 * (inline-styled so it shows even if CSS fails) instead of a blank white screen.
 */
import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import ObservatoryPage from '../src/pages/ObservatoryPage';

class RootBoundary extends Component<{ children: ReactNode }, { err: Error | null; info: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { err: null, info: '' };
  }
  static getDerivedStateFromError(err: Error) {
    return { err, info: '' };
  }
  componentDidCatch(err: Error, info: { componentStack?: string | null }) {
    // Surface in the console too (for when DevTools is open).
    console.error('[observatory] render crash:', err, info?.componentStack);
    this.setState({ err, info: info?.componentStack ?? '' });
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{
          fontFamily: '"SF Mono",ui-monospace,Menlo,monospace', background: '#04070f',
          color: '#e8f2fc', minHeight: '100vh', padding: '32px', lineHeight: 1.6,
        }}>
          <div style={{ color: '#e8453a', fontSize: '14px', letterSpacing: '.12em', marginBottom: 16 }}>
            ▰ OBSERVATORY RENDER ERROR
          </div>
          <div style={{ color: '#9df2ff', fontSize: '13px', marginBottom: 12 }}>
            {String(this.state.err?.message || this.state.err)}
          </div>
          <pre style={{
            color: '#6e87a3', fontSize: '11px', whiteSpace: 'pre-wrap',
            background: '#070b16', padding: '16px', borderRadius: 3, overflow: 'auto', maxHeight: '50vh',
          }}>{(this.state.err?.stack || '') + '\n' + this.state.info}</pre>
          <div style={{ color: '#42546b', fontSize: '11px', marginTop: 16 }}>
            Copy this to the operator. Backend: {(import.meta.env as Record<string, string>).VITE_OBSERVATORY_BASE || 'same-origin'}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const el = document.getElementById('root');
if (!el) throw new Error('observatory: #root element missing');

createRoot(el).render(
  <StrictMode>
    <RootBoundary>
      <ObservatoryPage />
    </RootBoundary>
  </StrictMode>,
);
