import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, LogIn } from 'lucide-react';
import { NodeNetwork } from '../../../components/NodeNetwork';
import { authStyles } from '../types';

interface AuthCardProps {
  children: React.ReactNode;
  tagline: string;
  error?: string | null;
  showCard: boolean;
  onShowCard: () => void;
}

/**
 * Login screen with animated background.
 * Starts in splash mode with logo + login button, then reveals the card.
 */
export default function AuthCard({ children, tagline, error, showCard, onShowCard }: AuthCardProps) {
  const logoRef = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | undefined>();
  const [showButton, setShowButton] = useState(false);

  // Get the center of the logo for node origin
  useEffect(() => {
    const updateOrigin = () => {
      if (logoRef.current) {
        const rect = logoRef.current.getBoundingClientRect();
        setOrigin({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
      }
    };

    const timeout = setTimeout(updateOrigin, 50);
    window.addEventListener('resize', updateOrigin);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', updateOrigin);
    };
  }, []);

  // Show login button after nodes have dispersed
  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowButton(true);
    }, 1500);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Animated node network background */}
      {origin ? (
        <NodeNetwork origin={origin} expansionSpeed={0.15} />
      ) : (
        <div className="fixed inset-0" style={{ backgroundColor: '#0a0a0f' }} />
      )}

      {/* Splash mode: Logo + Login button */}
      {!showCard && (
        <>
          {/* Large centered logo */}
          <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-10">
            <div
              ref={logoRef}
              className="text-8xl md:text-9xl font-bold tracking-tight"
              style={{
                color: '#c0caf5',
                textShadow: '0 0 30px rgba(122, 162, 247, 0.5), 0 0 60px rgba(122, 162, 247, 0.3)',
              }}
            >
              <span style={{ fontFamily: 'system-ui' }}>&#x232C;</span>
              <span style={{ color: '#7aa2f7' }}>w</span>
              <span>nPrem</span>
            </div>
          </div>

          {/* Login button */}
          <div
            className={`fixed inset-0 flex items-center justify-center pointer-events-none z-10 transition-opacity duration-700 ${showButton ? 'opacity-100' : 'opacity-0'}`}
            style={{ paddingTop: '200px' }}
          >
            <button
              onClick={onShowCard}
              disabled={!showButton}
              className="pointer-events-auto flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all duration-300 hover:scale-105"
              style={{
                backgroundColor: 'rgba(122, 162, 247, 0.15)',
                border: '1px solid rgba(122, 162, 247, 0.3)',
                color: '#c0caf5',
              }}
            >
              <LogIn size={20} />
              <span>Login</span>
            </button>
          </div>
        </>
      )}

      {/* Login card */}
      <div
        className={`relative z-10 transition-all duration-500 ${showCard ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
        style={authStyles.card}
      >
        {/* Logo */}
        <h1 className="text-center mb-2">
          <span
            className="text-4xl font-bold tracking-tight"
            style={{ color: '#c0caf5' }}
          >
            <span style={{ fontFamily: 'system-ui' }}>&#x232C;</span>
            <span style={{ color: '#7aa2f7' }}>w</span>
            <span>nPrem</span>
          </span>
        </h1>

        {/* Tagline */}
        <p className="text-center mb-8" style={{ color: '#565f89', fontSize: '14px' }}>
          {tagline}
        </p>

        {/* Error display */}
        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-6 p-4 rounded-lg flex items-start gap-3"
            style={{
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.3)'
            }}
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#f43f5e' }} aria-hidden="true" />
            <p className="text-sm" style={{ color: '#fda4af' }}>{error}</p>
          </div>
        )}

        {children}

        {/* Footer links */}
        <div className="mt-8 pt-6" style={{ borderTop: '1px solid rgba(122, 162, 247, 0.1)' }}>
          <p className="text-center text-sm" style={{ color: '#565f89' }}>
            Self-Hosted App Platform
          </p>
          <p className="mt-2 text-center">
            <Link
              to="/certificate"
              className="text-sm hover:underline"
              style={{ color: '#7aa2f7' }}
            >
              Certificate setup
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
