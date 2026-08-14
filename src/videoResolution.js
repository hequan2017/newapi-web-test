const RESOLUTION_TOLERANCE = 16;
const RESOLUTION_TARGETS = [
  { shortEdge: 720, label: '720p' },
  { shortEdge: 1080, label: '1080p' },
];

export function parseVideoSize(size) {
  const match = /^(\d+)x(\d+)$/i.exec(String(size || '').trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

export function createVideoResolutionLabel({ width, height, source = 'actual' } = {}) {
  const normalizedWidth = Number(width);
  const normalizedHeight = Number(height);
  if (
    !Number.isInteger(normalizedWidth)
    || !Number.isInteger(normalizedHeight)
    || normalizedWidth <= 0
    || normalizedHeight <= 0
  ) {
    return null;
  }

  const shortEdge = Math.min(normalizedWidth, normalizedHeight);
  const resolution = RESOLUTION_TARGETS.find((item) => (
    Math.abs(shortEdge - item.shortEdge) <= RESOLUTION_TOLERANCE
  ))?.label || '';
  const dimensions = `${normalizedWidth}×${normalizedHeight}`;
  const prefix = resolution ? `${resolution} · ` : '';
  const suffix = source === 'request' ? '（请求）' : '';

  return {
    width: normalizedWidth,
    height: normalizedHeight,
    resolution,
    source,
    text: `${prefix}${dimensions}${suffix}`,
  };
}

export function createVideoResolutionLabelFromSize(size) {
  const dimensions = parseVideoSize(size);
  if (!dimensions) return null;
  return createVideoResolutionLabel({ ...dimensions, source: 'request' });
}
