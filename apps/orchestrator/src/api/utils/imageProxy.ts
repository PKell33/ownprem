/**
 * Shared utility for proxying external images to avoid CORS issues
 */

import { Response } from 'express';

/**
 * Proxy an external image URL and send it to the client.
 * Returns true if successful, false if the image was not found or failed to fetch.
 */
export async function proxyImage(imageUrl: string, res: Response): Promise<boolean> {
  try {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      // Return 404 for missing images (not 502)
      const status = response.status === 404 ? 404 : 502;
      res.status(status).end();
      return false;
    }

    // Forward content type and cache headers
    const contentType = response.headers.get('content-type') || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    // Send the response
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
    return true;
  } catch {
    res.status(502).end();
    return false;
  }
}

/**
 * Get gallery URLs from an app object.
 * Handles different field names used by different stores.
 */
export function getGalleryUrls(app: Record<string, unknown>): string[] {
  // Try 'gallery' array first (Umbrel, Runtipi)
  if (Array.isArray(app.gallery)) {
    return app.gallery.filter((url): url is string => typeof url === 'string');
  }

  // Try 'screenshot' single URL (CasaOS)
  if (typeof app.screenshot === 'string' && app.screenshot) {
    return [app.screenshot];
  }

  // Try 'screenshots' array (Start9)
  if (Array.isArray(app.screenshots)) {
    return app.screenshots.filter((url): url is string => typeof url === 'string');
  }

  return [];
}
