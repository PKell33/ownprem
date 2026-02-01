import { useState } from 'react';
import { Package } from 'lucide-react';

interface AppIconProps {
  appName: string;
  size?: number;
  className?: string;
}

export default function AppIcon({ appName, size = 24, className = '' }: AppIconProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return <Package size={size} className={className} />;
  }

  return (
    <img
      src={`/api/apps/${appName}/icon`}
      alt={`${appName} icon`}
      width={size}
      height={size}
      className={className}
      onError={() => setHasError(true)}
    />
  );
}
