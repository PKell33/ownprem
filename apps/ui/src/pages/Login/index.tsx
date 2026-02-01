import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';
import { api } from '../../api/client';
import AuthCard from './components/AuthCard';
import LoginForm from './views/LoginForm';
import SetupForm from './views/SetupForm';
import type { AuthView } from './types';

/**
 * Login page with splash animation.
 * Starts with logo + login button, then reveals the auth card.
 */
export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { error, clearError } = useAuthStore();

  const [view, setView] = useState<AuthView>('login');
  const [checking, setChecking] = useState(true);
  const [showCard, setShowCard] = useState(false);

  // Check if setup is needed on mount
  useEffect(() => {
    api.checkSetup()
      .then(({ needsSetup }) => {
        if (needsSetup) {
          setView('setup');
        }
      })
      .catch(() => {
        // Ignore errors, default to login view
      })
      .finally(() => {
        setChecking(false);
      });
  }, []);

  // Get redirect destination from location state
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  // Handle successful authentication
  const handleSuccess = useCallback((redirectTo: string) => {
    navigate(redirectTo || from, { replace: true });
  }, [navigate, from]);

  // Handle setup requirement (no admin account exists)
  const handleSetupRequired = useCallback(() => {
    setView('setup');
  }, []);

  // Handle back from setup view
  const handleBackToLogin = useCallback(() => {
    setView('login');
    clearError();
  }, [clearError]);

  // Show the login card
  const handleShowCard = useCallback(() => {
    setShowCard(true);
  }, []);

  // Determine tagline based on view
  const taglines: Record<AuthView, string> = {
    login: 'Orchestrate Everything',
    setup: 'Create Admin Account',
  };

  return (
    <AuthCard
      tagline={taglines[view]}
      error={error}
      showCard={showCard}
      onShowCard={handleShowCard}
    >
      {checking ? (
        <div className="h-32" />
      ) : view === 'login' ? (
        <LoginForm
          onSetupRequired={handleSetupRequired}
          onSuccess={handleSuccess}
        />
      ) : (
        <SetupForm
          onBack={handleBackToLogin}
          onSuccess={handleSuccess}
        />
      )}
    </AuthCard>
  );
}

export default Login;
