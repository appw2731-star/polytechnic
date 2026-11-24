export async function compressImageFile(
  file: File,
  options: { maxWidth: number; maxHeight: number; quality?: number }
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('শুধুমাত্র ইমেজ ফাইল (JPG/PNG/WebP) নির্বাচন করুন।');
  }
  if (file.size > 6 * 1024 * 1024) {
    throw new Error('ছবির আকার ৬ MB-এর কম হতে হবে।');
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(
          1,
          options.maxWidth / Math.max(1, img.width),
          options.maxHeight / Math.max(1, img.height)
        );
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * ratio));
        canvas.height = Math.max(1, Math.round(img.height * ratio));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Image processing unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', options.quality ?? 0.8));
      };
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}
