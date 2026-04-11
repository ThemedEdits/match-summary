// Cloudinary config
const CLOUD_NAME = 'duw28chtl';
const UPLOAD_PRESET = 'match-summary';

/**
 * Upload a File or Blob to Cloudinary.
 * Returns the secure URL string.
 */
export async function uploadToCloudinary(fileOrBlob, folder = 'cricsnap') {
  const formData = new FormData();
  formData.append('file', fileOrBlob);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || 'Cloudinary upload failed');
  }

  const data = await res.json();
  return data.secure_url;
}

/**
 * Convert a canvas element to a Blob and upload.
 * Returns the secure URL.
 */
export async function uploadCanvasToCloudinary(canvas, folder = 'cricsnap/summaries') {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error('Canvas to blob failed'));
      try {
        const url = await uploadToCloudinary(blob, folder);
        resolve(url);
      } catch (e) {
        reject(e);
      }
    }, 'image/png', 0.95);
  });
}
