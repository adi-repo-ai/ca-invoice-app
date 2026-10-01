// Client-side logo processing: resize to max 400px wide and return a base64
// data URL small enough to live inside the Firestore settings document.

export const MAX_LOGO_WIDTH = 400;
export const MAX_LOGO_DATA_URL_CHARS = 300_000; // ~225 KB binary; doc limit is 1 MiB

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
      reject(new Error('Could not read that image file'));
    };
    img.src = url;
  });
}

export async function resizeLogo(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (PNG, JPG or SVG)');
  const img = await loadImage(file);
  const w0 = img.naturalWidth || MAX_LOGO_WIDTH;
  const h0 = img.naturalHeight || MAX_LOGO_WIDTH;
  const scale = Math.min(1, MAX_LOGO_WIDTH / w0);
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  // PNG keeps transparency; fall back to JPEG on white if it is too large.
  let url = canvas.toDataURL('image/png');
  if (url.length > MAX_LOGO_DATA_URL_CHARS) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    for (const q of [0.9, 0.8, 0.7, 0.6]) {
      url = canvas.toDataURL('image/jpeg', q);
      if (url.length <= MAX_LOGO_DATA_URL_CHARS) break;
    }
  }
  if (url.length > MAX_LOGO_DATA_URL_CHARS) throw new Error('Logo is too detailed to store; please use a simpler image');
  return url;
}
