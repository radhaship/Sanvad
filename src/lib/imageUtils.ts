import { LIMITS } from './validation';

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the selected image file.'));
    };
    img.src = url;
  });
}

export async function compressAvatarImage(file: File): Promise<string> {
  const img = await loadImage(file);
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  // Center-crop square
  const minSide = Math.min(img.width, img.height);
  const sx = (img.width - minSide) / 2;
  const sy = (img.height - minSide) / 2;
  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

  let quality = 0.85;
  let dataUrl = canvas.toDataURL('image/webp', quality);
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  while (dataUrl.length > LIMITS.PHOTO_MAX_CHARS && quality > 0.35) {
    quality -= 0.12;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length > LIMITS.PHOTO_MAX_CHARS) {
    throw new Error('Selected image is too large even after compression.');
  }
  return dataUrl;
}

export async function compressChatPhoto(file: File): Promise<string> {
  const img = await loadImage(file);
  const maxDim = 1080;
  let width = img.width;
  let height = img.height;

  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.82;
  let dataUrl = canvas.toDataURL('image/webp', quality);
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  while (dataUrl.length > LIMITS.IMAGE_MSG_MAX_CHARS && quality > 0.32) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  if (dataUrl.length > LIMITS.IMAGE_MSG_MAX_CHARS) {
    // Downscale further if extremely complex photo
    const scale = 0.65;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx2 = canvas.getContext('2d');
    if (ctx2) {
      ctx2.drawImage(img, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    }
  }

  if (dataUrl.length > LIMITS.IMAGE_MSG_MAX_CHARS) {
    throw new Error('Photo is too large to send. Please choose a smaller image.');
  }

  return dataUrl;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
