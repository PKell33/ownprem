import { Package } from 'lucide-react';

interface AppIconProps {
  appName: string;
  size?: number;
  className?: string;
}

// Map of app names to their icon files
// Apps can provide custom icons in /public/icons/
const appIcons: Record<string, string> = {
  // Add custom app icons here as needed
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
