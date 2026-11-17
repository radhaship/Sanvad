import React, { useEffect, useRef, useState } from 'react';
import { Check, Crop, RotateCcw, Sparkles, Sticker, Type, X, ZoomIn } from 'lucide-react';
import { LIMITS } from '../lib/validation';

type CropMode = 'original' | 'square' | 'sticker' | 'circle';
type TextSizeMode = 'sm' | 'md' | 'lg';

interface MemeStickerEditorModalProps {
  imageSrc: string;
  onApply: (editedDataUrl: string) => void;
  onClose: () => void;
}

const MEME_PRESETS = [
  'WAIT FOR IT 😂',
  'PLAN CANCEL 😭',
  'ASLI ID SE AAO',
  'CHAI TIME ☕',
  'BRO TRUST ME',
  'SCENE SET HAI 🔥',
];

const TEXT_COLORS = [
  { id: '#ffffff', label: 'White' },
  { id: '#fde047', label: 'Yellow' },
  { id: '#22d3ee', label: 'Cyan' },
  { id: '#fb7185', label: 'Rose' },
];

const STAMP_EMOJIS = ['', '😂', '🔥', '💀', '🤡', '❤️', '😎'];

function drawWrappedCaption(
  ctx: CanvasRenderingContext2D,
  rawText: string,
  centerX: number,
  startY: number,
  maxWidth: number,
  fontSize: number,
  fromBottom: boolean,
  fillColor: string
) {
  const clean = rawText.trim().toUpperCase();
  if (!clean) return;

  ctx.save();
  ctx.font = `900 ${fontSize}px Impact, "Arial Black", "Plus Jakarta Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const lineHeight = fontSize * 1.15;
  ctx.lineWidth = Math.max(4, Math.round(fontSize * 0.16));
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = fillColor;

  lines.forEach((ln, idx) => {
    const y = fromBottom
      ? startY - (lines.length - 1 - idx) * lineHeight
      : startY + idx * lineHeight;
    ctx.strokeText(ln, centerX, y);
    ctx.fillText(ln, centerX, y);
  });
  ctx.restore();
}

export const MemeStickerEditorModal: React.FC<MemeStickerEditorModalProps> = ({
  imageSrc,
  onApply,
  onClose,
}) => {
  const [cropMode, setCropMode] = useState<CropMode>('square');
  const [topText, setTopText] = useState('');
  const [bottomText, setBottomText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [textSize, setTextSize] = useState<TextSizeMode>('md');
  const [stampEmoji, setStampEmoji] = useState('');
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [saving, setSaving] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgReady, setImgReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    setImgReady(false);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgReady(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const renderToCanvas = (canvas: HTMLCanvasElement, targetSize: number) => {
    const img = imgRef.current;
    if (!img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isSticker = cropMode === 'sticker' || cropMode === 'circle';
    let outW = targetSize;
    let outH = targetSize;

    if (cropMode === 'original') {
      const ratio = img.width / Math.max(1, img.height);
      if (ratio >= 1) {
        outW = targetSize;
        outH = Math.max(180, Math.round(targetSize / ratio));
      } else {
        outH = targetSize;
        outW = Math.max(180, Math.round(targetSize * ratio));
      }
    }

    canvas.width = outW;
    canvas.height = outH;
    ctx.clearRect(0, 0, outW, outH);

    const pad = isSticker ? Math.round(outW * 0.05) : 0;
    const innerW = outW - pad * 2;
    const innerH = outH - pad * 2;

    const drawClipPath = (inset: number) => {
      const x = pad + inset;
      const y = pad + inset;
      const w = innerW - inset * 2;
      const h = innerH - inset * 2;
      ctx.beginPath();
      if (cropMode === 'circle') {
        ctx.arc(outW / 2, outH / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
      } else if (cropMode === 'sticker') {
        const r = Math.round(w * 0.16);
        ctx.roundRect(x, y, w, h, r);
      } else {
        ctx.rect(0, 0, outW, outH);
      }
      ctx.closePath();
    };

    if (isSticker) {
      // Die-cut white sticker border
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.35)';
      ctx.shadowBlur = Math.round(outW * 0.03);
      ctx.shadowOffsetY = Math.round(outW * 0.012);
      drawClipPath(-Math.round(outW * 0.025));
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    drawClipPath(0);
    ctx.clip();

    // Draw zoomed & panned image covering inner frame
    const baseScale = Math.max(innerW / img.width, innerH / img.height);
    const scale = baseScale * zoom;
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const maxOffsetX = Math.max(0, (drawW - innerW) / 2);
    const maxOffsetY = Math.max(0, (drawH - innerH) / 2);
    const offsetX = panX * maxOffsetX;
    const offsetY = panY * maxOffsetY;
    const dx = pad + (innerW - drawW) / 2 + offsetX;
    const dy = pad + (innerH - drawH) / 2 + offsetY;

    ctx.drawImage(img, dx, dy, drawW, drawH);

    // Captions
    const scaleFactor = textSize === 'sm' ? 0.068 : textSize === 'lg' ? 0.105 : 0.086;
    const fontSize = Math.max(16, Math.round(Math.min(innerW, innerH) * scaleFactor));
    const maxTextWidth = innerW * 0.88;

    drawWrappedCaption(
      ctx,
      topText,
      outW / 2,
      pad + fontSize * 0.9,
      maxTextWidth,
      fontSize,
      false,
      textColor
    );
    drawWrappedCaption(
      ctx,
      bottomText,
      outW / 2,
      outH - pad - fontSize * 0.85,
      maxTextWidth,
      fontSize,
      true,
      textColor
    );

    if (stampEmoji) {
      const emojiSize = Math.round(Math.min(innerW, innerH) * 0.18);
      ctx.font = `${emojiSize}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(stampEmoji, outW - pad - 14, pad + 12);
    }

    ctx.restore();
  };

  useEffect(() => {
    if (!imgReady || !canvasRef.current) return;
    renderToCanvas(canvasRef.current, 520);
  });

  const handleReset = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
    setTopText('');
    setBottomText('');
    setStampEmoji('');
  };

  const handleApply = () => {
    if (!imgRef.current || saving) return;
    setSaving(true);
    try {
      const exportCanvas = document.createElement('canvas');
      const isSticker = cropMode === 'sticker' || cropMode === 'circle';
      const targetSize = isSticker ? 440 : 760;
      renderToCanvas(exportCanvas, targetSize);

      let outUrl = '';
      if (isSticker) {
        outUrl = exportCanvas.toDataURL('image/webp', 0.85);
        if (!outUrl.startsWith('data:image/webp') || outUrl.length > LIMITS.IMAGE_MSG_MAX_CHARS) {
          outUrl = exportCanvas.toDataURL('image/png');
        }
      } else {
        let q = 0.86;
        outUrl = exportCanvas.toDataURL('image/jpeg', q);
        while (outUrl.length > LIMITS.IMAGE_MSG_MAX_CHARS && q > 0.45) {
          q -= 0.1;
          outUrl = exportCanvas.toDataURL('image/jpeg', q);
        }
      }
      onApply(outUrl);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[94dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sticker className="w-5 h-5 sanvad-accent-text shrink-0" />
            <span>Meme &amp; Sticker Studio</span>
          </h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleReset}
              className="min-h-[36px] px-2.5 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
              title="Reset edits"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Close meme editor"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Canvas Preview (drag to pan when zoomed) */}
        <div className="relative bg-slate-950 p-3 flex items-center justify-center h-[32vh] sm:h-[36vh] overflow-hidden shrink-0 select-none">
          <canvas
            ref={canvasRef}
            onPointerDown={(e) => {
              if (zoom <= 1) return;
              dragStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!dragStartRef.current) return;
              const dx = (e.clientX - dragStartRef.current.x) / 90;
              const dy = (e.clientY - dragStartRef.current.y) / 90;
              setPanX(Math.max(-1, Math.min(1, dragStartRef.current.panX + dx)));
              setPanY(Math.max(-1, Math.min(1, dragStartRef.current.panY + dy)));
            }}
            onPointerUp={() => {
              dragStartRef.current = null;
            }}
            className={`max-h-full max-w-full rounded-lg touch-none ${
              zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''
            }`}
          />
          {zoom > 1 && (
            <span className="absolute bottom-2 right-3 px-2 py-0.5 rounded-md bg-black/65 text-white text-[10px] font-medium pointer-events-none">
              Drag photo to adjust crop
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-3.5">
          {/* Shape / Crop Selector */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <Crop className="w-3.5 h-3.5 sanvad-accent-text" />
              <span>Crop &amp; Sticker Cutout</span>
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'original', label: 'Full' },
                  { id: 'square', label: 'Square 1:1' },
                  { id: 'sticker', label: 'Sticker' },
                  { id: 'circle', label: 'Circle' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setCropMode(m.id)}
                  className={`min-h-[36px] px-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                    cropMode === m.id
                      ? 'sanvad-accent-bg border-transparent'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Zoom Slider */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 shrink-0">
              <ZoomIn className="w-3.5 h-3.5 sanvad-accent-text" />
              <span>Zoom ({zoom.toFixed(1)}x)</span>
            </span>
            <input
              type="range"
              min={1}
              max={2.5}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-teal-600 cursor-pointer"
            />
          </div>

          {/* Top & Bottom Meme Text */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 sanvad-accent-text" />
              <span>Meme Text Overlay</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                maxLength={60}
                value={topText}
                onChange={(e) => setTopText(e.target.value)}
                placeholder="Top text (e.g., ME WHEN...)"
                className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <input
                type="text"
                maxLength={60}
                value={bottomText}
                onChange={(e) => setBottomText(e.target.value)}
                placeholder="Bottom punchline..."
                className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          {/* 1-Tap Meme Presets */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 sanvad-accent-text" />
              <span>Quick Hinglish Captions (tap to fill bottom text)</span>
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {MEME_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setBottomText(preset)}
                  className="min-h-[30px] px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Text Style + Emoji Stamp */}
          <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
            <div className="flex items-center gap-1.5">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setTextColor(c.id)}
                  className={`w-7 h-7 rounded-full border-2 cursor-pointer ${
                    textColor === c.id
                      ? 'border-slate-900 dark:border-white scale-110'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                  style={{ backgroundColor: c.id }}
                  title={c.label}
                  aria-label={`Text color ${c.label}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-1">
              {(['sm', 'md', 'lg'] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setTextSize(sz)}
                  className={`min-w-[32px] min-h-[32px] px-2 rounded-lg text-[11px] font-bold uppercase cursor-pointer ${
                    textSize === sz
                      ? 'sanvad-accent-bg'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              {STAMP_EMOJIS.map((em) => (
                <button
                  key={em || 'none'}
                  type="button"
                  onClick={() => setStampEmoji(em)}
                  className={`min-w-[32px] min-h-[32px] px-1.5 rounded-lg text-sm flex items-center justify-center cursor-pointer ${
                    stampEmoji === em
                      ? 'bg-teal-100 dark:bg-teal-900/60 ring-1 ring-teal-500'
                      : 'bg-slate-100 dark:bg-slate-800'
                  }`}
                  title={em ? `Add ${em} stamp` : 'No emoji stamp'}
                >
                  {em || '∅'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!imgReady || saving}
            onClick={handleApply}
            className="min-h-[42px] px-4 rounded-xl sanvad-accent-bg disabled:opacity-50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? 'Rendering...' : 'Apply Meme / Sticker'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
