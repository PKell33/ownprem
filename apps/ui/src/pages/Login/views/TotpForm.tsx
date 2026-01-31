import { useState } from 'react';
import { Shield } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { totpFormSchema, type TotpFormData } from '../../../lib/validation';
import { api } from '../../../api/client';
import { useAuthStore } from '../../../stores/useAuthStore';
import AuthButton from '../components/AuthButton';
import { authStyles, type StoredCredentials } from '../types';

interface TotpFormProps {
  credentials: StoredCredentials;
  onBack: () => void;
  onSuccess: (redirectTo: string, totpSetupRequired?: boolean) => void;
}

export default function TotpForm({ credentials, onBack, onSuccess }: TotpFormProps) {
  const { setAuthenticated, setError, setLoading, isLoading, clearError, setTotpSetupRequired } = useAuthStore();
  const [isFocused, setIsFocused] = useState(false);

  const form = useForm<TotpFormData>({
    resolver: zodResolver(totpFormSchema),
    mode: 'onChange',
    defaultValues: { code: '' },
  });

  const handleSubmit = async (data: TotpFormData) => {
    clearError();
    setLoading(true);

    try {
      const response = await api.loginWithTotp(
        credentials.username,
        credentials.password,
        data.code
      );
      setAuthenticated(response.user);
      if ('totpSetupRequired' in response && response.totpSetupRequired) {
        setTotpSetupRequired(true);
        onSuccess('/setup-2fa', true);
      } else {
        onSuccess('/', false);
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

  const inputStyle = {
    ...authStyles.input,
    ...(isFocused ? authStyles.inputFocus : {}),
    paddingLeft: '16px',
    textAlign: 'center' as const,
    fontSize: '20px',
    letterSpacing: '0.2em',
  };

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)}>
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
            {...form.register('code', {
              onChange: (e) => {
                e.target.value = e.target.value.replace(/\s/g, '');
              },
            })}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            style={inputStyle}
            placeholder="000000"
            autoComplete="one-time-code"
            autoFocus
            maxLength={10}
            aria-required="true"
            aria-invalid={!!form.formState.errors.code}
            aria-describedby={form.formState.errors.code ? 'totp-error' : undefined}
          />
          {form.formState.errors.code && (
            <p id="totp-error" role="alert" className="mt-1 text-sm" style={{ color: '#f43f5e' }}>
              {form.formState.errors.code.message}
            </p>
          )}
        </div>

        <AuthButton
          isLoading={isLoading}
          loadingText="Verifying..."
          disabled={!form.formState.isValid}
        >
          Verify
        </AuthButton>

        <button
          type="button"
          onClick={onBack}
          className="w-full py-2 text-sm hover:underline"
          style={{ color: '#565f89', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          Back to login
        </button>
      </div>
    </form>
  );
}
