import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';
import AuthCard from './components/AuthCard';
import LoginForm from './views/LoginForm';
import SetupForm from './views/SetupForm';
import TotpForm from './views/TotpForm';
import type { AuthView, StoredCredentials } from './types';

/**
 * Login page with state machine for different auth views.
 * Views: login (default) → setup (if no users) → totp (if 2FA required)
 */
export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { error, clearError } = useAuthStore();

  const [view, setView] = useState<AuthView>('login');
  const [storedCredentials, setStoredCredentials] = useState<StoredCredentials | null>(null);

  // Get redirect destination from location state
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  // Handle successful authentication
  const handleSuccess = useCallback((redirectTo: string) => {
    navigate(redirectTo || from, { replace: true });
  }, [navigate, from]);

  // Handle TOTP requirement - store credentials and switch view
  const handleTotpRequired = useCallback((credentials: StoredCredentials) => {
    setStoredCredentials(credentials);
    setView('totp');
  }, []);

  // Handle setup requirement (no admin account exists)
  const handleSetupRequired = useCallback(() => {
    setView('setup');
  }, []);

  // Handle back from TOTP view
  const handleBackToLogin = useCallback(() => {
    setStoredCredentials(null);
    setView('login');
    clearError();
  }, [clearError]);

  // Determine tagline based on view
  const taglines: Record<AuthView, string> = {
    login: 'Orchestrate Everything',
    setup: 'Create Admin Account',
    totp: 'Enter verification code',
  };

  return (
    <AuthCard tagline={taglines[view]} error={error}>
      {view === 'login' && (
        <LoginForm
          onTotpRequired={handleTotpRequired}
          onSetupRequired={handleSetupRequired}
          onSuccess={handleSuccess}
        />
      )}

      {view === 'setup' && (
        <SetupForm
          onTotpRequired={handleTotpRequired}
          onSuccess={handleSuccess}
        />
      )}

      {view === 'totp' && storedCredentials && (
        <TotpForm
          credentials={storedCredentials}
          onBack={handleBackToLogin}
          onSuccess={handleSuccess}
        />
      )}
    </AuthCard>
  );
}

export default Login;
