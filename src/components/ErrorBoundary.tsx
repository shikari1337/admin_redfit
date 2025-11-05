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
          backgroundColor: '#f3f4f6'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '40px',
            borderRadius: '8px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            maxWidth: '600px',
            width: '100%'
          }}>
            <h1 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              color: '#ef4444',
              marginBottom: '16px'
            }}>
              ⚠️ Application Error
            </h1>
            <p style={{
              color: '#6b7280',
              marginBottom: '24px',
              lineHeight: '1.6'
            }}>
              The admin panel encountered an error while loading. Please check the console for details.
            </p>
            {this.state.error && (
              <div style={{
                backgroundColor: '#fef2f2',
                padding: '16px',
                borderRadius: '4px',
                marginBottom: '16px'
              }}>
                <p style={{
                  color: '#dc2626',
                  fontWeight: '600',
                  marginBottom: '8px'
                }}>
                  Error: {this.state.error.message}
                </p>
                {this.state.errorInfo && (
                  <details style={{
                    marginTop: '12px',
                    fontSize: '12px',
                    color: '#6b7280'
                  }}>
                    <summary style={{
                      cursor: 'pointer',
                      marginBottom: '8px',
                      color: '#9ca3af'
                    }}>
                      Stack Trace
                    </summary>
                    <pre style={{
                      backgroundColor: '#1f2937',
                      color: '#f3f4f6',
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
                backgroundColor: '#ef4444',
                color: 'white',
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

