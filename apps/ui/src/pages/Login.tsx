import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Lock, User, AlertCircle, Loader2, Shield } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '../api/client';
import { useAuthStore } from '../stores/useAuthStore';
import { NodeNetwork } from '../components/NodeNetwork';
import {
  loginFormSchema,
  setupFormSchema,
  totpFormSchema,
  type LoginFormData,
  type SetupFormData,
  type TotpFormData,
} from '../lib/validation';

// Tokyo Night color palette
const styles = {
  card: {
    background: 'rgba(26, 27, 38, 0.8)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '20px',
    border: '1px solid rgba(122, 162, 247, 0.2)',
    padding: '48px',
    maxWidth: '400px',
    width: '100%',
  },
  input: {
    background: 'rgba(15, 15, 23, 0.6)',
    border: '1px solid #292e42',
    borderRadius: '10px',
    color: '#c0caf5',
    padding: '12px 16px',
    paddingLeft: '44px',
    width: '100%',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  inputFocus: {
    borderColor: '#7aa2f7',
    boxShadow: '0 0 0 2px rgba(122, 162, 247, 0.2)',
  },
  button: {
    background: 'linear-gradient(135deg, #7aa2f7 0%, #5a82d4 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: '14px 24px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  buttonHover: {
    transform: 'translateY(-1px)',
    boxShadow: '0 4px 20px rgba(122, 162, 247, 0.4)',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
    transform: 'none',
  },
};

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuthenticated, setError, setLoading, error, isLoading, clearError, setTotpSetupRequired } = useAuthStore();

  const [isSetup, setIsSetup] = useState(false);
  const [totpRequired, setTotpRequired] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [isButtonHovered, setIsButtonHovered] = useState(false);
  // Store credentials for TOTP step
  const [storedCredentials, setStoredCredentials] = useState<{ username: string; password: string } | null>(null);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  // Login form (less strict validation - server validates credentials)
  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginFormSchema),
    mode: 'onBlur',
    defaultValues: { username: '', password: '' },
  });

  // Setup form (stricter validation for new account)
  const setupForm = useForm<SetupFormData>({
    resolver: zodResolver(setupFormSchema),
    mode: 'onBlur',
    defaultValues: { username: '', password: '', confirmPassword: '' },
  });

  // TOTP form
  const totpForm = useForm<TotpFormData>({
    resolver: zodResolver(totpFormSchema),
    mode: 'onChange',
    defaultValues: { code: '' },
  });

  const handleLoginSubmit = async (data: LoginFormData) => {
    clearError();
    setLoading(true);

    try {
      const response = await api.login(data.username, data.password);
      if ('totpRequired' in response && response.totpRequired) {
        // Store credentials for TOTP step
        setStoredCredentials({ username: data.username, password: data.password });
        setTotpRequired(true);
      } else if (response.user) {
        setAuthenticated(response.user);
        if ('totpSetupRequired' in response && response.totpSetupRequired) {
          setTotpSetupRequired(true);
          navigate('/setup-2fa', { replace: true });
        } else {
          navigate(from, { replace: true });
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('No users exist') || err.message.includes('setup')) {
          setIsSetup(true);
          setError('No admin account exists. Please create one.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSetupSubmit = async (data: SetupFormData) => {
    clearError();
    setLoading(true);

    try {
      await api.setup(data.username, data.password);
      const response = await api.login(data.username, data.password);
      if ('totpRequired' in response && response.totpRequired) {
        setStoredCredentials({ username: data.username, password: data.password });
        setTotpRequired(true);
      } else if (response.user) {
        setAuthenticated(response.user);
        if ('totpSetupRequired' in response && response.totpSetupRequired) {
          setTotpSetupRequired(true);
          navigate('/setup-2fa', { replace: true });
        } else {
          navigate(from, { replace: true });
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Setup failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSubmit = async (data: TotpFormData) => {
    if (!storedCredentials) {
      setError('Session expired. Please log in again.');
      setTotpRequired(false);
      return;
    }

    clearError();
    setLoading(true);

    try {
      const response = await api.loginWithTotp(
        storedCredentials.username,
        storedCredentials.password,
        data.code
      );
      setAuthenticated(response.user);
      setStoredCredentials(null);
      if ('totpSetupRequired' in response && response.totpSetupRequired) {
        setTotpSetupRequired(true);
        navigate('/setup-2fa', { replace: true });
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Verification failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setTotpRequired(false);
    setStoredCredentials(null);
    totpForm.reset();
    clearError();
  };

  const getInputStyle = (fieldName: string) => ({
    ...styles.input,
    ...(focusedField === fieldName ? styles.inputFocus : {}),
  });

  const getButtonStyle = () => ({
    ...styles.button,
    ...(isButtonHovered && !isLoading ? styles.buttonHover : {}),
    ...(isLoading ? styles.buttonDisabled : {}),
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Animated node network background */}
      <NodeNetwork />

      {/* Login card */}
      <div style={styles.card} className="relative z-10">
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
          {totpRequired
            ? 'Enter verification code'
            : isSetup
              ? 'Create Admin Account'
              : 'Orchestrate Everything'}
        </p>

        {/* Error display */}
        {error && (
          <div
            className="mb-6 p-4 rounded-lg flex items-start gap-3"
            style={{
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.3)'
            }}
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#f43f5e' }} />
            <p className="text-sm" style={{ color: '#fda4af' }}>{error}</p>
          </div>
        )}

        {totpRequired ? (
          // TOTP verification step
          <form onSubmit={totpForm.handleSubmit(handleTotpSubmit)}>
            <div className="space-y-5">
              <div className="text-center mb-4">
                <div
                  className="w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3"
                  style={{ background: 'rgba(122, 162, 247, 0.2)' }}
                >
                  <Shield className="w-6 h-6" style={{ color: '#7aa2f7' }} />
                </div>
                <p className="text-sm" style={{ color: '#565f89' }}>
                  Enter the 6-digit code from your authenticator app, or use a backup code.
                </p>
              </div>

              <div>
                <label
                  htmlFor="totpCode"
                  className="block text-sm font-medium mb-2"
                  style={{ color: '#c0caf5' }}
                >
                  Verification Code
                </label>
                <input
                  id="totpCode"
                  type="text"
                  {...totpForm.register('code', {
                    onChange: (e) => {
                      e.target.value = e.target.value.replace(/\s/g, '');
                    },
                  })}
                  onFocus={() => setFocusedField('totp')}
                  onBlur={() => setFocusedField(null)}
                  style={{
                    ...getInputStyle('totp'),
                    paddingLeft: '16px',
                    textAlign: 'center',
                    fontSize: '20px',
                    letterSpacing: '0.2em'
                  }}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={10}
                  aria-invalid={!!totpForm.formState.errors.code}
                  aria-describedby={totpForm.formState.errors.code ? 'totp-error' : undefined}
                />
                {totpForm.formState.errors.code && (
                  <p id="totp-error" className="mt-1 text-sm" style={{ color: '#f43f5e' }}>
                    {totpForm.formState.errors.code.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading || !totpForm.formState.isValid}
                style={getButtonStyle()}
                onMouseEnter={() => setIsButtonHovered(true)}
                onMouseLeave={() => setIsButtonHovered(false)}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify'
                )}
              </button>

              <button
                type="button"
                onClick={handleBackToLogin}
                className="w-full py-2 text-sm hover:underline"
                style={{ color: '#565f89', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                Back to login
              </button>
            </div>
          </form>
        ) : isSetup ? (
          // Setup form (create admin account)
          <form onSubmit={setupForm.handleSubmit(handleSetupSubmit)}>
            <div className="space-y-5">
              <div>
                <label
                  htmlFor="setup-username"
                  className="block text-sm font-medium mb-2"
                  style={{ color: '#c0caf5' }}
                >
                  Username
                </label>
                <div className="relative">
                  <User
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                    style={{ color: '#565f89' }}
                  />
                  <input
                    id="setup-username"
                    type="text"
                    {...setupForm.register('username')}
                    onFocus={() => setFocusedField('username')}
                    onBlur={() => setFocusedField(null)}
                    style={getInputStyle('username')}
                    placeholder="Enter username"
                    autoComplete="username"
                    autoFocus
                    aria-invalid={!!setupForm.formState.errors.username}
                    aria-describedby={setupForm.formState.errors.username ? 'setup-username-error' : undefined}
                  />
                </div>
                {setupForm.formState.errors.username && (
                  <p id="setup-username-error" className="mt-1 text-sm" style={{ color: '#f43f5e' }}>
                    {setupForm.formState.errors.username.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="setup-password"
                  className="block text-sm font-medium mb-2"
                  style={{ color: '#c0caf5' }}
                >
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                    style={{ color: '#565f89' }}
                  />
                  <input
                    id="setup-password"
                    type="password"
                    {...setupForm.register('password')}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    style={getInputStyle('password')}
                    placeholder="Enter password"
                    autoComplete="new-password"
                    aria-invalid={!!setupForm.formState.errors.password}
                    aria-describedby={setupForm.formState.errors.password ? 'setup-password-error' : undefined}
                  />
                </div>
                {setupForm.formState.errors.password && (
                  <p id="setup-password-error" className="mt-1 text-sm" style={{ color: '#f43f5e' }}>
                    {setupForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="setup-confirmPassword"
                  className="block text-sm font-medium mb-2"
                  style={{ color: '#c0caf5' }}
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                    style={{ color: '#565f89' }}
                  />
                  <input
                    id="setup-confirmPassword"
                    type="password"
                    {...setupForm.register('confirmPassword')}
                    onFocus={() => setFocusedField('confirmPassword')}
                    onBlur={() => setFocusedField(null)}
                    style={getInputStyle('confirmPassword')}
                    placeholder="Confirm password"
                    autoComplete="new-password"
                    aria-invalid={!!setupForm.formState.errors.confirmPassword}
                    aria-describedby={setupForm.formState.errors.confirmPassword ? 'setup-confirm-error' : undefined}
                  />
                </div>
                {setupForm.formState.errors.confirmPassword && (
                  <p id="setup-confirm-error" className="mt-1 text-sm" style={{ color: '#f43f5e' }}>
                    {setupForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                style={getButtonStyle()}
                onMouseEnter={() => setIsButtonHovered(true)}
                onMouseLeave={() => setIsButtonHovered(false)}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  'Create Account'
                )}
              </button>

              <p className="text-center text-sm" style={{ color: '#565f89' }}>
                This will create the initial admin account for OwnPrem.
              </p>
            </div>
          </form>
        ) : (
          // Login form
          <form onSubmit={loginForm.handleSubmit(handleLoginSubmit)}>
            <div className="space-y-5">
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-sm font-medium mb-2"
                  style={{ color: '#c0caf5' }}
                >
                  Username
                </label>
                <div className="relative">
                  <User
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                    style={{ color: '#565f89' }}
                  />
                  <input
                    id="login-username"
                    type="text"
                    {...loginForm.register('username')}
                    onFocus={() => setFocusedField('username')}
                    onBlur={() => setFocusedField(null)}
                    style={getInputStyle('username')}
                    placeholder="Enter username"
                    autoComplete="username"
                    autoFocus
                    aria-invalid={!!loginForm.formState.errors.username}
                    aria-describedby={loginForm.formState.errors.username ? 'login-username-error' : undefined}
                  />
                </div>
                {loginForm.formState.errors.username && (
                  <p id="login-username-error" className="mt-1 text-sm" style={{ color: '#f43f5e' }}>
                    {loginForm.formState.errors.username.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium mb-2"
                  style={{ color: '#c0caf5' }}
                >
                  Password
                </label>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                    style={{ color: '#565f89' }}
                  />
                  <input
                    id="login-password"
                    type="password"
                    {...loginForm.register('password')}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    style={getInputStyle('password')}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    aria-invalid={!!loginForm.formState.errors.password}
                    aria-describedby={loginForm.formState.errors.password ? 'login-password-error' : undefined}
                  />
                </div>
                {loginForm.formState.errors.password && (
                  <p id="login-password-error" className="mt-1 text-sm" style={{ color: '#f43f5e' }}>
                    {loginForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                style={getButtonStyle()}
                onMouseEnter={() => setIsButtonHovered(true)}
                onMouseLeave={() => setIsButtonHovered(false)}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </div>
          </form>
        )}

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
