import { describe, expect, it } from 'vitest';
import {
  AUDIO_MODE_PREFIXES,
  COSYVOICE_VOICES,
  buildCapabilityPayload,
  createDefaultForm,
  getCapability,
  getCapabilities,
  getModelRequestConfig,
  getDurationConstraints,
  resolveRequestContentType,
  DOUBAO_SEEDREAM_ASPECT_RATIO_SIZE_OPTIONS,
} from './modelPresets';

describe('model presets', () => {
  it('provides text image audio and video capabilities', () => {
    expect(getCapabilities().map((item) => item.id)).toEqual(['text', 'image', 'image-to-image', 'audio', 'video']);
  });

  it('builds chat completion payload for text testing', () => {
    const form = createDefaultForm('text');
    form.model = 'deepseek-v4-flash';
    form.systemPrompt = 'You are concise.';
    form.prompt = 'hello';

    expect(buildCapabilityPayload('text', form)).toEqual({
      model: 'deepseek-v4-flash',
      messages: [
        { role: 'system', content: 'You are concise.' },
        { role: 'user', content: 'hello' },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    });
  });

  it('builds image generation payload for image testing', () => {
    const form = createDefaultForm('image');
    form.prompt = 'a clean product photo';

    expect(buildCapabilityPayload('image', form)).toEqual({
      model: 'doubao-seedream-5-0-pro-260628',
      prompt: 'a clean product photo',
      size: '2848x1600',
      quality: 'standard',
      n: 1,
    });
  });

  it('uses official 16:9 defaults for the Doubao Seedream model', () => {
    const form = createDefaultForm('image');

    expect(buildCapabilityPayload('image', form)).toMatchObject({
      model: 'doubao-seedream-5-0-pro-260628',
      prompt: '一只跑的 橘猫',
      size: '2848x1600',
    });
  });

  it('keeps the supported Doubao Seedream aspect ratio resolutions', () => {
    const form = createDefaultForm('image');
    form.aspectRatio = '9:16';
    form.size = '1600x2848';

    expect(DOUBAO_SEEDREAM_ASPECT_RATIO_SIZE_OPTIONS).toEqual([
      { aspectRatio: '16:9', size: '2848x1600' },
      { aspectRatio: '9:16', size: '1600x2848' },
      { aspectRatio: '1:1', size: '2048x2048' },
    ]);
    expect(buildCapabilityPayload('image', form)).toMatchObject({
      model: 'doubao-seedream-5-0-pro-260628',
      size: '1600x2848',
    });
  });

  it('uses deepseek-v4-flash-260425 as the default text model', () => {
    expect(createDefaultForm('text').model).toBe('deepseek-v4-flash-260425');
  });

  it('uses doubao-seedream-5-0-pro-260628 as both image defaults', () => {
    expect(createDefaultForm('image').model).toBe('doubao-seedream-5-0-pro-260628');
    expect(createDefaultForm('image-to-image').model).toBe('doubao-seedream-5-0-pro-260628');
  });

  it('applies Doubao Seedream sizes to the Pro model in both image capabilities', () => {
    const imageForm = createDefaultForm('image');
    imageForm.model = 'doubao-seedream-5-0-pro-260628';
    imageForm.size = '1024x1024';

    expect(buildCapabilityPayload('image', imageForm)).toMatchObject({
      model: 'doubao-seedream-5-0-pro-260628',
      size: '2848x1600',
    });

    const editForm = createDefaultForm('image-to-image');
    editForm.model = 'doubao-seedream-5-0-pro-260628';
    editForm.imageURL = 'https://example.com/reference.png';
    editForm.size = '1024x1024';

    expect(buildCapabilityPayload('image-to-image', editForm)).toMatchObject({
      model: 'doubao-seedream-5-0-pro-260628',
      image_urls: ['https://example.com/reference.png'],
      size: '2848x1600',
    });
  });

  it('builds image-to-image payload with image_urls from reference image URLs', () => {
    const form = createDefaultForm('image-to-image');
    form.prompt = 'turn it into a watercolor style';
    form.imageURL = 'https://example.com/cat.png';
    form.imageBase64List = ['data:image/png;base64,ZmFrZQ=='];

    expect(buildCapabilityPayload('image-to-image', form)).toEqual({
      model: 'doubao-seedream-5-0-pro-260628',
      prompt: 'turn it into a watercolor style',
      image_urls: ['https://example.com/cat.png'],
      size: '2848x1600',
      quality: 'standard',
      n: 1,
    });
  });

  it('requires at least one reference image for image-to-image payloads', () => {
    const form = createDefaultForm('image-to-image');
    form.imageURL = '';
    form.imageFile = null;

    expect(() => buildCapabilityPayload('image-to-image', form)).toThrow('请提供参考图：上传 image 图片或填写参考图 URL');
  });

  it('includes uploaded image file in image-to-image payload', () => {
    const form = createDefaultForm('image-to-image');
    form.prompt = 'same style';
    form.imageURL = '';
    form.imageFile = new File([new Uint8Array([1, 2, 3])], 'reference.png', { type: 'image/png' });

    const payload = buildCapabilityPayload('image-to-image', form);

    expect(payload.image_urls).toBeUndefined();
    expect(payload.image).toBeInstanceOf(File);
    expect(payload.image.name).toBe('reference.png');
  });

  it('includes both uploaded image and image_urls when both provided', () => {
    const form = createDefaultForm('image-to-image');
    form.prompt = 'same style';
    form.imageURL = 'https://example.com/cat.png';
    form.imageFile = new File([new Uint8Array([1])], 'reference.png', { type: 'image/png' });

    const payload = buildCapabilityPayload('image-to-image', form);

    expect(payload.image_urls).toEqual(['https://example.com/cat.png']);
    expect(payload.image).toBeInstanceOf(File);
  });

  it('ignores legacy binary image[] fields for image-to-image', () => {
    const form = createDefaultForm('image-to-image');
    form.prompt = 'same style';
    form.imageURL = 'https://example.com/cat.png';
    form.imageBase64List = ['data:image/png;base64,ZmFrZQ=='];
    form.imageBinaryFiles = [new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' })];

    const payload = buildCapabilityPayload('image-to-image', form);

    expect(payload.image_urls).toEqual(['https://example.com/cat.png']);
    expect(payload.image).toBeUndefined();
    expect(payload['image[]']).toBeUndefined();
  });

  it('uses image_urls when no binary files exist', () => {
    const form = createDefaultForm('image-to-image');
    form.prompt = 'same style';
    form.imageURL = 'https://example.com/cat.png';

    const payload = buildCapabilityPayload('image-to-image', form);

    expect(payload.image_urls).toEqual(['https://example.com/cat.png']);
    expect(payload.image).toBeUndefined();
    expect(payload['image[]']).toBeUndefined();
  });

  it('defaults image-to-image requests to multipart', () => {
    const form = createDefaultForm('image-to-image');

    expect(resolveRequestContentType('image-to-image', form.model, form)).toBe('multipart');

    const videoForm = createDefaultForm('video');
    expect(resolveRequestContentType('video', videoForm.model, videoForm)).toBe('multipart');
  });

  it('uses Seedream minimum image size when selected', () => {
    const form = createDefaultForm('image');
    form.model = 'ByteDance-Seedream-5.0';
    form.size = '1024x1024';

    expect(buildCapabilityPayload('image', form)).toEqual({
      model: 'ByteDance-Seedream-5.0',
      prompt: '一只跑的 橘猫',
      size: '1920x1920',
      quality: 'standard',
      n: 1,
    });
  });

  it('builds chat audio payload for cosyvoice-v3-flash by default with narration prefix', () => {
    const form = createDefaultForm('audio');
    form.input = '测试语音';

    expect(form.model).toBe('cosyvoice-v3-flash');
    expect(buildCapabilityPayload('audio', form)).toEqual({
      model: 'cosyvoice-v3-flash',
      modalities: ['text', 'audio'],
      audio: {
        voice: 'longanwen_v3',
        format: 'mp3',
      },
      messages: [
        { role: 'user', content: `${AUDIO_MODE_PREFIXES.narration}\n\n测试语音` },
      ],
    });
  });

  it('prepends dialogue prefix when audio mode is dialogue', () => {
    const form = createDefaultForm('audio');
    form.mode = 'dialogue';
    form.input = '测试语音';

    expect(buildCapabilityPayload('audio', form)).toEqual({
      model: 'cosyvoice-v3-flash',
      modalities: ['text', 'audio'],
      audio: {
        voice: 'longanwen_v3',
        format: 'mp3',
      },
      messages: [
        { role: 'user', content: `${AUDIO_MODE_PREFIXES.dialogue}\n\n测试语音` },
      ],
    });
  });

  it('defaults audio voice to longanwen_v3 and exposes cosyvoice voice options', () => {
    expect(createDefaultForm('audio').voice).toBe('longanwen_v3');
    expect(COSYVOICE_VOICES.some((v) => v.voice === 'longanwen_v3')).toBe(true);
  });

  it('uses the virtual avatar request as the video default', () => {
    const form = createDefaultForm('video');

    expect(form).toMatchObject({
      model: 'seedance2.0-满血版02-720p',
      prompt: '保持图片1中虚拟女性的身份、五官和发型一致，她面向镜头自然微笑并缓慢挥手，轻微眨眼，镜头稳定，中景，柔和影棚光，电影质感，高细节',
      size: '1280x720',
      duration: 5,
      fps: 24,
      n: 1,
      imageURL: 'https://b0.bdstatic.com/ugc/oCkIS81PtxUJGhJv6tqHnAa283fc0b5833666bafcb6a44bb5e553a.jpg',
      imageRole: 'reference_image',
    });
    expect(buildCapabilityPayload('video', form)).toEqual({
      model: 'seedance2.0-满血版02-720p',
      prompt: '保持图片1中虚拟女性的身份、五官和发型一致，她面向镜头自然微笑并缓慢挥手，轻微眨眼，镜头稳定，中景，柔和影棚光，电影质感，高细节',
      seconds: 5,
      size: '1280x720',
      image_urls: [
        {
          url: 'https://b0.bdstatic.com/ugc/oCkIS81PtxUJGhJv6tqHnAa283fc0b5833666bafcb6a44bb5e553a.jpg',
          role: 'reference_image',
        },
      ],
    });
  });

  it('builds video payload with the default video model', () => {
    const form = createDefaultForm('video');
    form.prompt = 'cat running';
    form.imageURL = '';
    form.metadataText = '{"seed":123}';

    expect(buildCapabilityPayload('video', form)).toEqual({
      model: 'seedance2.0-满血版02-720p',
      prompt: 'cat running',
      seconds: 5,
      size: '1280x720',
      metadata: {
        seed: 123,
      },
    });
  });

  it('builds JSON video payload for legacy video models', () => {
    const form = createDefaultForm('video');
    form.model = 'viduq3-pro';
    form.prompt = 'cat running';
    form.imageURL = '';
    form.duration = 2;
    form.metadataText = '{"seed":123}';

    expect(buildCapabilityPayload('video', form)).toEqual({
      model: 'viduq3-pro',
      prompt: 'cat running',
      seconds: 2,
      size: '1280x720',
      metadata: {
        seed: 123,
      },
    });
  });

  it('keeps the selected video size as a size form field', () => {
    const form = createDefaultForm('video');
    form.model = 'viduq3-pro';
    form.duration = 2;
    form.size = '960x540';

    expect(buildCapabilityPayload('video', form)).toMatchObject({
      seconds: 2,
      size: '960x540',
    });
  });

  it('builds Doubao Seedance payload with OpenAI video form fields', () => {
    const form = createDefaultForm('video');
    form.model = 'doubao-seedance-2-0-260128';
    form.prompt = 'cat running';
    form.imageURL = '';
    form.duration = 6;
    form.metadataText = '{"generate_audio":true}';

    expect(buildCapabilityPayload('video', form)).toEqual({
      model: 'doubao-seedance-2-0-260128',
      prompt: 'cat running',
      seconds: 6,
      size: '1280x720',
      metadata: {
        generate_audio: true,
      },
    });
  });

  it('normalizes Doubao Seedance duration to the supported t2v range', () => {
    const form = createDefaultForm('video');
    form.model = 'doubao-seedance-2-0-260128';
    form.prompt = 'cat running';
    form.duration = 2;

    expect(getDurationConstraints('doubao-seedance-2-0-260128')).toEqual({
      min: 4,
      max: 15,
      fallback: 5,
    });
    expect(buildCapabilityPayload('video', form)).toMatchObject({
      model: 'doubao-seedance-2-0-260128',
      seconds: 5,
    });
    expect(buildCapabilityPayload('video', form)).not.toHaveProperty('duration');
  });

  it('applies Doubao Seedance standard duration constraints to the default full 02 720p model', () => {
    const form = createDefaultForm('video');
    form.prompt = 'cat running';
    form.duration = 2;

    expect(getDurationConstraints('seedance2.0-满血版02-720p')).toEqual({
      min: 4,
      max: 15,
      fallback: 5,
    });
    expect(buildCapabilityPayload('video', form)).toMatchObject({
      model: 'seedance2.0-满血版02-720p',
      seconds: 5,
    });
  });

  it.each([
    'seedance2.0-满血版01',
    'seedance2.0-满血版01-fast',
    'seedance2.0-满血版02',
    'seedance2.0-满血版02-1080p',
    'seedance2.0-满血版03',
    'seedance2.0-满血版03-fast',
    'seedance2.0-满血版03-mini',
  ])('applies Doubao Seedance standard duration constraints to %s', (model) => {
    const form = createDefaultForm('video');
    form.model = model;
    form.prompt = 'cat running';
    form.duration = 2;

    expect(getDurationConstraints(model)).toEqual({
      min: 4,
      max: 15,
      fallback: 5,
    });
    expect(buildCapabilityPayload('video', form)).toMatchObject({
      model,
      seconds: 5,
    });
    expect(buildCapabilityPayload('video', form)).not.toHaveProperty('duration');
  });

  it('applies Doubao Seedance standard duration constraints to the mini 260615 model', () => {
    const form = createDefaultForm('video');
    form.model = 'doubao-seedance-2-0-mini-260615';
    form.prompt = 'cat running';
    form.duration = 2;

    expect(getDurationConstraints('doubao-seedance-2-0-mini-260615')).toEqual({
      min: 4,
      max: 15,
      fallback: 5,
    });
    expect(buildCapabilityPayload('video', form)).toMatchObject({
      model: 'doubao-seedance-2-0-mini-260615',
      seconds: 5,
    });
    expect(buildCapabilityPayload('video', form)).not.toHaveProperty('duration');
  });

  it('builds video payload with image_urls objects from URL references', () => {
    const form = createDefaultForm('video');
    form.model = 'doubao-seedance-2-0-260128';
    form.prompt = 'cat running';
    form.duration = 6;
    form.imageURL = 'https://example.com/cat.png\nhttps://example.com/dog.png';
    form.imageRole = 'first_frame';

    expect(buildCapabilityPayload('video', form)).toEqual({
      model: 'doubao-seedance-2-0-260128',
      prompt: 'cat running',
      seconds: 6,
      size: '1280x720',
      image_urls: [
        { url: 'https://example.com/cat.png', role: 'first_frame' },
        { url: 'https://example.com/dog.png', role: 'first_frame' },
      ],
    });
  });

  it('builds video upload images as image form fields', () => {
    const form = createDefaultForm('video');
    const first = new File([new Uint8Array([1])], 'first.png', { type: 'image/png' });
    const second = new File([new Uint8Array([2])], 'second.jpg', { type: 'image/jpeg' });
    form.model = 'doubao-seedance-2-0-fast-260128';
    form.prompt = 'cat running';
    form.imageURL = '';
    form.imageBase64List = [first, second];

    const payload = buildCapabilityPayload('video', form);

    expect(payload.image).toEqual([first, second]);
    expect(payload.images).toBeUndefined();
    expect(payload.image_urls).toBeUndefined();
  });

  it('keeps input_reference files separate from image fields', () => {
    const form = createDefaultForm('video');
    form.model = 'doubao-seedance-2-0-fast-260128';
    form.prompt = 'cat running';
    form.imageURL = 'https://example.com/cat.png';
    form.inputReferenceFiles = ['data:image/png;base64,ZmFrZQ=='];

    expect(buildCapabilityPayload('video', form)).toMatchObject({
      model: 'doubao-seedance-2-0-fast-260128',
      image_urls: [
        { url: 'https://example.com/cat.png', role: 'reference_image' },
      ],
      input_reference: [
        'data:image/png;base64,ZmFrZQ==',
      ],
    });
  });

  it('collects multiple reference images into input_reference array fields', () => {
    const form = createDefaultForm('video');
    form.model = 'doubao-seedance-2-0-fast-260128';
    form.prompt = 'cat running';
    form.inputReferenceFiles = [
      'data:image/png;base64,Zmlyc3Q=',
      'data:image/jpeg;base64,c2Vjb25k',
    ];

    expect(buildCapabilityPayload('video', form)).toMatchObject({
      model: 'doubao-seedance-2-0-fast-260128',
      input_reference: [
        'data:image/png;base64,Zmlyc3Q=',
        'data:image/jpeg;base64,c2Vjb25k',
      ],
    });
  });

  it.each([
    'viduq3-pro',
    'viduq3-turbo',
    'kling-v3',
    'veo-3.1-generate-preview',
    'veo-3.1-fast-generate-preview',
    'grok-imagine-video',
  ])('adds optional submitted images to %s video payloads', (model) => {
    const form = createDefaultForm('video');
    form.model = model;
    form.prompt = 'cat running';
    form.duration = 6;
    form.imageURL = 'https://example.com/cat.png\nhttps://example.com/dog.png';
    const first = new File([new Uint8Array([1])], 'first.png', { type: 'image/png' });
    const second = new File([new Uint8Array([2])], 'second.jpg', { type: 'image/jpeg' });
    form.imageBase64List = [first, second];

    expect(buildCapabilityPayload('video', form)).toMatchObject({
      model,
      image_urls: [
        { url: 'https://example.com/cat.png', role: 'reference_image' },
        { url: 'https://example.com/dog.png', role: 'reference_image' },
      ],
      image: [first, second],
    });
    expect(buildCapabilityPayload('video', form).images).toBeUndefined();
  });

  it('uses New API compatible defaults', () => {
    expect(getCapability('text').defaultPath).toBe('/v1/chat/completions');
    expect(getCapability('image').defaultPath).toBe('/v1/images/generations');
    expect(getCapability('audio').defaultPath).toBe('/v1/chat/completions');
    expect(getCapability('video').defaultPath).toBe('/v1/videos');
    expect(getCapability('video').contentType).toBe('multipart');
    expect(getCapability('text').models).toEqual([
      'deepseek-v4-flash-260425',
      'deepseek-v4-flash',
    ]);
    expect(getCapability('image').models).toEqual([
      'doubao-seedream-5-0-260128',
      'doubao-seedream-5-0-pro-260628',
      'gemini-3.1-flash-image-preview-sp',
      'ByteDance-Seedream-5.0',
    ]);
    expect(getCapability('image-to-image').defaultPath).toBe('/v1/images/edits');
    expect(getCapability('image-to-image').models).toEqual([
      'doubao-seedream-5-0-260128',
      'doubao-seedream-5-0-pro-260628',
    ]);
    expect(getCapability('video').models).toEqual([
      'seedance2.0-满血版02-720p',
      'seedance2.0-满血版02-1080p',
      'doubao-seedance-2.0',
      'Seedance2.0-720p',
      'Seedance2.0-1080p',
      'Seedance2.5-720p',
    ]);
    expect(getCapability('audio').models).toEqual(['cosyvoice-v3-flash']);
  });

  it('uses chat completions defaults for the qwen3 audio model', () => {
    expect(createDefaultForm('audio').model).toBe('cosyvoice-v3-flash');
    expect(getModelRequestConfig('audio', 'cosyvoice-v3-flash')).toEqual({
      defaultPath: '/v1/chat/completions',
      contentType: 'json',
      taskPath: '/v1/videos',
    });
  });

  it.each([
    'viduq3-pro',
    'kling-v3',
    'veo-3.1-generate-preview',
    'grok-imagine-video',
    'doubao-seedance-2-0',
    'doubao-seedance-2.0',
    'doubao-seedance-2.0-test',
    'Seedance2.0-720p',
    'Seedance2.0-1080p',
    'Seedance2.5-720p',
    'doubao-seedance-2-0-260128',
    'doubao-seedance-2-0-fast-260128',
    'doubao-seedance-2-0-mini-260615',
    'seedance2.0-满血版01',
    'seedance2.0-满血版01-fast',
    'seedance2.0-满血版02',
    'seedance2.0-满血版02-720p',
    'seedance2.0-满血版02-1080p',
    'seedance2.0-满血版03',
    'seedance2.0-满血版03-fast',
    'seedance2.0-满血版03-mini',
  ])('uses /v1/videos multipart defaults for %s', (model) => {
    expect(getModelRequestConfig('video', model)).toEqual({
      defaultPath: '/v1/videos',
      contentType: 'multipart',
      taskPath: '/v1/videos',
    });
  });

  it('builds Grok Imagine video payload for the /v1/videos endpoint', () => {
    const form = createDefaultForm('video');
    form.model = 'grok-imagine-video';
    form.prompt = 'cat running';
    form.imageURL = '';
    form.duration = 2;

    expect(buildCapabilityPayload('video', form)).toEqual({
      model: 'grok-imagine-video',
      prompt: 'cat running',
      seconds: 2,
      size: '1280x720',
    });
  });

  it.each([
    'doubao-seedance-2-0',
    'doubao-seedance-2.0',
    'doubao-seedance-2.0-test',
    'Seedance2.0-720p',
    'Seedance2.0-1080p',
    'Seedance2.5-720p',
  ])('builds Seedance payload for the short model name %s', (model) => {
    const form = createDefaultForm('video');
    form.model = model;
    form.prompt = 'cat running';
    form.duration = 2;

    expect(getDurationConstraints(model)).toEqual({
      min: 4,
      max: 15,
      fallback: 5,
    });
    expect(buildCapabilityPayload('video', form)).toMatchObject({
      model,
      size: '1280x720',
      seconds: 5,
    });
  });

  it('normalizes Veo 3.1 video duration to the supported range', () => {
    const form = createDefaultForm('video');
    form.model = 'veo-3.1-fast-generate-preview';
    form.prompt = 'cat running';
    form.duration = 2;

    expect(buildCapabilityPayload('video', form)).toMatchObject({
      model: 'veo-3.1-fast-generate-preview',
      seconds: 4,
    });
  });

  it('exposes Veo 3.1 duration constraints for the video form', () => {
    expect(getDurationConstraints('veo-3.1-generate-preview')).toEqual({
      min: 4,
      max: 8,
      fallback: 4,
    });
    expect(getDurationConstraints('veo-3.1-fast-generate-preview')).toEqual({
      min: 4,
      max: 8,
      fallback: 4,
    });
    expect(getDurationConstraints('veo_3_1-fast')).toEqual({
      min: 4,
      max: 8,
      fallback: 4,
    });
  });
});
