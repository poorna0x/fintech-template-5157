import { cloudinaryService } from '@/lib/cloudinary';

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    let fetchUrl = url;
    if (url.includes('cloudinary.com')) {
      fetchUrl = url.replace(/\/upload\/[^/]*\//, '/upload/');
    }
    img.src = fetchUrl;
  });
}

export async function rotateImageBlob90Clockwise(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.height;
  canvas.height = bitmap.width;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Could not rotate image');
  }
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();

  const rotated = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, blob.type || 'image/jpeg', 0.92)
  );
  if (!rotated) {
    throw new Error('Could not export rotated image');
  }
  return rotated;
}

export async function rotateImageUrlAndReupload(
  imageUrl: string,
  folder = 'ro-service'
): Promise<string> {
  const response = await fetch(imageUrl, { mode: 'cors' }).catch(async () => {
    const img = await loadImageElement(imageUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not read image');
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    );
    if (!blob) throw new Error('Could not read image');
    return new Response(blob);
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image (${response.status})`);
  }

  const sourceBlob = await response.blob();
  const rotatedBlob = await rotateImageBlob90Clockwise(sourceBlob);
  const file = new File([rotatedBlob], `rotated-${Date.now()}.jpg`, {
    type: rotatedBlob.type || 'image/jpeg',
  });

  const publicIdInfo = cloudinaryService.extractPublicId(imageUrl);
  const useSecondary = publicIdInfo?.useSecondary ?? false;
  const result = await cloudinaryService.uploadImage(file, folder, useSecondary);
  if (!result?.secure_url) {
    throw new Error('Upload failed');
  }
  return result.secure_url;
}
