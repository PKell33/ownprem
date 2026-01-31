import { useState, forwardRef } from 'react';
import { authStyles } from '../types';

interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon: React.ReactNode;
  error?: string;
  errorId?: string;
  /** Mark the field as required for screen readers */
  'aria-required'?: boolean;
}

/**
 * Styled input field for auth forms with icon and error display.
 */
const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(
  ({ label, icon, error, errorId, id, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);

    const inputStyle = {
      ...authStyles.input,
      ...(isFocused ? authStyles.inputFocus : {}),
    };

    return (
      <div>
        <label
          htmlFor={id}
          className="block text-sm font-medium mb-2"
          style={{ color: '#c0caf5' }}
        >
          {label}
        </label>
        <div className="relative">
          <div
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
            style={{ color: '#565f89' }}
          >
            {icon}
          </div>
          <input
            ref={ref}
            id={id}
            style={inputStyle}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            {...props}
          />
        </div>
        {error && (
          <p id={errorId} role="alert" className="mt-1 text-sm" style={{ color: '#f43f5e' }}>
            {error}
          </p>
        )}
      </div>
    );
  }
);

AuthInput.displayName = 'AuthInput';

export default AuthInput;
