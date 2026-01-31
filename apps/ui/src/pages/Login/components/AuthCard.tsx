import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { NodeNetwork } from '../../../components/NodeNetwork';
import { authStyles } from '../types';

interface AuthCardProps {
  children: React.ReactNode;
  tagline: string;
  error?: string | null;
}

/**
 * Shared authentication card wrapper with animated background.
 */
export default function AuthCard({ children, tagline, error }: AuthCardProps) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Animated node network background */}
      <NodeNetwork />

      {/* Login card */}
      <div style={authStyles.card} className="relative z-10">
        {/* Logo */}
        <div className="text-center mb-2">
          <h1 className="text-4xl font-bold tracking-tight" style={{ color: '#c0caf5' }}>
            <span style={{ fontFamily: 'system-ui' }}>&#x232C;</span>
            <span style={{ color: '#7aa2f7' }}>w</span>
            <span>nPrem</span>
          </h1>
        </div>

        {/* Tagline */}
        <p className="text-center mb-8" style={{ color: '#565f89', fontSize: '14px' }}>
          {tagline}
        </p>

        {/* Error display - form-level errors announced by screen readers */}
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
