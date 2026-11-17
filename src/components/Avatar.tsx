import React, { useState } from 'react';
import { Users } from 'lucide-react';
import { getInitials } from '../lib/imageUtils';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isGroup?: boolean;
  isOnline?: boolean;
  showPresence?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-20 h-20 text-xl',
};

const PALETTES = [
  'bg-teal-700 text-white',
  'bg-sky-700 text-white',
  'bg-amber-700 text-white',
  'bg-indigo-700 text-white',
  'bg-rose-700 text-white',
  'bg-emerald-700 text-white',
];

function pickColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTES[Math.abs(hash) % PALETTES.length];
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  isGroup = false,
  isOnline = false,
  showPresence = false,
}) => {
  const [imgError, setImgError] = useState(false);
  const hasImage = Boolean(src && src.trim().length > 0 && !imgError);

  return (
    <div className="relative inline-flex shrink-0 select-none">
      {hasImage ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`${SIZE_CLASSES[size]} rounded-full object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800`}
        />
      ) : (
        <div
          aria-label={name}
          className={`${SIZE_CLASSES[size]} ${pickColor(
            name
          )} rounded-full flex items-center justify-center font-semibold tracking-tight`}
        >
          {isGroup ? <Users className="w-1/2 h-1/2" /> : getInitials(name)}
        </div>
      )}

      {showPresence && isOnline && (
        <span
          title="Online"
          aria-label="Online"
          className="absolute bottom-0 right-0 block w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"
        />
      )}
    </div>
  );
};
