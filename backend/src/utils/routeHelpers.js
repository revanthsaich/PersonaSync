import fs from "fs";

/**
 * Ensure directory exists, create if not
 */
export const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/**
 * Extract user ID from request headers
 */
export const getUserId = (req) => {
  return (
    req.headers["x-user-id"] ||
    req.headers["x-clerk-user-id"] ||
    "default_user"
  );
};

/**
 * Extract user email from request headers
 */
export const getUserEmail = (req) => {
  const raw = req.headers["x-user-email"] || req.headers["x-clerk-email"];
  if (!raw || typeof raw !== "string") return null;
  return raw.trim().toLowerCase();
};

/**
 * Get absolute URL for uploaded file
 */
export const getFileUrl = (req, filename) => {
  const protocol = req.protocol;
  const host = req.get("host");
  return `${protocol}://${host}/uploads/${filename}`;
};

/**
 * Clamp bounding box coordinates within image dimensions
 */
export const clampBBox = (bbox = [], width = 0, height = 0) => {
  const [x1, y1, x2, y2] = bbox.map((v) => Math.round(v || 0));
  const left = Math.max(0, Math.min(x1, width));
  const top = Math.max(0, Math.min(y1, height));
  const right = Math.max(left + 1, Math.min(x2, width));
  const bottom = Math.max(top + 1, Math.min(y2, height));
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
};

/**
 * Expand bounding box to include context around face
 */
export const expandBBox = (bbox = [], width = 0, height = 0, marginRatio = 0.25) => {
  if (!Array.isArray(bbox) || bbox.length !== 4) return bbox;
  const [x1, y1, x2, y2] = bbox;
  const w = x2 - x1;
  const h = y2 - y1;
  const dx = w * marginRatio;
  const dy = h * marginRatio;
  return [
    x1 - dx,
    y1 - dy,
    x2 + dx,
    y2 + dy,
  ];
};

export const ML_SERVICE_URL = "http://127.0.0.1:8000";
