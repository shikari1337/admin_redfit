import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found. Make sure there is a div with id="root" in your HTML.');
}

try {
  console.log('🚀 Admin Panel: Starting to render...');
  console.log('📦 React version:', React.version);
  console.log('🔍 Root element found:', rootElement);
  
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
  
  console.log('✅ Admin Panel: Successfully rendered!');
} catch (error) {
  console.error('❌ Failed to render app:', error);
  rootElement.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; font-family: system-ui; background-color: #f3f4f6;">
      <div style="background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); max-width: 600px; width: 100%;">
        <h1 style="font-size: 24px; font-weight: bold; color: #ef4444; margin-bottom: 16px;">⚠️ Failed to Load Admin Panel</h1>
        <p style="color: #6b7280; margin-bottom: 24px; line-height: 1.6;">The admin panel failed to initialize. Please check the browser console for errors.</p>
        <p style="color: #9ca3af; font-size: 14px; margin-bottom: 16px;">Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
        <button onclick="window.location.reload()" style="background-color: #ef4444; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 16px; font-weight: 600; cursor: pointer; width: 100%;">Reload Page</button>
      </div>
    </div>
  `;
}

