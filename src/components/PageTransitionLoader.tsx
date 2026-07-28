import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Slim, non-blocking route-transition indicator.
 *
 * The previous version covered the ENTIRE app with a white "Loading…" overlay
 * for 300ms on every navigation — every click flashed the whole screen, which
 * made the panel feel broken. This is the standard alternative: a 2px progress
 * bar fixed to the top edge, pointer-events-none, content stays visible and
 * interactive throughout. Skips the very first mount (no flash on app load).
 */
const PageTransitionLoader: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const location = useLocation();
  const firstMount = useRef(true);

  useEffect(() => {
    if (firstMount.current) { firstMount.current = false; return; }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 450);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-0.5 overflow-hidden">
      <div
        className="h-full bg-primary"
        style={{ animation: 'route-progress 450ms ease-out forwards' }}
      />
      <style>{`@keyframes route-progress { from { width: 0%; opacity: 1; } 80% { width: 85%; } to { width: 100%; opacity: 0; } }`}</style>
    </div>
  );
};

export default PageTransitionLoader;
