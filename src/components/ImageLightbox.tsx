import React from 'react';
import { Download, EyeOff, X } from 'lucide-react';

interface ImageLightboxProps {
  imageUrl: string;
  caption?: string;
  viewOnce?: boolean;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  imageUrl,
  caption,
  viewOnce = false,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/92 backdrop-blur-sm flex flex-col select-none"
      onClick={onClose}
      onContextMenu={(e) => {
        if (viewOnce) e.preventDefault();
      }}
    >
      <div
        className="px-4 py-3 flex items-center justify-between text-white shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex items-center gap-2 max-w-[75%]">
          {viewOnce && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500/20 border border-teal-400/40 text-teal-300 text-[11px] font-semibold shrink-0">
              <EyeOff className="w-3 h-3" />
              <span>View once</span>
            </span>
          )}
          <p className="text-sm font-medium truncate">
            {caption || (viewOnce ? 'Closes after viewing' : 'Shared Photo')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!viewOnce && (
            <a
              href={imageUrl}
              download={`sanvad-photo-${Date.now()}.jpg`}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
              title="Download photo"
              aria-label="Download photo"
            >
              <Download className="w-5 h-5" />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
            aria-label="Close photo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <img
          src={imageUrl}
          alt={caption || 'Full photo'}
          draggable={!viewOnce}
          onClick={(e) => e.stopPropagation()}
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      </div>
    </div>
  );
};
