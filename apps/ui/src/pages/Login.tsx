import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, User, AlertCircle, Loader2, Sun, Moon } from 'lucide-react';
import { api } from '../api/client';
import { useAuthStore } from '../stores/useAuthStore';
import { useThemeStore } from '../stores/useThemeStore';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setTokens, setUser, setError, setLoading, error, isLoading, clearError } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSetup, setIsSetup] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (isSetup && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = isSetup
        ? await api.setup(username, password)
        : await api.login(username, password);

      setTokens(response.accessToken, response.refreshToken);
      setUser(response.user);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof Error) {
        // Check if this is a "no users" error - switch to setup mode
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

  return (
    <div className="min-h-screen flex items-center justify-center px-4 dark:bg-gray-900 light:bg-gray-100">
      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-lg transition-colors
          dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800
          light:text-gray-500 light:hover:text-gray-900 light:hover:bg-gray-200"
      >
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">
            <span className="text-bitcoin">N</span>odefoundry
          </h1>
          <p className="dark:text-gray-400 light:text-gray-500">
            {isSetup ? 'Create Admin Account' : 'Sign in to your account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 md:p-8 shadow-xl">
          {error && (
            <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-medium dark:text-gray-300 light:text-gray-700 mb-2">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 dark:text-gray-500 light:text-gray-400" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input-field pl-10"
                  placeholder="Enter username"
                  required
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium dark:text-gray-300 light:text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 dark:text-gray-500 light:text-gray-400" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-10"
                  placeholder="Enter password"
                  required
                  autoComplete={isSetup ? 'new-password' : 'current-password'}
                />
              </div>
            </div>

            {isSetup && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium dark:text-gray-300 light:text-gray-700 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 dark:text-gray-500 light:text-gray-400" />
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field pl-10"
                    placeholder="Confirm password"
                    required
                    autoComplete="new-password"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-6 w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {isSetup ? 'Creating Account...' : 'Signing in...'}
              </>
            ) : (
              isSetup ? 'Create Account' : 'Sign In'
            )}
          </button>

          {isSetup && (
            <p className="mt-4 text-center text-sm dark:text-gray-400 light:text-gray-500">
              This will create the initial admin account for NodeFoundry.
            </p>
          )}
        </form>

        <p className="mt-6 text-center text-sm dark:text-gray-500 light:text-gray-400">
          Sovereign Bitcoin Infrastructure
        </p>
      </div>
    </div>
  );
}
