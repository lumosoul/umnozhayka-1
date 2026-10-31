// Распознавание QR в отдельном потоке, чтобы видео с камеры не подтормаживало.

import { decodeQR } from './qr-decode.js';

self.onmessage = (e) => {
  const { id, width, height, buffer } = e.data;
  let text = null;
  try {
    const res = decodeQR({ data: new Uint8ClampedArray(buffer), width, height });
    if (res) text = res.text;
  } catch (err) {
    text = null;
  }
  self.postMessage({ id, text });
};
