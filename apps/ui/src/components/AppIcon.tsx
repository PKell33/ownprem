import { Package } from 'lucide-react';

interface AppIconProps {
  appName: string;
  size?: number;
  className?: string;
}

// Map of app names to their icon files
// Using official icons from Start9 where available
const appIcons: Record<string, string> = {
  'bitcoin-core': '/icons/bitcoin-core.svg',
  'bitcoin-knots': '/icons/bitcoin-knots.png',
  'bitcoin-bip110': '/icons/bitcoin-bip110.png',
  'electrs': '/icons/electrs.png',
  'mempool': '/icons/mempool.png',
};

export default function AppIcon({ appName, size = 24, className = '' }: AppIconProps) {
  const iconPath = appIcons[appName];

  if (iconPath) {
    return (
      <img
        src={iconPath}
        alt={`${appName} icon`}
        width={size}
        height={size}
        className={className}
      />
    );
  }

  // Fallback to generic package icon
  return <Package size={size} className={className} />;
}
