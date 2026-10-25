/**
 * Defaults for the split file map's lightweight previews.
 *
 * The map is a visual overview, not a file viewer: these caps keep a big tree
 * from turning into hundreds of megabytes of network traffic and decoded media.
 * They are user-adjustable in Settings.
 */
export const DEFAULT_MAX_TEXT_KB = 64;
export const DEFAULT_MAX_IMAGE_MB = 2;
export const DEFAULT_MAX_PDF_MB = 5;

export const MAX_SAFE_TEXT_BYTES = DEFAULT_MAX_TEXT_KB * 1024;
export const MAX_SAFE_IMAGE_BYTES = DEFAULT_MAX_IMAGE_MB * 1_000_000;
export const MAX_SAFE_PDF_BYTES = DEFAULT_MAX_PDF_MB * 1_000_000;
