export async function compressImageFile(
  file: File,
  options: { maxWidth: number; maxHeight: number; quality?: number; maxChars?: number }
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('শুধুমাত্র ইমেজ ফাইল (JPG/PNG/WebP) নির্বাচন করুন।');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('ছবির আকার ১৫ MB-এর কম হতে হবে।');
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const renderAt = (scaleFactor: number, quality: number): string => {
          const ratio =
            Math.min(
              1,
              options.maxWidth / Math.max(1, img.width),
              options.maxHeight / Math.max(1, img.height)
            ) * scaleFactor;
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * ratio));
          canvas.height = Math.max(1, Math.round(img.height * ratio));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Image processing unavailable.');
          }
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', quality);
        };

        try {
          let quality = options.quality ?? 0.78;
          let scaleFactor = 1;
          let dataUrl = renderAt(scaleFactor, quality);
          const maxChars = options.maxChars ?? 360000;

          while (dataUrl.length > maxChars && (quality > 0.42 || scaleFactor > 0.55)) {
            if (quality > 0.46) {
              quality = Math.max(0.42, Number((quality - 0.1).toFixed(2)));
            } else {
              scaleFactor = Number((scaleFactor * 0.82).toFixed(2));
            }
            dataUrl = renderAt(scaleFactor, quality);
          }

          resolve(dataUrl);
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Image processing unavailable.'));
        }
      };
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}
