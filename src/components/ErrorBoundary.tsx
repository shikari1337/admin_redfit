import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  render() {
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

