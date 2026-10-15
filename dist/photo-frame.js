// A reviewed view is a fixed part of the source photo. Viewing controls operate
// on this frame, so zooming out or entering fullscreen cannot expose a sign.
export function frameBounds(width, height, frame = [0, 0, 1, 1]) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0 || !Array.isArray(frame) || frame.length !== 4 || !frame.every(Number.isFinite)) throw new Error('Invalid photo frame.');
  const [x, y, w, h] = frame;
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1.000000001 || y + h > 1.000000001) throw new Error('Photo frame exceeds the source image.');
  const left = Math.round(x * width), top = Math.round(y * height);
  const right = Math.min(width, Math.round((x + w) * width)), bottom = Math.min(height, Math.round((y + h) * height));
  if (right <= left || bottom <= top) throw new Error('Photo frame is empty.');
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export async function preparePhotoFrame(src, frame) {
  const original = new Image();
  original.src = src;
  await original.decode();
  const bounds = frameBounds(original.naturalWidth, original.naturalHeight, frame);
  if (!frame || frame.every((value, index) => value === [0, 0, 1, 1][index])) return { src, release() {} };
  const canvas = document.createElement('canvas');
  canvas.width = bounds.width; canvas.height = bounds.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The photo view could not be prepared.');
  context.drawImage(original, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The photo view could not be prepared.');
  const url = URL.createObjectURL(blob);
  return { src: url, release() { URL.revokeObjectURL(url); } };
}
