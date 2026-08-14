import { describe, expect, it } from 'vitest';
import {
  createVideoResolutionLabel,
  createVideoResolutionLabelFromSize,
  parseVideoSize,
} from './videoResolution';

describe('video resolution labels', () => {
  it.each([
    [1280, 720, '720p · 1280×720'],
    [720, 1280, '720p · 720×1280'],
    [1920, 1080, '1080p · 1920×1080'],
    [1080, 1920, '1080p · 1080×1920'],
    [1920, 1088, '1080p · 1920×1088'],
  ])('classifies %sx%s using the short edge', (width, height, text) => {
    expect(createVideoResolutionLabel({ width, height, source: 'actual' })).toEqual({
      width,
      height,
      resolution: text.startsWith('720p') ? '720p' : '1080p',
      source: 'actual',
      text,
    });
  });

  it('keeps non-standard actual dimensions without forcing a resolution class', () => {
    expect(createVideoResolutionLabel({ width: 1280, height: 800, source: 'actual' })).toEqual({
      width: 1280,
      height: 800,
      resolution: '',
      source: 'actual',
      text: '1280×800',
    });
  });

  it('marks labels derived from the submitted request as a fallback', () => {
    expect(createVideoResolutionLabelFromSize('1920x1080')).toEqual({
      width: 1920,
      height: 1080,
      resolution: '1080p',
      source: 'request',
      text: '1080p · 1920×1080（请求）',
    });
  });

  it.each(['', '1920', '1920*1080', '0x1080', '-1x720', '1024.5x720'])('rejects invalid size %s', (size) => {
    expect(parseVideoSize(size)).toBeNull();
    expect(createVideoResolutionLabelFromSize(size)).toBeNull();
  });

  it('does not classify 1024x1024 as 1080p', () => {
    expect(createVideoResolutionLabelFromSize('1024x1024')).toEqual({
      width: 1024,
      height: 1024,
      resolution: '',
      source: 'request',
      text: '1024×1024（请求）',
    });
  });
});
