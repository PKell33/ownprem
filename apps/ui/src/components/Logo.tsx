interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  glow?: boolean;
}

const sizeClasses = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-4xl',
  xl: 'text-6xl',
  '2xl': 'text-7xl',
};

/**
 * OwnPrem logo component.
 * Uses ⌬ (benzene ring symbol) as the "O" with accent-colored "w".
 */
export function Logo({ size = 'lg', className = '', glow = false }: LogoProps) {
  const glowStyle = glow ? {
    textShadow: '0 0 20px rgba(122, 162, 247, 0.5), 0 0 40px rgba(122, 162, 247, 0.3)',
  } : {};

  return (
    <span
      className={`font-bold tracking-tight ${sizeClasses[size]} ${className}`}
      style={{ color: '#c0caf5', ...glowStyle }}
    >
      <span style={{ fontFamily: 'system-ui' }}>&#x232C;</span>
      <span style={{ color: '#7aa2f7' }}>w</span>
      <span>nPrem</span>
    </span>
  );
}

export default Logo;
