// Same lightweight preparation used by PLATFORM Web Super Admin and Telegram Mini App.
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
export async function inspectLandingImage(file) {
  if (!file || !ALLOWED.has(file.type)) throw new Error('PNG, JPG yoki WebP rasm tanlang.');
  if (file.size > 18 * 1024 * 1024) throw new Error('Rasm 18 MB dan katta. Kichikroq fayl tanlang.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Rasmni ochib bo‘lmadi.')); });
    if (image.naturalWidth < 128 || image.naturalHeight < 128) throw new Error('Kamida 128×128 px rasm kerak.');
    return { width: image.naturalWidth, height: image.naturalHeight, square: image.naturalWidth === image.naturalHeight };
  } finally { URL.revokeObjectURL(url); }
}
export async function prepareLandingImage(file, position = 'center') {
  const info = await inspectLandingImage(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Rasmni ochib bo‘lmadi.')); });
    const edge = Math.min(info.width, info.height), size = Math.min(1024, edge);
    const cropX = info.width - edge, cropY = info.height - edge;
    const offsetX = position === 'left' ? 0 : position === 'right' ? cropX : cropX / 2;
    const offsetY = position === 'top' ? 0 : position === 'bottom' ? cropY : cropY / 2;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Rasmni qayta ishlash mavjud emas.');
    context.drawImage(image, offsetX, offsetY, edge, edge, 0, 0, size, size);
    let mimeType = 'image/webp', data = canvas.toDataURL(mimeType, .84);
    if (!data.startsWith('data:image/webp;')) { mimeType = 'image/jpeg'; data = canvas.toDataURL(mimeType, .82); }
    // A second, lower-quality pass handles detailed photographic PNG sources.
    if (data.length > 2_790_000) data = canvas.toDataURL(mimeType, .62);
    if (data.length > 2_790_000) throw new Error('Rasmni 2 MB ichiga sig‘dirib bo‘lmadi.');
    return { mimeType, base64: data.split(',')[1], width: size, height: size };
  } finally { URL.revokeObjectURL(url); }
}

// Legacy Platform Mini App uses this module via a deferred module script.
if (typeof window !== 'undefined') window.USTORE_LANDING_IMAGE_TOOLS = { inspectLandingImage, prepareLandingImage };
