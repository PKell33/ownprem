import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { authStyles } from '../types';

interface AuthButtonProps {
  children: React.ReactNode;
  loadingText?: string;
  isLoading?: boolean;
  disabled?: boolean;
  type?: 'submit' | 'button';
  onClick?: () => void;
}

/**
 * Styled button for auth forms with loading state.
 */
export default function AuthButton({
  children,
  loadingText = 'Loading...',
  isLoading = false,
  disabled = false,
  type = 'submit',
  onClick,
}: AuthButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  const buttonStyle = {
    ...authStyles.button,
    ...(isHovered && !isLoading && !disabled ? authStyles.buttonHover : {}),
    ...(isLoading || disabled ? authStyles.buttonDisabled : {}),
  };

  return (
    <button
      type={type}
      disabled={isLoading || disabled}
      style={buttonStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}
