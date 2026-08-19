const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_EDGE = 1600;

export async function compressMemoryPhoto(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('請選擇照片檔案。');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('照片太大，請選擇小於 20 MB 的照片。');

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = sourceUrl;
    await image.decode();
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.78));
    if (!blob) throw new Error('這張照片無法處理，請選擇另一張照片。');
    return blob;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
