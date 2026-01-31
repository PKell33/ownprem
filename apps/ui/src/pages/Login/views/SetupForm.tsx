import { Lock, User } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { setupFormSchema, type SetupFormData } from '../../../lib/validation';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/useAuthStore';
import AuthInput from '../components/AuthInput';
import AuthButton from '../components/AuthButton';
import type { StoredCredentials } from '../types';

interface SetupFormProps {
  onTotpRequired: (credentials: StoredCredentials) => void;
  onSuccess: (redirectTo: string, totpSetupRequired?: boolean) => void;
}

export default function SetupForm({ onTotpRequired, onSuccess }: SetupFormProps) {
  const { setAuthenticated, setError, setLoading, isLoading, clearError, setTotpSetupRequired } = useAuthStore();

  const form = useForm<SetupFormData>({
    resolver: zodResolver(setupFormSchema),
    mode: 'onBlur',
    defaultValues: { username: '', password: '', confirmPassword: '' },
  });

  const handleSubmit = async (data: SetupFormData) => {
    clearError();
    setLoading(true);

    try {
      await api.setup(data.username, data.password);
      const response = await api.login(data.username, data.password);
      if ('totpRequired' in response && response.totpRequired) {
        onTotpRequired({ username: data.username, password: data.password });
      } else if (response.user) {
        setAuthenticated(response.user);
        if ('totpSetupRequired' in response && response.totpSetupRequired) {
          setTotpSetupRequired(true);
          onSuccess('/setup-2fa', true);
        } else {
          onSuccess('/', false);
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

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)}>
      <div className="space-y-5">
        <AuthInput
          id="setup-username"
          label="Username"
          icon={<User className="w-5 h-5" aria-hidden="true" />}
          placeholder="Enter username"
          autoComplete="username"
          autoFocus
          aria-required={true}
          error={form.formState.errors.username?.message}
          errorId="setup-username-error"
          {...form.register('username')}
        />

        <AuthInput
          id="setup-password"
          label="Password"
          icon={<Lock className="w-5 h-5" aria-hidden="true" />}
          type="password"
          placeholder="Enter password"
          autoComplete="new-password"
          aria-required={true}
          error={form.formState.errors.password?.message}
          errorId="setup-password-error"
          {...form.register('password')}
        />

        <AuthInput
          id="setup-confirmPassword"
          label="Confirm Password"
          icon={<Lock className="w-5 h-5" aria-hidden="true" />}
          type="password"
          placeholder="Confirm password"
          autoComplete="new-password"
          aria-required={true}
          error={form.formState.errors.confirmPassword?.message}
          errorId="setup-confirm-error"
          {...form.register('confirmPassword')}
        />

        <AuthButton isLoading={isLoading} loadingText="Creating Account...">
          Create Account
        </AuthButton>

        <p className="text-center text-sm" style={{ color: '#565f89' }}>
          This will create the initial admin account for OwnPrem.
        </p>
      </div>
    </form>
  );
}
