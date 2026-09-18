import { handleUpload } from '@vercel/blob/client';

const MAX_CONTENT_FILE_BYTES = 100 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const response = await handleUpload({
      body: req.body || {},
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const isContent = /^edu\/submissions\/[a-zA-Z0-9._-]{1,160}$/.test(pathname);
        const isThumbnail = /^edu\/thumbnails\/[a-zA-Z0-9._-]{1,160}$/.test(pathname);
        if (!isContent && !isThumbnail) {
          throw new Error('invalid_upload_path');
        }
        return {
          ...(isThumbnail ? { allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'] } : {}),
          maximumSizeInBytes: isThumbnail ? MAX_THUMBNAIL_BYTES : MAX_CONTENT_FILE_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return res.status(200).json(response);
  } catch (error) {
    return res.status(400).json({
      error: 'edu_upload_failed',
      message: String(error?.message || error),
    });
  }
}
