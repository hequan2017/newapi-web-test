import { describe, expect, it, vi } from 'vitest';
import {
  buildRequestPreview,
  getContentURL,
  getVideoContent,
  getTaskStatus,
  isTerminalStatus,
  sendModelRequest,
  serializePreviewPayload,
} from './api';

describe('api helpers', () => {
  it('serializes binary image[] parts into readable preview placeholders', () => {
    const first = new File(['first'], 'a.png', { type: 'image/png' });
    const second = new File(['second'], 'b.jpg', { type: 'image/jpeg' });
    const payload = {
      model: 'doubao-seedream-5-0-260128',
      prompt: 'same style',
      'image[]': [first, second],
    };

    expect(serializePreviewPayload(payload)).toEqual({
      model: 'doubao-seedream-5-0-260128',
      prompt: 'same style',
      'image[]': [
        { name: 'a.png', type: 'image/png', size: first.size },
        { name: 'b.jpg', type: 'image/jpeg', size: second.size },
      ],
    });
  });

  it('sends JSON model requests with authorization header', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ id: 'chatcmpl_1' }),
    });

    const result = await sendModelRequest({
      apiBase: '/api',
      apiKey: 'sk-test',
      path: '/v1/chat/completions',
      contentType: 'json',
      payload: { model: 'm', messages: [] },
      fetcher,
    });

    expect(result).toEqual({ id: 'chatcmpl_1' });
    expect(fetcher).toHaveBeenCalledWith('/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer sk-test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'm', messages: [] }),
    });
  });

  it('routes Gemini image generation requests to native generateContent', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ candidates: [] }),
    });

    await sendModelRequest({
      apiBase: '/api',
      apiKey: 'sk-test',
      path: '/v1/images/generations',
      contentType: 'json',
      payload: {
        model: 'gemini-3.1-flash-image-preview-sp',
        prompt: '一张干净的产品摄影图',
        size: '1024x1024',
        quality: 'standard',
        n: 1,
      },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith('/api/v1beta/models/gemini-3.1-flash-image-preview-sp:generateContent', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer sk-test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: '一张干净的产品摄影图' }],
          },
        ],
      }),
    });
  });

  it('keeps non-Gemini image generation requests on OpenAI image endpoint', () => {
    expect(buildRequestPreview({
      apiBase: '/api',
      apiKey: 'sk-test',
      path: '/v1/images/generations',
      contentType: 'json',
      payload: {
        model: 'ByteDance-Seedream-5.0',
        prompt: '一张干净的产品摄影图',
        size: '1920x1920',
        quality: 'standard',
        n: 1,
      },
    })).toEqual({
      method: 'POST',
      url: '/api/v1/images/generations',
      headers: {
        Authorization: 'Bearer sk-test',
        'Content-Type': 'application/json',
      },
      body: {
        model: 'ByteDance-Seedream-5.0',
        prompt: '一张干净的产品摄影图',
        size: '1920x1920',
        quality: 'standard',
        n: 1,
      },
    });
  });

  it('previews Gemini image generation requests with native endpoint and body', () => {
    expect(buildRequestPreview({
      apiBase: '/api',
      apiKey: 'sk-test',
      path: '/v1/images/generations',
      contentType: 'json',
      payload: {
        model: 'gemini-3.1-flash-image-preview-sp',
        prompt: '一张干净的产品摄影图',
        size: '1024x1024',
        quality: 'standard',
        n: 1,
      },
    })).toEqual({
      method: 'POST',
      url: '/api/v1beta/models/gemini-3.1-flash-image-preview-sp:generateContent',
      headers: {
        Authorization: 'Bearer sk-test',
        'Content-Type': 'application/json',
      },
      body: {
        contents: [
          {
            role: 'user',
            parts: [{ text: '一张干净的产品摄影图' }],
          },
        ],
      },
    });
  });

  it('sends native Gemini image paths with native body', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ candidates: [] }),
    });

    await sendModelRequest({
      apiBase: '/api',
      apiKey: 'sk-test',
      path: '/v1beta/models/gemini-3.1-flash-image-preview-sp:generateContent',
      contentType: 'json',
      payload: {
        model: 'gemini-3.1-flash-image-preview-sp',
        prompt: '一张干净的产品摄影图',
        size: '1024x1024',
        quality: 'standard',
        n: 1,
      },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith('/api/v1beta/models/gemini-3.1-flash-image-preview-sp:generateContent', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer sk-test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: '一张干净的产品摄影图' }],
          },
        ],
      }),
    });
  });

  it('sends multipart model requests without manually setting content type', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ id: 'video_1' }),
    });

    await sendModelRequest({
      apiBase: '/api',
      apiKey: 'sk-test',
      path: '/v1/videos',
      contentType: 'multipart',
      payload: { model: 'sora', prompt: 'cat' },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith('/api/v1/videos', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer sk-test',
      },
      body: expect.any(FormData),
    });
    expect(fetcher.mock.calls[0][1].body.get('model')).toBe('sora');
    expect(fetcher.mock.calls[0][1].body.get('prompt')).toBe('cat');
  });

  it('appends multipart array fields as repeated form fields', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ id: 'video_1' }),
    });

    await sendModelRequest({
      apiBase: '/api',
      apiKey: 'sk-test',
      path: '/v1/videos',
      contentType: 'multipart',
      payload: {
        model: 'viduq3-pro',
        prompt: 'cat running',
        images: [
          'https://example.com/cat.png',
          'data:image/png;base64,ZmFrZQ==',
        ],
      },
      fetcher,
    });

    const body = fetcher.mock.calls[0][1].body;
    expect(body.getAll('images')).toEqual([
      'https://example.com/cat.png',
      'data:image/png;base64,ZmFrZQ==',
    ]);
    expect(body.get('images')).toBe('https://example.com/cat.png');
  });

  it('serializes multipart object arrays as JSON strings', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ id: 'video_1' }),
    });

    const items = [
      { url: 'https://example.com/cat.png', role: 'reference_image' },
      { url: 'data:image/png;base64,ZmFrZQ==', role: 'reference_image' },
    ];

    await sendModelRequest({
      apiBase: '/api',
      apiKey: 'sk-test',
      path: '/v1/videos',
      contentType: 'multipart',
      payload: { model: 'test', items },
      fetcher,
    });

    const body = fetcher.mock.calls[0][1].body;
    expect(body.get('items')).toEqual(JSON.stringify(items));
  });

  it('appends multipart binary arrays as repeated form fields', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ id: 'video_1' }),
    });
    const first = new Blob(['first'], { type: 'image/png' });
    const second = new Blob(['second'], { type: 'image/jpeg' });

    await sendModelRequest({
      apiBase: '/api',
      apiKey: 'sk-test',
      path: '/v1/videos',
      contentType: 'multipart',
      payload: {
        model: 'test',
        input_reference: [first, second],
      },
      fetcher,
    });

    const body = fetcher.mock.calls[0][1].body;
    const references = body.getAll('input_reference');
    expect(references).toHaveLength(2);
    expect(references[0]).toBeInstanceOf(Blob);
    expect(references[1]).toBeInstanceOf(Blob);
    expect(references[0]).toMatchObject({ type: 'image/png', size: 5 });
    expect(references[1]).toMatchObject({ type: 'image/jpeg', size: 6 });
  });

  it('keeps video image and input_reference upload fields as binary form parts', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ id: 'video_1' }),
    });
    const singleImage = new Blob(['image'], { type: 'image/png' });
    const firstImage = new Blob(['first'], { type: 'image/png' });
    const secondImage = new Blob(['second'], { type: 'image/jpeg' });
    const firstReference = new Blob(['reference'], { type: 'image/webp' });
    const secondReference = new Blob(['second-reference'], { type: 'image/png' });

    await sendModelRequest({
      apiBase: '/api',
      apiKey: 'sk-test',
      path: '/v1/videos',
      contentType: 'multipart',
      payload: {
        model: 'test',
        image: singleImage,
        images: [firstImage, secondImage],
        input_reference: [firstReference, secondReference],
      },
      fetcher,
    });

    const body = fetcher.mock.calls[0][1].body;
    expect(body.get('image')).toMatchObject({ type: 'image/png', size: 5 });
    expect(body.getAll('images')).toHaveLength(2);
    expect(body.getAll('images')[0]).toMatchObject({ type: 'image/png', size: 5 });
    expect(body.getAll('images')[1]).toMatchObject({ type: 'image/jpeg', size: 6 });
    expect(body.getAll('input_reference')).toHaveLength(2);
    expect(body.getAll('input_reference')[0]).toMatchObject({ type: 'image/webp', size: 9 });
    expect(body.getAll('input_reference')[1]).toMatchObject({ type: 'image/png', size: 16 });
  });

  it('serializes video image_urls objects as JSON and upload images as image fields', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ id: 'video_1' }),
    });
    const firstImage = new Blob(['first'], { type: 'image/png' });
    const secondImage = new Blob(['second'], { type: 'image/jpeg' });

    await sendModelRequest({
      apiBase: '/api',
      apiKey: 'sk-test',
      path: '/v1/videos',
      contentType: 'multipart',
      payload: {
        model: 'test',
        image: [firstImage, secondImage],
        image_urls: [
          { url: 'https://example.com/cat.png', role: 'reference_image' },
          { url: 'https://example.com/dog.png', role: 'last_frame' },
        ],
      },
      fetcher,
    });

    const body = fetcher.mock.calls[0][1].body;
    expect(body.getAll('image')).toHaveLength(2);
    expect(body.getAll('image')[0]).toMatchObject({ type: 'image/png', size: 5 });
    expect(body.getAll('image')[1]).toMatchObject({ type: 'image/jpeg', size: 6 });
    expect(body.get('image_urls')).toBe(JSON.stringify([
      { url: 'https://example.com/cat.png', role: 'reference_image' },
      { url: 'https://example.com/dog.png', role: 'last_frame' },
    ]));
  });

  it('previews multipart file fields with file metadata instead of empty objects', () => {
    const image = new File(['image'], 'reference.png', { type: 'image/png' });

    expect(buildRequestPreview({
      apiBase: '/api',
      apiKey: 'sk-test',
      path: '/v1/videos',
      contentType: 'multipart',
      payload: {
        model: 'doubao-seedance-2-0-fast-260128',
        input_reference: [image],
      },
    })).toEqual({
      method: 'POST',
      url: '/api/v1/videos',
      headers: {
        Authorization: 'Bearer sk-test',
        'Content-Type': 'multipart/form-data (auto boundary)',
      },
      body: {
        model: 'doubao-seedance-2-0-fast-260128',
        input_reference: [
          {
            name: 'reference.png',
            type: 'image/png',
            size: 5,
          },
        ],
      },
    });
  });

  it('builds request preview with editable path', () => {
    expect(buildRequestPreview({
      apiBase: '/api/',
      apiKey: 'sk-test',
      path: 'custom/path',
      contentType: 'json',
      payload: { model: 'm' },
    })).toEqual({
      method: 'POST',
      url: '/api/custom/path',
      headers: {
        Authorization: 'Bearer sk-test',
        'Content-Type': 'application/json',
      },
      body: { model: 'm' },
    });
  });

  it('queries encoded video task status', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ id: 'a/b', status: 'completed' }),
    });

    await getTaskStatus({
      apiBase: '/api/',
      apiKey: 'sk-test',
      taskID: 'a/b',
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith('/api/v1/videos/a%2Fb', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer sk-test',
      },
    });
  });

  it('queries video task status with a custom task path', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: () => Promise.resolve({ id: 'video_1', status: 'completed' }),
    });

    await getTaskStatus({
      apiBase: '/api/',
      apiKey: 'sk-test',
      path: '/v1/videos',
      taskID: 'video_1',
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith('/api/v1/videos/video_1', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer sk-test',
      },
    });
  });

  it('builds generated video content URL', () => {
    expect(getContentURL('/api/', 'video_1')).toBe('/api/v1/videos/video_1/content');
    expect(getContentURL('/api/', 'video_1', '/v1/videos')).toBe('/api/v1/videos/video_1/content');
  });

  it('fetches generated video content with authorization header', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:video_1'),
    });
    const blob = new Blob(['video'], { type: 'video/mp4' });
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'video/mp4' }),
      blob: () => Promise.resolve(blob),
    });

    const result = await getVideoContent({
      apiBase: '/api/',
      apiKey: 'sk-test',
      taskID: 'video_1',
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith('/api/v1/videos/video_1/content', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer sk-test',
      },
    });
    expect(result).toEqual({
      type: 'blob',
      mimeType: 'video/mp4',
      size: blob.size,
      url: 'blob:video_1',
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    });
  });

  it('detects terminal task status', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('done')).toBe(true);
    expect(isTerminalStatus('succeeded')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('processing')).toBe(false);
  });
});
