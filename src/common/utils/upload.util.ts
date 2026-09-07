import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';

// Shared multer disk-storage factory used by any endpoint that accepts a file upload.
// Files are written to  uploads/<folder>/<timestamp>-<random>.<ext>  so filenames
// never collide even under concurrent requests.  The stored path string (e.g.
// "uploads/profile-images/1722000000000-abc123.jpg") is what gets saved in MongoDB
// — the frontend prefixes it with the base URL to form the full image URL.

export function buildDiskStorage(folder: string) {
  const dest = `uploads/${folder}`;
  // Make sure the destination directory exists at startup time, not on first request,
  // so we get a clear error early rather than a mysterious 500 mid-flight.
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  return diskStorage({
    destination: dest,
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      cb(null, `${unique}${extname(file.originalname)}`);
    },
  });
}

/** Allowed image MIME types (including iOS HEIC/HEIF formats) */
export function imageFileFilter(_req: any, file: Express.Multer.File, cb: any) {
  if (
    !file.mimetype.match(/^image\/(jpeg|jpg|png|gif|webp|heic|heif|pjpeg|x-png)$/i) &&
    !file.mimetype.startsWith('image/')
  ) {
    return cb(new BadRequestException('Only image files (jpeg, jpg, png, gif, webp, heic) are allowed'), false);
  }
  cb(null, true);
}
