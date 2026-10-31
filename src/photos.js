// Photo library for the editor: resizes uploads and keeps them in IndexedDB
// so they survive a page reload. Everything degrades to in-memory storage
// when IndexedDB is unavailable (private windows, blocked storage).

const DB_NAME = 'newsletter-studio';
const STORE = 'photos';
const MAX_SIDE = 2000;

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'name' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const t = d.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r && 'result' in r ? r.result : null);
      t.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export const loadAll = async () => (await tx('readonly', (s) => s.getAll())) || [];
export const save = (rec) => tx('readwrite', (s) => s.put(rec));
export const remove = (name) => tx('readwrite', (s) => s.delete(name));
export const clear = () => tx('readwrite', (s) => s.clear());

export function safeName(name) {
  const clean = String(name).normalize('NFKD').replace(/[^\w.\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return clean.toLowerCase() || 'photo.jpg';
}

// Downscale large photos so exports stay small. SVGs and small files pass through.
export async function prepare(file, name = file.name) {
  const type = file.type || '';
  if (/svg/.test(type) || /\.svg$/i.test(name)) return { name: safeName(name), blob: file, type: 'image/svg+xml' };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 900_000) return { name: safeName(name), blob: file, type, width: bmp.width, height: bmp.height };
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);
    const keepPng = /png|gif|webp/.test(type) && file.size < 1_500_000;
    const outType = keepPng ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((r) => canvas.toBlob(r, outType, 0.86));
    const outName = keepPng ? safeName(name) : safeName(name).replace(/\.(png|gif|webp|bmp|heic|heif|avif)$/i, '.jpg');
    return { name: outName, blob, type: outType, width: w, height: h };
  } catch {
    return { name: safeName(name), blob: file, type };
  }
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
