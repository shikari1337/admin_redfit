import { Component, ErrorInfo, ReactNode } from 'react';
import { isChunkLoadError, reloadForNewBuild } from '../lib/lazyRetry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  /** A new build was published under this tab; the page is reloading itself. */
  reloading: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      reloading: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // A chunk that no longer exists means the admin was redeployed while this
    // tab was open. That is not a fault to show — reload onto the new build.
    if (isChunkLoadError(error) && reloadForNewBuild()) {
      this.setState({ reloading: true, error, errorInfo });
      return;
    }
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  render() {
    if (this.state.hasError && this.state.reloading) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'var(--font, system-ui)', backgroundColor: 'var(--bg)', color: 'var(--ink-soft)' }}>
          <p style={{ fontSize: '14px' }}>A new version of the admin was just published — reloading…</p>
        </div>
      );
    }
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '20px',
          fontFamily: 'system-ui',
          backgroundColor: 'var(--n-100)'
        }}>
          <div style={{
            backgroundColor: 'var(--surface)',
            padding: '40px',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-2)',
            maxWidth: '600px',
            width: '100%'
          }}>
            <h1 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              color: 'var(--d-500)',
              marginBottom: '16px'
            }}>
              ⚠️ Application Error
            </h1>
            <p style={{
              color: 'var(--n-500)',
              marginBottom: '24px',
              lineHeight: '1.6'
            }}>
              The admin panel encountered an error while loading. Please check the console for details.
            </p>
            {this.state.error && (
              <div style={{
                backgroundColor: 'var(--d-50)',
                padding: '16px',
                borderRadius: '4px',
                marginBottom: '16px'
              }}>
                <p style={{
                  color: 'var(--d-600)',
                  fontWeight: '600',
                  marginBottom: '8px'
                }}>
                  Error: {this.state.error.message}
                </p>
                {this.state.errorInfo && (
                  <details style={{
                    marginTop: '12px',
                    fontSize: '12px',
                    color: 'var(--n-500)'
                  }}>
                    <summary style={{
                      cursor: 'pointer',
                      marginBottom: '8px',
                      color: 'var(--n-400)'
                    }}>
                      Stack Trace
                    </summary>
                    <pre style={{
                      backgroundColor: 'var(--n-800)',
                      color: 'var(--n-100)',
                      padding: '12px',
                      borderRadius: '4px',
                      overflow: 'auto',
                      maxHeight: '300px',
                      fontSize: '11px',
                      lineHeight: '1.5'
                    }}>
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}
            <button
              onClick={() => {
                this.setState({
                  hasError: false,
                  error: null,
                  errorInfo: null,
                });
                window.location.reload();
              }}
              style={{
                backgroundColor: 'var(--d-500)',
                color: 'var(--ink-inverse)',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

