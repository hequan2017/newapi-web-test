import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount as vueMount } from '@vue/test-utils';
import App from './App.vue';
import * as api from './api';
import { AUDIO_MODE_PREFIXES } from './modelPresets';

function mount(...args) {
  const wrapper = vueMount(...args);
  wrapper.vm.apiBase = 'https://api.test.invalid';
  wrapper.vm.apiKey = 'test-api-key';
  return wrapper;
}

describe('model test platform', () => {
  beforeEach(() => {
    const storage = {};
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key) => storage[key] || null),
        setItem: vi.fn((key, value) => {
          storage[key] = String(value);
        }),
      },
    });
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows five New API model capability tabs', () => {
    const wrapper = mount(App);

    expect(wrapper.findAll('[data-test="capability-tab"]').map((item) => item.text())).toEqual([
      '文字',
      '文生图',
      '图生图',
      '语音',
      '视频',
    ]);
  });

  it('renders the intelligent lab command center shell', () => {
    const wrapper = mount(App);

    expect(wrapper.get('.topbar-brand h1').text()).toBe('模型实验室');
    expect(wrapper.get('.topbar-subtitle').text()).toContain('多模态模型调试');
    expect(wrapper.get('.app-shell').exists()).toBe(true);
    expect(wrapper.get('.capability-rail').exists()).toBe(true);
    expect(wrapper.get('.capability-rail').findAll('.rail-icon svg')).toHaveLength(7);
    expect(wrapper.get('.runtime-overview').findAll('.runtime-card')).toHaveLength(4);
    expect(wrapper.get('.config-console').exists()).toBe(true);
    expect(wrapper.get('.output-monitor').exists()).toBe(true);
  });

  it('uses the light theme by default and persists manual dark theme switching', async () => {
    const wrapper = mount(App);
    const themeToggle = wrapper.get('[data-test="theme-toggle"]');

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(themeToggle.attributes('aria-pressed')).toBe('false');
    expect(themeToggle.text()).toContain('深色外观');

    await themeToggle.trigger('click');

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(themeToggle.attributes('aria-pressed')).toBe('true');
    expect(themeToggle.text()).toContain('浅色外观');
    expect(window.localStorage.setItem).toHaveBeenCalledWith('newapi-model-test-theme', 'dark');
  });

  it('uses Chinese by default and persists manual English switching', async () => {
    const wrapper = mount(App);
    const languageToggle = wrapper.get('[data-test="language-toggle"]');

    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.title).toBe('模型实验室 · New API');
    expect(languageToggle.attributes('aria-pressed')).toBe('false');
    expect(languageToggle.text()).toContain('English');
    expect(wrapper.get('.topbar-brand h1').text()).toBe('模型实验室');

    await languageToggle.trigger('click');

    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Model Lab · New API');
    expect(languageToggle.attributes('aria-pressed')).toBe('true');
    expect(languageToggle.text()).toContain('中文');
    expect(wrapper.get('.topbar-brand h1').text()).toBe('Model Lab');
    expect(wrapper.get('[data-capability="text"]').text()).toContain('Text');
    expect(wrapper.get('[data-test="history-workspace-button"]').text()).toContain('History');
    expect(window.localStorage.setItem).toHaveBeenCalledWith('newapi-model-test-language', 'en');

    wrapper.unmount();
    const restoredWrapper = mount(App);
    expect(restoredWrapper.get('.topbar-brand h1').text()).toBe('Model Lab');
  });

  it('keeps one visible main landmark across all workspaces', async () => {
    const wrapper = mount(App);

    expect(wrapper.findAll('main')).toHaveLength(1);
    expect(wrapper.get('.workspace-shell').element.tagName).toBe('MAIN');

    await wrapper.get('[data-test="history-workspace-button"]').trigger('click');
    expect(wrapper.get('.workspace-shell').attributes('hidden')).toBeUndefined();

    await wrapper.get('[data-test="matrix-workspace-button"]').trigger('click');
    expect(wrapper.get('.workspace-shell').attributes('hidden')).toBeUndefined();
  });

  it('switches between generator, history, and matrix workspaces', async () => {
    const wrapper = mount(App);

    expect(wrapper.get('[data-test="generator-workspace"]').attributes('hidden')).toBeUndefined();
    expect(wrapper.get('[data-test="history-workspace"]').attributes('hidden')).toBe('');
    expect(wrapper.get('[data-test="matrix-workspace"]').attributes('hidden')).toBe('');

    await wrapper.get('[data-test="history-workspace-button"]').trigger('click');
    expect(wrapper.vm.activeWorkspace).toBe('history');
    expect(wrapper.get('[data-test="generator-workspace"]').attributes('hidden')).toBe('');
    expect(wrapper.get('[data-test="history-workspace"]').attributes('hidden')).toBeUndefined();

    await wrapper.get('[data-test="matrix-workspace-button"]').trigger('click');
    expect(wrapper.get('[data-test="history-workspace"]').attributes('hidden')).toBe('');
    expect(wrapper.get('[data-test="matrix-workspace"]').attributes('hidden')).toBeUndefined();
  });

  it('returns to the generator workspace when a capability is selected', async () => {
    const wrapper = mount(App);

    await wrapper.get('[data-test="history-workspace-button"]').trigger('click');
    await wrapper.get('[data-capability="image"]').trigger('click');

    expect(wrapper.vm.activeWorkspace).toBe('generator');
    expect(wrapper.vm.activeCapabilityId).toBe('image');
    expect(wrapper.get('[data-test="generator-workspace"]').attributes('hidden')).toBeUndefined();
  });

  it('opens a history item in the generator workspace without clearing restored data', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ choices: [{ message: { content: '历史响应' } }] });
    const wrapper = mount(App);

    await wrapper.get('[data-capability="text"]').trigger('click');
    wrapper.vm.form.prompt = '需要恢复的提示词';
    await wrapper.vm.submitFormTask();
    wrapper.vm.form.prompt = '临时修改';

    await wrapper.get('[data-test="history-workspace-button"]').trigger('click');
    await wrapper.get('[data-test="load-history-item"]').trigger('click');

    expect(wrapper.vm.activeWorkspace).toBe('generator');
    expect(wrapper.vm.form.prompt).toBe('需要恢复的提示词');
    expect(wrapper.vm.rawResponse).toEqual({ choices: [{ message: { content: '历史响应' } }] });
    expect(wrapper.get('[data-test="generator-workspace"]').attributes('hidden')).toBeUndefined();
  });

  it('updates endpoint and form defaults when capability changes', async () => {
    const wrapper = mount(App);

    expect(wrapper.vm.activeCapabilityId).toBe('video');
    expect(wrapper.vm.form.model).toBe('seedance2.0-满血版02-720p');
    expect(wrapper.vm.form.duration).toBe(5);
    expect(wrapper.vm.requestPath).toBe('/v1/videos');

    await wrapper.find('[data-capability="image"]').trigger('click');

    expect(wrapper.vm.activeCapabilityId).toBe('image');
    expect(wrapper.vm.requestPath).toBe('/v1/images/generations');
    expect(wrapper.vm.form.model).toBe('doubao-seedream-5-0-pro-260628');

    await wrapper.find('[data-capability="audio"]').trigger('click');

    expect(wrapper.vm.activeCapabilityId).toBe('audio');
    expect(wrapper.vm.form.model).toBe('cosyvoice-v3-flash');
    expect(wrapper.vm.requestPath).toBe('/v1/chat/completions');
  });

  it('shows native Gemini endpoint for Gemini image models', async () => {
    const wrapper = mount(App);
    wrapper.vm.apiBase = '/api';

    await wrapper.find('[data-capability="image"]').trigger('click');
    wrapper.vm.form.model = 'gemini-3.1-flash-image-preview-sp';
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.endpointURL).toBe('/api/v1beta/models/gemini-3.1-flash-image-preview-sp:generateContent');
  });

  it('shows OpenAI image endpoint for non-Gemini image models', async () => {
    const wrapper = mount(App);
    wrapper.vm.apiBase = '/api';

    await wrapper.find('[data-capability="image"]').trigger('click');
    wrapper.vm.form.model = 'ByteDance-Seedream-5.0';
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.endpointURL).toBe('/api/v1/images/generations');
  });

  it('renders Gemini inline image data as an image URL', async () => {
    const wrapper = mount(App);
    await wrapper.find('[data-capability="image"]').trigger('click');

    wrapper.vm.rawResponse = {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'iVBORw0KGgoAAAANSU',
                },
              },
            ],
          },
        },
      ],
    };
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.imageURLs).toEqual(['data:image/png;base64,iVBORw0KGgoAAAANSU']);
  });

  it('renders OpenAI image response URLs and base64 data', async () => {
    const wrapper = mount(App);
    await wrapper.find('[data-capability="image"]').trigger('click');

    wrapper.vm.rawResponse = {
      data: [
        { url: 'https://example.com/image.png' },
        { b64_json: 'b3BlbmFpLWltYWdl' },
      ],
    };
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.imageURLs).toEqual([
      'https://example.com/image.png',
      'data:image/png;base64,b3BlbmFpLWltYWdl',
    ]);
  });

  it('shows a direct image download button for generated images', async () => {
    const wrapper = mount(App);
    await wrapper.find('[data-capability="image"]').trigger('click');

    wrapper.vm.rawResponse = {
      data: [
        { url: 'https://example.com/image.png' },
      ],
    };
    await wrapper.vm.$nextTick();

    const download = wrapper.get('[data-test="download-image-link"]');
    expect(download.attributes('href')).toBe('https://example.com/image.png');
    expect(download.attributes('download')).toBe('generated-image.png');
  });
  it('submits image-to-image requests with reference image_urls', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ data: [{ url: 'https://example.com/output.png' }] });
    const wrapper = mount(App);

    await wrapper.find('[data-capability="image-to-image"]').trigger('click');
    wrapper.vm.form.prompt = 'turn it into a watercolor style';
    wrapper.vm.form.imageURL = 'https://example.com/cat.png';
    await wrapper.vm.submitFormTask();

    expect(wrapper.vm.activeCapabilityId).toBe('image-to-image');
    expect(api.sendModelRequest).toHaveBeenCalledWith(expect.objectContaining({
      path: '/v1/images/edits',
      contentType: 'multipart',
      payload: expect.objectContaining({
        model: 'doubao-seedream-5-0-pro-260628',
        prompt: 'turn it into a watercolor style',
        image_urls: ['https://example.com/cat.png'],
        size: '2848x1600',
      }),
    }));
    expect(wrapper.vm.imageURLs).toEqual(['https://example.com/output.png']);
  });

  it('does not render legacy image-to-image binary image[] input', async () => {
    const wrapper = mount(App);

    await wrapper.find('[data-capability="image-to-image"]').trigger('click');

    expect(wrapper.find('[data-test="image-binary-input"]').exists()).toBe(false);
  });

  it('updates request path input when switching image models', async () => {
    const wrapper = mount(App);

    await wrapper.find('[data-capability="image"]').trigger('click');
    expect(wrapper.vm.requestPath).toBe('/v1/images/generations');

    wrapper.vm.form.model = 'ByteDance-Seedream-5.0';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.requestPath).toBe('/v1/images/generations');

    wrapper.vm.form.model = 'gemini-3.1-flash-image-preview-sp';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.requestPath).toBe('/v1beta/models/gemini-3.1-flash-image-preview-sp:generateContent');
  });

  it('submits Doubao Seedance standard form requests to /v1/videos as multipart', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ id: 'video_1', status: 'submitted' });
    vi.spyOn(api, 'getTaskStatus').mockResolvedValue({ id: 'video_1', status: 'completed' });
    vi.spyOn(api, 'getVideoContent').mockResolvedValue({
      type: 'blob',
      mimeType: 'video/mp4',
      size: 4,
      url: 'blob:video_1',
    });
    const wrapper = mount(App);

    wrapper.vm.form.model = 'doubao-seedance-2-0-260128';
    wrapper.vm.form.prompt = 'cat running';
    wrapper.vm.form.imageURL = 'https://example.com/cat.png';
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.requestPath).toBe('/v1/videos');
    expect(wrapper.vm.form.duration).toBe(5);

    await wrapper.vm.submitFormTask();

    expect(api.sendModelRequest).toHaveBeenCalledWith(expect.objectContaining({
      path: '/v1/videos',
      contentType: 'multipart',
      payload: expect.objectContaining({
        model: 'doubao-seedance-2-0-260128',
        prompt: 'cat running',
        seconds: 5,
        size: '1280x720',
        image_urls: [
          { url: 'https://example.com/cat.png', role: 'reference_image' },
        ],
      }),
    }));
    expect(wrapper.vm.lastContentType).toBe('multipart');

    await wrapper.vm.refreshTask();

    expect(api.getTaskStatus).toHaveBeenCalledWith(expect.objectContaining({
      taskID: 'video_1',
      path: '/v1/videos',
    }));
  });

  it('uses Seedance task_id for polling and generated video content URL', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({
      id: 'task_create_wrapper',
      task_id: 'task_real_video',
      model: 'doubao-seedance-2-0-260128',
      status: 'in_progress',
      progress: 50,
      metadata: { url: '' },
    });
    vi.spyOn(api, 'getTaskStatus').mockResolvedValue({
      id: 'task_create_wrapper',
      task_id: 'task_real_video',
      model: 'doubao-seedance-2-0-260128',
      status: 'completed',
      metadata: { url: '' },
    });
    vi.spyOn(api, 'getVideoContent').mockResolvedValue({
      type: 'blob',
      mimeType: 'video/mp4',
      size: 4,
      url: 'blob:task_real_video',
    });
    const wrapper = mount(App);
    wrapper.vm.apiBase = '/api';

    wrapper.vm.form.model = 'doubao-seedance-2-0-260128';
    await wrapper.vm.$nextTick();
    await wrapper.vm.submitFormTask();

    expect(wrapper.vm.currentTask.id).toBe('task_real_video');

    await wrapper.vm.refreshTask();

    expect(api.getTaskStatus).toHaveBeenCalledWith(expect.objectContaining({
      taskID: 'task_real_video',
      path: '/v1/videos',
    }));
    expect(wrapper.vm.videoURL).toBe('blob:task_real_video');
  });

  it('polls and plays new-api wrapped video task responses', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({
      code: 'success',
      message: '',
      data: { task_id: 'task_R2oMXp29', status: 'IN_PROGRESS', progress: '50%' },
    });
    vi.spyOn(api, 'getTaskStatus').mockResolvedValue({
      code: 'success',
      message: '',
      data: {
        task_id: 'task_R2oMXp29',
        status: 'SUCCESS',
        progress: '100%',
        result_url: 'https://example.com/video.mp4',
      },
    });
    const wrapper = mount(App);
    wrapper.vm.form.model = 'doubao-seedance-2-0-fast-260128';
    await wrapper.vm.$nextTick();
    await wrapper.vm.submitFormTask();

    expect(wrapper.vm.currentTask.id).toBe('task_R2oMXp29');

    await wrapper.vm.refreshTask();

    expect(api.getTaskStatus).toHaveBeenCalledWith(expect.objectContaining({
      taskID: 'task_R2oMXp29',
      path: '/v1/videos',
    }));
    expect(wrapper.vm.statusKind).toBe('ok');
    expect(wrapper.vm.videoURL).toBe('https://example.com/video.mp4');
  });

  it('auto polls video task status every 5 seconds until terminal status', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({
      task_id: 'task_1',
      status: 'submitted',
    });
    vi.spyOn(api, 'getTaskStatus').mockResolvedValue({
      task_id: 'task_1',
      status: 'completed',
      result_url: 'https://example.com/video.mp4',
    });
    vi.spyOn(api, 'getVideoContent').mockRejectedValue(new Error('content unavailable'));
    const wrapper = mount(App);

    await wrapper.vm.submitFormTask();

    expect(api.getTaskStatus).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4999);
    expect(api.getTaskStatus).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(api.getTaskStatus).toHaveBeenCalledTimes(1);
    expect(api.getTaskStatus).toHaveBeenCalledWith(expect.objectContaining({
      taskID: 'task_1',
      path: '/v1/videos',
    }));
    expect(wrapper.vm.statusKind).toBe('ok');
    expect(wrapper.vm.videoURL).toBe('https://example.com/video.mp4');

    await vi.advanceTimersByTimeAsync(5000);
    expect(api.getTaskStatus).toHaveBeenCalledTimes(1);
  });

  it('continues auto polling non-terminal video tasks every 5 seconds', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({
      task_id: 'task_1',
      status: 'queued',
      progress: 0,
    });
    vi.spyOn(api, 'getTaskStatus')
      .mockResolvedValueOnce({
        task_id: 'task_1',
        status: 'PROCESSING',
        progress: 50,
      })
      .mockResolvedValueOnce({
        task_id: 'task_1',
        status: 'PROCESSING',
        progress: 50,
      })
      .mockResolvedValueOnce({
        task_id: 'task_1',
        status: 'completed',
        result_url: 'https://example.com/video.mp4',
      });
    vi.spyOn(api, 'getVideoContent').mockRejectedValue(new Error('content unavailable'));
    const wrapper = mount(App);

    await wrapper.vm.submitFormTask();

    await vi.advanceTimersByTimeAsync(5000);
    expect(api.getTaskStatus).toHaveBeenCalledTimes(1);
    expect(wrapper.vm.currentTask.status).toBe('processing');

    await vi.advanceTimersByTimeAsync(4999);
    expect(api.getTaskStatus).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(api.getTaskStatus).toHaveBeenCalledTimes(2);
    expect(wrapper.vm.currentTask.status).toBe('processing');

    await vi.advanceTimersByTimeAsync(5000);
    expect(api.getTaskStatus).toHaveBeenCalledTimes(3);
    expect(wrapper.vm.statusKind).toBe('ok');
    expect(wrapper.vm.videoURL).toBe('https://example.com/video.mp4');

    await vi.advanceTimersByTimeAsync(5000);
    expect(api.getTaskStatus).toHaveBeenCalledTimes(3);
  });

  it('shows immediate feedback when clicking refresh status', async () => {
    vi.useFakeTimers();
    let resolveStatus;
    const statusPromise = new Promise((resolve) => {
      resolveStatus = resolve;
    });
    vi.spyOn(api, 'getTaskStatus').mockReturnValue(statusPromise);
    const wrapper = mount(App);
    wrapper.vm.currentTask = {
      id: 'task_1',
      status: 'processing',
      progress: 50,
    };
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-test="refresh-task-button"]').trigger('click');

    expect(api.getTaskStatus).toHaveBeenCalledWith(expect.objectContaining({
      taskID: 'task_1',
      path: '/v1/videos',
    }));
    expect(wrapper.vm.statusKind).toBe('running');
    expect(wrapper.vm.statusText).toBe('正在刷新状态');

    resolveStatus({
      task_id: 'task_1',
      status: 'PROCESSING',
      progress: 60,
    });
    await statusPromise;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.currentTask.progress).toBe(60);
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.getTaskStatus).toHaveBeenCalledTimes(2);
  });

  it('parses new-api string progress for the video progress bar', async () => {
    const wrapper = mount(App);
    wrapper.vm.currentTask = {
      id: 'task_1',
      status: 'in_progress',
      progress: '50%',
    };
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.taskProgressPercent).toBe(50);
  });

  it('submits video image-to-video requests with editable image_urls roles', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ id: 'video_1', status: 'submitted' });
    const wrapper = mount(App);

    wrapper.vm.form.model = 'viduq3-pro';
    wrapper.vm.form.imageURL = 'https://example.com/cat.png\nhttps://example.com/dog.png';
    wrapper.vm.form.imageRole = 'last_frame';
    await wrapper.vm.$nextTick();
    await wrapper.vm.submitFormTask();

    expect(api.sendModelRequest).toHaveBeenCalledWith(expect.objectContaining({
      path: '/v1/videos',
      contentType: 'multipart',
      payload: expect.objectContaining({
        model: 'viduq3-pro',
        image_urls: [
          { url: 'https://example.com/cat.png', role: 'last_frame' },
          { url: 'https://example.com/dog.png', role: 'last_frame' },
        ],
      }),
    }));
  });

  it('does not render video upload image or input_reference file inputs', () => {
    const wrapper = mount(App);

    expect(wrapper.text()).not.toContain('提交图片（可选，可多选）');
    expect(wrapper.text()).not.toContain('input_reference 图片（可选，可多选）');
  });

  it('uses xAI video generation flow for Grok Imagine video tasks', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ request_id: 'video_1', status: 'submitted' });
    vi.spyOn(api, 'getTaskStatus').mockResolvedValue({
      request_id: 'video_1',
      status: 'done',
      video: { url: 'https://example.com/grok.mp4' },
    });
    const wrapper = mount(App);

    wrapper.vm.form.model = 'grok-imagine-video';
    await wrapper.vm.$nextTick();
    await wrapper.vm.submitFormTask();
    await wrapper.vm.refreshTask();

    expect(api.sendModelRequest).toHaveBeenCalledWith(expect.objectContaining({
      path: '/v1/videos',
      contentType: 'multipart',
      payload: expect.objectContaining({
        model: 'grok-imagine-video',
      }),
    }));
    expect(api.getTaskStatus).toHaveBeenCalledWith(expect.objectContaining({
      taskID: 'video_1',
      path: '/v1/videos',
    }));
    expect(wrapper.vm.statusKind).toBe('ok');
    expect(wrapper.vm.videoURL).toBe('https://example.com/grok.mp4');
  });

  it('submits text capability as JSON request', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
    });
    const wrapper = mount(App);

    await wrapper.find('[data-capability="text"]').trigger('click');
    await wrapper.vm.submitFormTask();

    expect(api.sendModelRequest).toHaveBeenCalledWith(expect.objectContaining({
      path: '/v1/chat/completions',
      contentType: 'json',
      payload: expect.objectContaining({
        messages: expect.any(Array),
      }),
    }));
  });

  it('uses chat completions flow for cosyvoice-v3-flash and renders audio preview', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({
      choices: [
        {
          message: {
            audio: {
              data: 'ZmFrZS1hdWRpbw==',
              format: 'mp3',
            },
          },
        },
      ],
    });
    const wrapper = mount(App);

    await wrapper.find('[data-capability="audio"]').trigger('click');
    wrapper.vm.form.input = '测试语音';
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.requestPath).toBe('/v1/chat/completions');

    await wrapper.vm.submitFormTask();

    expect(api.sendModelRequest).toHaveBeenCalledWith(expect.objectContaining({
      path: '/v1/chat/completions',
      contentType: 'json',
      payload: {
        model: 'cosyvoice-v3-flash',
        modalities: ['text', 'audio'],
        audio: {
          voice: 'longanwen_v3',
          format: 'mp3',
        },
        messages: [
          { role: 'user', content: `${AUDIO_MODE_PREFIXES.narration}\n\n测试语音` },
        ],
      },
    }));
    expect(wrapper.find('audio.audio-player').attributes('src')).toBe('data:audio/mp3;base64,ZmFrZS1hdWRpbw==');
  });

  it('keeps Doubao Seedance manual JSON submissions as JSON requests', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ task_id: 'task_1', status: 'submitted' });
    const wrapper = mount(App);

    wrapper.vm.form.model = 'doubao-seedance-2-0-260128';
    await wrapper.vm.$nextTick();
    wrapper.vm.jsonPayloadText = JSON.stringify({
      model: 'doubao-seedance-2-0-260128',
      prompt: 'cat running',
      duration: 5,
      size: '16:9',
      resolution: '720p',
    });

    await wrapper.vm.submitJSONTask();

    expect(api.sendModelRequest).toHaveBeenCalledWith(expect.objectContaining({
      path: '/v1/videos',
      contentType: 'json',
      payload: {
        model: 'doubao-seedance-2-0-260128',
        prompt: 'cat running',
        duration: 5,
        size: '16:9',
        resolution: '720p',
      },
    }));
    expect(wrapper.vm.lastContentType).toBe('json');
  });

  it('keeps Doubao Seedance standard manual JSON image inputs unchanged', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ task_id: 'task_1', status: 'submitted' });
    const wrapper = mount(App);

    wrapper.vm.form.model = 'doubao-seedance-2-0-260128';
    await wrapper.vm.$nextTick();
    wrapper.vm.jsonPayloadText = JSON.stringify({
      model: 'doubao-seedance-2-0-260128',
      prompt: 'cat running',
      duration: 5,
      size: '16:9',
      resolution: '720p',
      image_url: [
        { url: 'https://example.com/cat.png', role: 'reference_image' },
        { url: 'data:image/png;base64,ZmFrZQ==', role: 'reference_image' },
      ],
    });

    await wrapper.vm.submitJSONTask();

    expect(api.sendModelRequest).toHaveBeenCalledWith(expect.objectContaining({
      path: '/v1/videos',
      contentType: 'json',
      payload: {
        model: 'doubao-seedance-2-0-260128',
        prompt: 'cat running',
        duration: 5,
        size: '16:9',
        resolution: '720p',
        image_url: [
          { url: 'https://example.com/cat.png', role: 'reference_image' },
          { url: 'data:image/png;base64,ZmFrZQ==', role: 'reference_image' },
        ],
      },
    }));
  });

  it('shows a clear error when cosyvoice response omits audio data', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({
      id: 'chatcmpl_1',
      model: 'cosyvoice-v3-flash',
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
          },
        },
      ],
      usage: {
        completion_tokens_details: {
          audio_tokens: 239,
        },
      },
    });
    const wrapper = mount(App);

    await wrapper.find('[data-capability="audio"]').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.submitFormTask();

    expect(wrapper.vm.statusKind).toBe('error');
    expect(wrapper.vm.statusText).toBe('响应未包含可播放的音频数据');
    expect(wrapper.find('audio.audio-player').exists()).toBe(false);
  });

  it('submits video capability as multipart request without JSON fallback', async () => {
    vi.spyOn(api, 'sendModelRequest').mockRejectedValueOnce(new Error('request failed'));
    const wrapper = mount(App);

    await wrapper.find('[data-capability="video"]').trigger('click');
    wrapper.vm.form.model = 'viduq3-pro';
    await wrapper.vm.$nextTick();
    await wrapper.vm.submitFormTask();

    expect(api.sendModelRequest).toHaveBeenCalledTimes(1);
    expect(api.sendModelRequest).toHaveBeenCalledWith(expect.objectContaining({
      path: '/v1/videos',
      contentType: 'multipart',
    }));
    expect(wrapper.vm.statusKind).toBe('error');
  });

  it('renders model selector options for current capability', async () => {
    const wrapper = mount(App);

    expect(wrapper.findAll('[data-test="model-option"]').map((item) => item.attributes('value'))).toEqual([
      'seedance2.0-满血版02-720p',
      'seedance2.0-满血版02-1080p',
      'doubao-seedance-2.0',
      'Seedance2.0-720p',
      'Seedance2.0-1080p',
      'Seedance2.5-720p',
    ]);

    await wrapper.find('[data-capability="image"]').trigger('click');

    expect(wrapper.findAll('[data-test="model-option"]').map((item) => item.attributes('value'))).toEqual([
      'doubao-seedream-5-0-260128',
      'doubao-seedream-5-0-pro-260628',
      'gemini-3.1-flash-image-preview-sp',
      'ByteDance-Seedream-5.0',
    ]);

    await wrapper.find('[data-capability="image-to-image"]').trigger('click');

    expect(wrapper.findAll('[data-test="model-option"]').map((item) => item.attributes('value'))).toEqual([
      'doubao-seedream-5-0-260128',
      'doubao-seedream-5-0-pro-260628',
    ]);
  });

  it('offers 1080p video sizes and keeps the selected size in the request payload', async () => {
    const wrapper = mount(App);
    const select = wrapper.get('[data-test="video-size-select"]');

    expect(wrapper.findAll('[data-test="video-size-option"]').map((item) => item.attributes('value'))).toEqual([
      '960x540',
      '1280x720',
      '720x1280',
      '1920x1080',
      '1080x1920',
      '1024x1024',
    ]);

    await select.setValue('1920x1080');

    expect(wrapper.vm.form.size).toBe('1920x1080');
    expect(JSON.parse(wrapper.vm.jsonPayloadText).size).toBe('1920x1080');
  });

  it('shows actual generated video dimensions and whether it is 1080P', async () => {
    const wrapper = mount(App);
    wrapper.vm.submittedPayload = { body: { size: '1920x1080' } };
    wrapper.vm.currentTask = {
      id: 'video_resolution_1',
      status: 'completed',
      url: 'https://example.com/video_resolution_1.mp4',
    };
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-test="video-dimensions"]').text()).toBe('1920×1080');
    expect(wrapper.get('[data-test="video-resolution-level"]').text()).toBe('1080p');
    expect(wrapper.get('[data-test="video-is-1080p"]').text()).toBe('待确认（请求为 1080P）');
    expect(wrapper.get('[data-test="video-resolution-source"]').text()).toBe('请求参数（兜底）');

    const video = wrapper.get('[data-test="video-preview"]');
    Object.defineProperty(video.element, 'videoWidth', { configurable: true, value: 1280 });
    Object.defineProperty(video.element, 'videoHeight', { configurable: true, value: 720 });
    await video.trigger('loadedmetadata');

    expect(wrapper.get('[data-test="video-dimensions"]').text()).toBe('1280×720');
    expect(wrapper.get('[data-test="video-resolution-level"]').text()).toBe('720p');
    expect(wrapper.get('[data-test="video-is-1080p"]').text()).toBe('否');
    expect(wrapper.get('[data-test="video-resolution-source"]').text()).toBe('视频实际元数据');
  });

  it('marks an actual 1920x1080 generated video as 1080P', async () => {
    const wrapper = mount(App);
    wrapper.vm.submittedPayload = { body: { size: '1280x720' } };
    wrapper.vm.currentTask = {
      id: 'video_resolution_2',
      status: 'completed',
      url: 'https://example.com/video_resolution_2.mp4',
    };
    await wrapper.vm.$nextTick();

    const video = wrapper.get('[data-test="video-preview"]');
    Object.defineProperty(video.element, 'videoWidth', { configurable: true, value: 1920 });
    Object.defineProperty(video.element, 'videoHeight', { configurable: true, value: 1080 });
    await video.trigger('loadedmetadata');

    expect(wrapper.get('[data-test="video-resolution-level"]').text()).toBe('1080p');
    expect(wrapper.get('[data-test="video-is-1080p"]').text()).toBe('是');
    expect(wrapper.get('[data-test="video-resolution-source"]').text()).toBe('视频实际元数据');
  });

  it('loads completed legacy video history and restores its resolution parameters', async () => {
    vi.spyOn(api, 'getVideoContent').mockResolvedValue({
      type: 'blob',
      mimeType: 'video/mp4',
      size: 4,
      url: 'blob:legacy_video_1',
    });
    const wrapper = mount(App);
    const historyItem = {
      id: 'legacy_history_1',
      capability: 'video',
      contentType: 'json',
      path: '/v1/videos',
      status: 'completed',
      request: {
        method: 'POST',
        url: '/api/v1/videos',
        body: {
          model: 'doubao-seedance-2-0-260128',
          prompt: 'legacy video',
          size: '16:9',
          resolution: '1080p',
        },
      },
      response: {
        task_id: 'legacy_video_1',
        status: 'SUCCESS',
      },
    };

    await wrapper.vm.selectHistoryItem(historyItem);
    await wrapper.vm.$nextTick();

    expect(api.getVideoContent).toHaveBeenCalledWith(expect.objectContaining({
      taskID: 'legacy_video_1',
      path: '/v1/videos',
    }));
    expect(wrapper.vm.videoURL).toBe('blob:legacy_video_1');
    expect(wrapper.get('[data-test="video-dimensions"]').text()).toBe('1920×1080');
    expect(wrapper.get('[data-test="video-resolution-level"]').text()).toBe('1080p');
    expect(wrapper.get('[data-test="video-is-1080p"]').text()).toBe('待确认（请求为 1080P）');
    expect(wrapper.get('[data-test="video-resolution-source"]').text()).toBe('请求参数（兜底）');
  });

  it('keeps legacy history parameters visible when its video content is unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(api, 'getVideoContent').mockRejectedValue(new Error('expired content'));
    const wrapper = mount(App);
    const historyItem = {
      id: 'legacy_history_expired',
      capability: 'video',
      contentType: 'multipart',
      path: '/v1/videos',
      status: 'completed',
      request: {
        body: {
          model: 'doubao-seedance-2-0-260128',
          prompt: 'expired legacy video',
          width: 1920,
          height: 1080,
        },
      },
      response: {
        task_id: 'legacy_video_expired',
        status: 'completed',
      },
    };

    await wrapper.vm.selectHistoryItem(historyItem);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.videoURL).toBe('');
    expect(wrapper.get('[data-test="video-content-unavailable"]').exists()).toBe(true);
    expect(wrapper.get('[data-test="video-dimensions"]').text()).toBe('1920×1080');
    expect(wrapper.get('[data-test="video-resolution-level"]').text()).toBe('1080p');
    expect(wrapper.get('[data-test="video-is-1080p"]').text()).toBe('待确认（请求为 1080P）');
  });

  it('switches Seedream form size to a valid minimum option', async () => {
    const wrapper = mount(App);

    await wrapper.find('[data-capability="image"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.form.aspectRatio).toBe('16:9');
    expect(wrapper.vm.form.size).toBe('2848x1600');
    expect(wrapper.findAll('[data-test="image-aspect-ratio-option"]').map((item) => item.attributes('value'))).toEqual([
      '16:9',
      '9:16',
      '1:1',
    ]);
    expect(wrapper.findAll('[data-test="image-size-option"]').map((item) => item.attributes('value'))).toEqual([
      '2848x1600',
      '1600x2848',
      '2048x2048',
    ]);

    wrapper.vm.form.aspectRatio = '9:16';
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.form.size).toBe('1600x2848');
  });

  it('keeps manual JSON submission for current capability', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ id: 'manual' });
    const wrapper = mount(App);

    await wrapper.find('[data-capability="text"]').trigger('click');
    wrapper.vm.jsonPayloadText = '{"model":"custom","input":"hello"}';
    await wrapper.vm.submitJSONTask();

    expect(api.sendModelRequest).toHaveBeenCalledWith(expect.objectContaining({
      contentType: 'json',
      payload: {
        model: 'custom',
        input: 'hello',
      },
    }));
    expect(wrapper.vm.lastContentType).toBe('json');
  });

  it('uses JSON content type for manual JSON payloads on legacy video models', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ id: 'video_1', status: 'submitted' });
    const wrapper = mount(App);

    wrapper.vm.form.model = 'viduq3-pro';
    await wrapper.vm.$nextTick();
    wrapper.vm.jsonPayloadText = JSON.stringify({
      model: 'viduq3-pro',
      prompt: 'cat running',
      image_url: [
        { url: 'https://example.com/cat.png', role: 'reference_image' },
        { url: 'data:image/png;base64,ZmFrZQ==', role: 'reference_image' },
      ],
    });

    await wrapper.vm.submitJSONTask();

    expect(api.sendModelRequest).toHaveBeenCalledWith(expect.objectContaining({
      path: '/v1/videos',
      contentType: 'json',
      payload: expect.objectContaining({
        model: 'viduq3-pro',
        image_url: [
          { url: 'https://example.com/cat.png', role: 'reference_image' },
          { url: 'data:image/png;base64,ZmFrZQ==', role: 'reference_image' },
        ],
      }),
    }));
    expect(wrapper.vm.lastContentType).toBe('json');
  });

  it('syncs JSON request body when form fields change before manual JSON submit', async () => {
    const wrapper = mount(App);

    wrapper.vm.form.prompt = 'updated video prompt';
    await wrapper.vm.$nextTick();

    expect(JSON.parse(wrapper.vm.jsonPayloadText).prompt).toBe('updated video prompt');
  });

  it('passes manual video JSON payloads through unchanged', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ id: 'kling_1' });
    const wrapper = mount(App);

    wrapper.vm.form.model = 'kling-v3';
    await wrapper.vm.$nextTick();

    expect(JSON.parse(wrapper.vm.jsonPayloadText)).toEqual(expect.objectContaining({
      model: 'kling-v3',
      seconds: 5,
      size: '1280x720',
    }));

    wrapper.vm.jsonPayloadText = JSON.stringify({
      model: 'kling-v3',
      prompt: 'cat running',
      duration: 5,
      width: 1280,
      height: 720,
    });

    await wrapper.vm.submitJSONTask();

    expect(api.sendModelRequest).toHaveBeenCalledWith(expect.objectContaining({
      payload: {
        model: 'kling-v3',
        prompt: 'cat running',
        duration: 5,
        width: 1280,
        height: 720,
      },
    }));
  });

  it('ignores invalid saved history shapes from localStorage', async () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn(() => '{"id":"old-history-shape"}'),
        setItem: vi.fn(),
      },
    });
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ id: 'ok', status: 'submitted' });
    const wrapper = mount(App);

    expect(wrapper.vm.taskHistory).toEqual([]);

    await wrapper.find('[data-capability="text"]').trigger('click');
    await wrapper.vm.submitFormTask();

    expect(wrapper.vm.taskHistory).toHaveLength(1);
    expect(wrapper.vm.taskHistory[0].status).toBe('submitted');
  });

  it('does not mark previous history item failed when JSON validation fails before submit', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ id: 'ok', status: 'submitted' });
    const wrapper = mount(App);

    await wrapper.find('[data-capability="text"]').trigger('click');
    await wrapper.vm.submitFormTask();
    expect(wrapper.vm.taskHistory[0].status).toBe('submitted');

    wrapper.vm.jsonPayloadText = '{bad json';
    await wrapper.vm.submitJSONTask();

    expect(wrapper.vm.statusKind).toBe('error');
    expect(wrapper.vm.taskHistory[0].status).toBe('submitted');
    expect(wrapper.vm.taskHistory[0].response).toEqual({ id: 'ok', status: 'submitted' });
  });

  it('stores request preview in history instead of raw form payload', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ candidates: [] });
    const wrapper = mount(App);
    wrapper.vm.apiBase = '/api';
    wrapper.vm.apiKey = 'sk-test';

    await wrapper.find('[data-capability="image"]').trigger('click');
    await wrapper.vm.submitFormTask();

    expect(wrapper.vm.taskHistory[0].request).toEqual(wrapper.vm.submittedPayload);
    expect(wrapper.vm.taskHistory[0].request).toMatchObject({
      method: 'POST',
      url: '/api/v1/images/generations',
      body: {
        model: 'doubao-seedream-5-0-pro-260628',
        size: '2848x1600',
        quality: 'standard',
        n: 1,
      },
    });
  });

  it('starts with one unconfigured test environment and opens settings before submit', async () => {
    const sendRequest = vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ candidates: [] });
    const wrapper = vueMount(App);

    expect(wrapper.vm.environments).toEqual([{ id: 'test', label: '测试环境' }]);
    expect(wrapper.vm.apiBase).toBe('');
    expect(wrapper.vm.apiKey).toBe('');
    expect(wrapper.get('[data-test="connection-reminder"]').text()).toContain('尚未配置连接');

    await wrapper.vm.submitFormTask();

    expect(sendRequest).not.toHaveBeenCalled();
    expect(wrapper.get('[data-test="connection-settings-drawer"]').exists()).toBe(true);
    expect(wrapper.vm.statusText).toBe('请先设置 API Key');
  });

  it('saves API URL and key only in the current component session', async () => {
    const wrapper = vueMount(App);

    await wrapper.get('[data-test="connection-settings-button"]').trigger('click');
    await wrapper.get('[data-test="settings-api-base"]').setValue('https://api.test.invalid/');
    await wrapper.get('[data-test="settings-api-key"]').setValue('test-api-key');
    expect(wrapper.get('[data-test="settings-api-key"]').attributes('type')).toBe('password');

    await wrapper.get('[data-test="toggle-api-key-visibility"]').trigger('click');
    expect(wrapper.get('[data-test="settings-api-key"]').attributes('type')).toBe('text');
    await wrapper.get('[data-test="save-connection-settings"]').trigger('click');

    expect(wrapper.vm.apiBase).toBe('https://api.test.invalid');
    expect(wrapper.vm.apiKey).toBe('test-api-key');
    expect(wrapper.find('[data-test="connection-settings-drawer"]').exists()).toBe(false);
    expect(JSON.stringify(window.localStorage.setItem.mock.calls)).not.toContain('test-api-key');
  });

  it('marks successful chat completion responses as completed in history', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({
      choices: [
        {
          finish_reason: 'stop',
          index: 0,
          message: {
            content: 'New API 是一个开源的AI接口聚合与管理平台。',
            role: 'assistant',
          },
        },
      ],
      id: '748869a85ee5a367c95e947025e4e7fd',
      model: 'deepseek-v4-flash',
      object: 'chat.completion',
    });
    const wrapper = mount(App);

    await wrapper.find('[data-capability="text"]').trigger('click');
    await wrapper.vm.submitFormTask();

    expect(wrapper.vm.taskHistory[0].status).toBe('completed');
    expect(wrapper.find('[data-test="history-status-badge"]').text()).toBe('已完成');
  });

  it('shows the history environment as a prominent badge', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ choices: [] });
    const wrapper = mount(App);

    await wrapper.find('[data-capability="text"]').trigger('click');
    await wrapper.vm.submitFormTask();

    const environmentBadge = wrapper.find('[data-test="history-environment-badge"]');
    expect(environmentBadge.exists()).toBe(true);
    expect(environmentBadge.text()).toBe('测试环境');
  });

  it('shows the generation type as a prominent history badge', async () => {
    vi.spyOn(api, 'sendModelRequest')
      .mockResolvedValueOnce({ choices: [{ message: { content: 'ok' } }] })
      .mockResolvedValueOnce({ id: 'video_1', status: 'submitted' });
    const wrapper = mount(App);

    await wrapper.find('[data-capability="text"]').trigger('click');
    await wrapper.vm.submitFormTask();
    await wrapper.find('[data-capability="video"]').trigger('click');
    await wrapper.vm.submitFormTask();

    const typeBadges = wrapper.findAll('[data-test="history-generation-type-badge"]');
    expect(typeBadges.map((item) => item.text())).toEqual(['文生视频', '文生文']);
    expect(wrapper.vm.taskHistory.map((item) => item.generationTypeLabel)).toEqual(['文生视频', '文生文']);
  });

  it('renders the configured address without exposing the API key', async () => {
    const wrapper = mount(App);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('测试环境');
    expect(wrapper.text()).toContain(wrapper.vm.apiBase);
    expect(wrapper.text()).not.toContain(wrapper.vm.apiKey);
    expect(wrapper.findAll('[data-test="environment-select"] option')).toHaveLength(1);
  });

  it('shows the actual request payload in the request preview', async () => {
    const wrapper = mount(App);

    wrapper.vm.submittedPayload = {
      method: 'POST',
      url: '/api/v1/videos',
      headers: {
        Authorization: 'Bearer sk-masked',
        'Content-Type': 'application/json',
      },
      body: {
        model: 'doubao-seedance-2-0-260128',
        images: [
          'data:image/png;base64,very-long-image-data',
          'https://example.com/cat.png',
        ],
      },
    };
    await wrapper.vm.$nextTick();

    const text = wrapper.get('[data-test="request-debug-json"]').text();
    expect(text).toContain('data:image/png;base64,very-long-image-data');
    expect(text).toContain('https://example.com/cat.png');
  });

  it('copies full request and response JSON from debug panels', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const wrapper = mount(App);
    const request = {
      method: 'POST',
      body: {
        images: ['data:image/png;base64,full-image-data'],
      },
    };
    const response = {
      id: 'task_1',
      status: 'completed',
    };

    wrapper.vm.submittedPayload = request;
    wrapper.vm.rawResponse = response;
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-test="copy-request-json"]').trigger('click');
    await wrapper.get('[data-test="copy-response-json"]').trigger('click');

    expect(writeText).toHaveBeenNthCalledWith(1, JSON.stringify(request, null, 2));
    expect(writeText).toHaveBeenNthCalledWith(2, JSON.stringify(response, null, 2));
    expect(wrapper.get('[data-test="copy-request-json"]').text()).toBe('已复制');
    expect(wrapper.get('[data-test="copy-response-json"]').text()).toBe('已复制');
  });

  it('saves and loads request templates for the current capability', async () => {
    const wrapper = mount(App);

    wrapper.vm.form.prompt = '模板提示词';
    wrapper.vm.templateName = '视频模板';
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-test="save-template-button"]').trigger('click');

    expect(wrapper.vm.requestTemplates).toHaveLength(1);
    expect(wrapper.vm.requestTemplates[0]).toMatchObject({
      name: '视频模板',
      capability: 'video',
      path: '/v1/videos',
    });

    wrapper.vm.form.prompt = '被覆盖的提示词';
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-test="load-template-button"]').trigger('click');

    expect(wrapper.vm.form.prompt).toBe('模板提示词');
    expect(wrapper.vm.activeCapabilityId).toBe('video');
  });

  it('filters task history by capability, status, and search text', async () => {
    vi.spyOn(api, 'sendModelRequest')
      .mockResolvedValueOnce({ choices: [{ message: { content: 'ok' } }] })
      .mockResolvedValueOnce({ id: 'video_1', status: 'submitted' });
    const wrapper = mount(App);

    await wrapper.find('[data-capability="text"]').trigger('click');
    wrapper.vm.form.prompt = '介绍 New API';
    await wrapper.vm.submitFormTask();
    await wrapper.find('[data-capability="video"]').trigger('click');
    wrapper.vm.form.prompt = '霓虹街道橘猫';
    await wrapper.vm.submitFormTask();

    wrapper.vm.historyCapabilityFilter = 'video';
    wrapper.vm.historyStatusFilter = 'submitted';
    wrapper.vm.historySearchText = '橘猫';
    await wrapper.vm.$nextTick();
    await wrapper.get('[data-test="history-workspace-button"]').trigger('click');

    expect(wrapper.vm.filteredTaskHistory).toHaveLength(1);
    expect(wrapper.vm.filteredTaskHistory[0].capability).toBe('video');
    expect(wrapper.findAll('[data-test="history-item"]')).toHaveLength(1);
    expect(wrapper.text()).toContain('霓虹街道橘猫');
    expect(wrapper.text()).not.toContain('介绍 New API');
  });

  it('opens a task detail drawer from history', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ id: 'video_1', status: 'submitted' });
    const wrapper = mount(App);

    wrapper.vm.form.prompt = '详情抽屉提示词';
    await wrapper.vm.submitFormTask();
    await wrapper.get('[data-test="history-workspace-button"]').trigger('click');
    await wrapper.get('[data-test="open-history-detail"]').trigger('click');

    expect(wrapper.vm.detailHistoryItem.id).toBe(wrapper.vm.taskHistory[0].id);
    expect(wrapper.get('[data-test="history-detail-drawer"]').text()).toContain('详情抽屉提示词');
    expect(wrapper.get('[data-test="history-detail-drawer"]').text()).toContain('/v1/videos');

    await wrapper.get('[data-test="close-history-detail"]').trigger('click');

    expect(wrapper.find('[data-test="history-detail-drawer"]').exists()).toBe(false);
  });

  it('shows legacy video resolution parameters in the history detail drawer', async () => {
    const wrapper = mount(App);
    wrapper.vm.openHistoryDetail({
      id: 'legacy_detail_1',
      capability: 'video',
      capabilityLabel: '视频',
      contentType: 'json',
      path: '/v1/videos',
      status: 'completed',
      prompt: 'legacy detail video',
      request: {
        body: {
          model: 'doubao-seedance-2-0-260128',
          size: '9:16',
          resolution: '1080p',
        },
      },
      response: {
        task_id: 'legacy_detail_video_1',
        status: 'completed',
      },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.get('[data-test="history-detail-video-dimensions"]').text()).toBe('1080×1920');
    expect(wrapper.get('[data-test="history-detail-video-resolution"]').text()).toBe('1080p');
    expect(wrapper.get('[data-test="history-detail-video-is-1080p"]').text()).toBe('待确认（请求为 1080P）');
    expect(wrapper.get('[data-test="history-detail-video-resolution-source"]').text()).toBe('历史请求参数');
  });

  it('records elapsed time for submitted history items', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });
    const wrapper = mount(App);

    await wrapper.find('[data-capability="text"]').trigger('click');
    await wrapper.vm.submitFormTask();
    await wrapper.get('[data-test="history-workspace-button"]').trigger('click');

    expect(wrapper.vm.taskHistory[0].durationMs).toEqual(expect.any(Number));
    expect(wrapper.vm.taskHistory[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(wrapper.get('[data-test="history-duration"]').text()).toContain('耗时');
  });

  it('records full video generation time through success and displays it in minutes', async () => {
    vi.useFakeTimers();
    const startedAt = new Date('2026-07-17T08:00:00.000Z');
    vi.setSystemTime(startedAt);
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({
      task_id: 'video_duration_1',
      status: 'submitted',
    });
    vi.spyOn(api, 'getTaskStatus').mockResolvedValue({
      task_id: 'video_duration_1',
      status: 'completed',
    });
    vi.spyOn(api, 'getVideoContent').mockResolvedValue({
      type: 'blob',
      mimeType: 'video/mp4',
      size: 4,
      url: 'blob:video_duration_1',
    });
    const wrapper = mount(App);

    await wrapper.vm.submitFormTask();

    expect(wrapper.vm.taskHistory[0].startedAt).toBe(startedAt.getTime());
    expect(wrapper.vm.taskHistory[0].durationMs).toBeUndefined();
    expect(wrapper.get('[data-test="result-duration"]').text()).toBe('-');

    vi.setSystemTime(new Date(startedAt.getTime() + 150000));
    await wrapper.vm.refreshTask();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.taskHistory[0].durationType).toBe('generation');
    expect(wrapper.vm.taskHistory[0].durationMs).toBe(150000);
    expect(wrapper.vm.taskHistory[0].completedAt).toBe(startedAt.getTime() + 150000);
    expect(wrapper.get('[data-test="result-duration"]').text()).toBe('2.50 分钟');

    await wrapper.get('[data-test="history-workspace-button"]').trigger('click');
    expect(wrapper.get('[data-test="history-duration"]').text()).toBe('生成耗时 2.50 分钟');

    await wrapper.get('[data-test="open-history-detail"]').trigger('click');
    expect(wrapper.get('[data-test="history-detail-duration"]').text()).toBe('2.50 分钟');
    expect(wrapper.get('[data-test="history-detail-drawer"]').text()).toContain('生成耗时');
  });

  it('copies a markdown acceptance report from history detail', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ id: 'video_1', status: 'submitted' });
    const wrapper = mount(App);

    wrapper.vm.form.prompt = '报告提示词';
    await wrapper.vm.submitFormTask();
    await wrapper.get('[data-test="history-workspace-button"]').trigger('click');
    await wrapper.get('[data-test="open-history-detail"]').trigger('click');
    await wrapper.get('[data-test="copy-history-report"]').trigger('click');

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('# New API 模型测试报告'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('报告提示词'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/v1/videos'));
    expect(wrapper.get('[data-test="copy-history-report"]').text()).toBe('报告已复制');
  });

  it('renders a model capability matrix', () => {
    const wrapper = mount(App);

    const rows = wrapper.findAll('[data-test="capability-matrix-row"]');
    expect(rows).toHaveLength(5);
    expect(wrapper.get('[data-test="capability-matrix"]').text()).toContain('视频');
    expect(wrapper.get('[data-test="capability-matrix"]').text()).toContain('/v1/videos');
    expect(wrapper.get('[data-test="capability-matrix"]').text()).toContain('6 个模型');
  });

  it('groups unique successful history models above the capability matrix', () => {
    const history = [
      { id: 'text-1', capability: 'text', status: 'completed', request: { body: { model: 'deepseek-v4-flash-260425' } } },
      { id: 'text-2', capability: 'text', status: 'done', request: { body: { model: 'deepseek-v4-flash-260425' } } },
      { id: 'image-1', capability: 'image', status: 'succeeded', request: { body: { model: 'doubao-seedream-5-0-pro-260628' } } },
      { id: 'video-1', capability: 'video', status: 'failed', request: { body: { model: 'kling-v3' } } },
      { id: 'audio-1', capability: 'audio', status: 'submitted', request: { body: { model: 'cosyvoice-v3-flash' } } },
    ];
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key) => key === 'newapi-model-test-history' ? JSON.stringify(history) : null),
        setItem: vi.fn(),
      },
    });

    const wrapper = mount(App);
    const groups = wrapper.findAll('[data-test="available-model-group"]');

    expect(groups).toHaveLength(2);
    expect(wrapper.get('[data-test="available-model-group"][data-capability="text"]').text()).toContain('deepseek-v4-flash-260425');
    expect(wrapper.get('[data-test="available-model-group"][data-capability="image"]').text()).toContain('doubao-seedream-5-0-pro-260628');
    expect(wrapper.findAll('[data-test="available-model-chip"]')).toHaveLength(2);
    expect(wrapper.get('[data-test="available-models"]').text()).not.toContain('kling-v3');
    expect(wrapper.get('[data-test="available-models"]').text()).not.toContain('cosyvoice-v3-flash');
  });

  it('renders local history statistics', async () => {
    vi.spyOn(api, 'sendModelRequest')
      .mockResolvedValueOnce({ choices: [{ message: { content: 'ok' } }] })
      .mockRejectedValueOnce(new Error('request failed'));
    const wrapper = mount(App);

    await wrapper.find('[data-capability="text"]').trigger('click');
    await wrapper.vm.submitFormTask();
    await wrapper.vm.submitFormTask();
    await wrapper.get('[data-test="history-workspace-button"]').trigger('click');

    const stats = wrapper.get('[data-test="history-stats"]').text();
    expect(stats).toContain('总数');
    expect(stats).toContain('2');
    expect(stats).toContain('成功率');
    expect(stats).toContain('50%');
    expect(stats).toContain('失败');
  });

  it('shows an actionable diagnosis for API key errors', async () => {
    vi.spyOn(api, 'sendModelRequest').mockRejectedValue(new Error('401 invalid api key'));
    const wrapper = mount(App);

    await wrapper.find('[data-capability="text"]').trigger('click');
    await wrapper.vm.submitFormTask();

    expect(wrapper.vm.errorDiagnosis.title).toBe('认证失败');
    expect(wrapper.get('[data-test="error-diagnosis"]').text()).toContain('检查 API Key');
  });

  it('updates the selected history item when refreshing a selected video task', async () => {
    vi.spyOn(api, 'sendModelRequest')
      .mockResolvedValueOnce({ id: 'video_1', status: 'submitted' })
      .mockResolvedValueOnce({ id: 'video_2', status: 'submitted' });
    vi.spyOn(api, 'getTaskStatus').mockResolvedValue({ id: 'video_1', status: 'completed' });
    vi.spyOn(api, 'getVideoContent').mockResolvedValue({
      type: 'blob',
      mimeType: 'video/mp4',
      size: 4,
      url: 'blob:video_1',
    });
    const wrapper = mount(App);

    await wrapper.vm.submitFormTask();
    await wrapper.vm.submitFormTask();
    wrapper.vm.selectHistoryItem(wrapper.vm.taskHistory[1]);
    await wrapper.vm.refreshTask();

    expect(wrapper.vm.taskHistory[1].response).toEqual({ id: 'video_1', status: 'completed' });
    expect(wrapper.vm.taskHistory[1].status).toBe('completed');
    expect(wrapper.vm.taskHistory[0].response).toEqual({ id: 'video_2', status: 'submitted' });
  });

  it('restores Seedance history request into the video form for resubmission', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ task_id: 'task_1', status: 'submitted' });
    const wrapper = mount(App);
    const historyItem = {
      id: 'history_1',
      capability: 'video',
      contentType: 'multipart',
      path: '/v1/videos',
      taskPath: '/v1/videos',
      status: 'submitted',
      request: {
        method: 'POST',
        url: '/api/v1/videos',
        body: {
          model: 'doubao-seedance-2-0-260128',
          prompt: 'cat running',
          duration: 5,
          size: '1280x720',
          resolution: '720p',
          generate_audio: true,
          images: [
            'https://example.com/cat.png',
            'data:image/png;base64,ZmFrZQ==',
          ],
        },
      },
      response: { task_id: 'task_1', status: 'submitted' },
    };

    wrapper.vm.form.model = 'viduq3-pro';
    wrapper.vm.form.prompt = 'old prompt';
    wrapper.vm.form.imageURL = '';

    wrapper.vm.selectHistoryItem(historyItem);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.activeCapabilityId).toBe('video');
    expect(wrapper.vm.requestPath).toBe('/v1/videos');
    expect(wrapper.vm.form.model).toBe('doubao-seedance-2-0-260128');
    expect(wrapper.vm.form.prompt).toBe('cat running');
    expect(wrapper.vm.form.imageURL).toBe('https://example.com/cat.png\ndata:image/png;base64,ZmFrZQ==');
    expect(wrapper.vm.form.size).toBe('1280x720');
    expect(wrapper.vm.form.duration).toBe(5);
    expect(wrapper.vm.form.metadataText).toBe('{"generate_audio":true}');
    expect(JSON.parse(wrapper.vm.jsonPayloadText)).toEqual({
      model: 'doubao-seedance-2-0-260128',
      prompt: 'cat running',
      seconds: 5,
      size: '1280x720',
      metadata: {
        generate_audio: true,
      },
      image_urls: [
        { url: 'https://example.com/cat.png', role: 'reference_image' },
        { url: 'data:image/png;base64,ZmFrZQ==', role: 'reference_image' },
      ],
    });

    await wrapper.vm.submitFormTask();

    expect(api.sendModelRequest).toHaveBeenCalledWith(expect.objectContaining({
      path: '/v1/videos',
      contentType: 'multipart',
      payload: expect.objectContaining({
        model: 'doubao-seedance-2-0-260128',
        prompt: 'cat running',
        seconds: 5,
        size: '1280x720',
        metadata: expect.objectContaining({
          generate_audio: true,
        }),
        image_urls: [
          { url: 'https://example.com/cat.png', role: 'reference_image' },
          { url: 'data:image/png;base64,ZmFrZQ==', role: 'reference_image' },
        ],
      }),
    }));
  });

  it('normalizes Seedance task_id when selecting video history', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({
      id: 'task_create_wrapper',
      task_id: 'task_real_video',
      model: 'doubao-seedance-2-0-260128',
      status: 'in_progress',
    });
    vi.spyOn(api, 'getTaskStatus').mockResolvedValue({
      id: 'task_create_wrapper',
      task_id: 'task_real_video',
      model: 'doubao-seedance-2-0-260128',
      status: 'completed',
    });
    const wrapper = mount(App);

    wrapper.vm.form.model = 'doubao-seedance-2-0-260128';
    await wrapper.vm.$nextTick();
    await wrapper.vm.submitFormTask();
    wrapper.vm.currentTask = null;

    wrapper.vm.selectHistoryItem(wrapper.vm.taskHistory[0]);

    expect(wrapper.vm.currentTask.id).toBe('task_real_video');

    await wrapper.vm.refreshTask();

    expect(api.getTaskStatus).toHaveBeenCalledWith(expect.objectContaining({
      taskID: 'task_real_video',
      path: '/v1/videos',
    }));
  });

  it('submits Doubao Seedance fast form requests to /v1/videos as multipart', async () => {
    vi.spyOn(api, 'sendModelRequest').mockResolvedValue({ id: 'video_1', status: 'submitted' });
    const wrapper = mount(App);

    wrapper.vm.form.model = 'doubao-seedance-2-0-fast-260128';
    wrapper.vm.form.prompt = 'cat running';
    wrapper.vm.form.imageURL = 'https://example.com/cat.png';
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.requestPath).toBe('/v1/videos');

    await wrapper.vm.submitFormTask();

    expect(api.sendModelRequest).toHaveBeenCalledWith(expect.objectContaining({
      path: '/v1/videos',
      contentType: 'multipart',
      payload: expect.objectContaining({
        model: 'doubao-seedance-2-0-fast-260128',
        prompt: 'cat running',
        seconds: 5,
        size: '1280x720',
        image_urls: [
          { url: 'https://example.com/cat.png', role: 'reference_image' },
        ],
      }),
    }));
  });

  it('ignores stale history task paths when refreshing Seedance video tasks', async () => {
    vi.spyOn(api, 'getTaskStatus').mockResolvedValue({
      id: 'task_real_video',
      status: 'completed',
      metadata: { url: '' },
    });
    vi.spyOn(api, 'getVideoContent').mockResolvedValue({
      type: 'blob',
      mimeType: 'video/mp4',
      size: 4,
      url: 'blob:task_real_video',
    });
    const wrapper = mount(App);
    wrapper.vm.apiBase = '/api';
    const historyItem = {
      id: 'history_1',
      capability: 'video',
      contentType: 'multipart',
      path: '/v1/videos',
      taskPath: '/v1/videos',
      status: 'submitted',
      request: {
        method: 'POST',
        url: '/api/v1/videos',
        body: {
          model: 'doubao-seedance-2-0-260128',
          prompt: 'cat running',
          seconds: '5',
          size: '1280x720',
          resolution: '720p',
        },
      },
      response: {
        id: 'task_real_video',
        task_id: 'task_real_video',
        status: 'in_progress',
        metadata: { url: '' },
      },
    };

    wrapper.vm.selectHistoryItem(historyItem);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.videoURL).toBe('');

    await wrapper.vm.refreshTask();

    expect(api.getTaskStatus).toHaveBeenCalledWith(expect.objectContaining({
      taskID: 'task_real_video',
      path: '/v1/videos',
    }));
    expect(api.getVideoContent).toHaveBeenCalledWith(expect.objectContaining({
      taskID: 'task_real_video',
      path: '/v1/videos',
    }));
    expect(wrapper.vm.videoURL).toBe('blob:task_real_video');
  });

  it('clears stale video task when selecting non-video history', async () => {
    vi.spyOn(api, 'sendModelRequest')
      .mockResolvedValueOnce({ id: 'video_1', status: 'submitted' })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'ok' } }] });
    const wrapper = mount(App);

    await wrapper.vm.submitFormTask();
    await wrapper.find('[data-capability="text"]').trigger('click');
    await wrapper.vm.submitFormTask();
    wrapper.vm.selectHistoryItem(wrapper.vm.taskHistory[1]);
    expect(wrapper.vm.currentTask.id).toBe('video_1');

    wrapper.vm.selectHistoryItem(wrapper.vm.taskHistory[0]);

    expect(wrapper.vm.currentTask).toBe(null);
  });

  it('uses completed video metadata url for preview', async () => {
    const wrapper = mount(App);

    wrapper.vm.currentTask = {
      id: 'task_1',
      status: 'completed',
      metadata: {
        url: 'https://example.com/video.mp4',
      },
    };
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.videoURL).toBe('https://example.com/video.mp4');
  });

  it('uses completed video output url for preview', async () => {
    const wrapper = mount(App);

    wrapper.vm.currentTask = {
      id: 'task_C9fWWdaAXdCngKokkxwJukYjPWdzEKoC',
      model: 'veo_3_1-fast',
      status: 'completed',
      output: {
        url: 'https://example.com/veo-output.mp4',
        video_id: 'req_384xjuu6fwwujssywlmfgli3',
      },
    };
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.videoURL).toBe('https://example.com/veo-output.mp4');
  });

  it('renders video output url with a video player instead of audio player', async () => {
    const wrapper = mount(App);

    wrapper.vm.rawResponse = {
      id: 'task_C9fWWdaAXdCngKokkxwJukYjPWdzEKoC',
      model: 'veo_3_1-fast',
      status: 'completed',
      url: 'https://example.com/veo-output.mp4',
      output: {
        url: 'https://example.com/veo-output.mp4',
      },
    };
    wrapper.vm.currentTask = wrapper.vm.rawResponse;
    await wrapper.vm.$nextTick();

    expect(wrapper.find('video.preview').attributes('src')).toBe('https://example.com/veo-output.mp4');
    expect(wrapper.find('audio.audio-player').exists()).toBe(false);
  });

  it('uses completed video_url for preview', async () => {
    const wrapper = mount(App);

    wrapper.vm.currentTask = {
      id: 'task_C9fWWdaAXdCngKokkxwJukYjPWdzEKoC',
      model: 'veo_3_1-fast',
      status: 'completed',
      video_url: 'https://example.com/veo-video-url.mp4',
    };
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.videoURL).toBe('https://example.com/veo-video-url.mp4');
  });

  it('uses succeeded video result video_url for preview', async () => {
    const wrapper = mount(App);

    wrapper.vm.currentTask = {
      id: 'task_igXxfggsvJCjZgV958X1nOV99B2DMLZ9',
      model: 'doubao-seedance-2-0-fast-260128',
      status: 'succeeded',
      result: {
        video_url: 'https://example.com/result-video.mp4',
      },
    };
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.videoURL).toBe('https://example.com/result-video.mp4');
  });

  it('renders succeeded video data url as video instead of image', async () => {
    const wrapper = mount(App);

    const response = {
      id: 'task_igXxfggsvJCjZgV958X1nOV99B2DMLZ9',
      model: 'doubao-seedance-2-0-fast-260128',
      status: 'succeeded',
      data: [
        { url: 'https://example.com/data-video.mp4' },
      ],
    };
    wrapper.vm.rawResponse = response;
    wrapper.vm.currentTask = response;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.videoURL).toBe('https://example.com/data-video.mp4');
    expect(wrapper.find('video.preview').attributes('src')).toBe('https://example.com/data-video.mp4');
    expect(wrapper.find('.image-grid').exists()).toBe(false);
  });

  it('shows video task progress while polling', async () => {
    const wrapper = mount(App);

    wrapper.vm.currentTask = {
      id: 'task_1',
      status: 'queued',
      progress: 10,
    };
    await wrapper.vm.$nextTick();

    const progress = wrapper.get('[data-test="video-progress"]');
    expect(progress.text()).toContain('queued / 10%');
    expect(wrapper.get('[data-test="video-progress-bar"]').attributes('style')).toContain('width: 10%;');
  });

  it('hides video task progress after the video is ready', async () => {
    const wrapper = mount(App);

    wrapper.vm.currentTask = {
      id: 'task_1',
      status: 'completed',
      progress: 100,
      metadata: {
        url: 'https://example.com/video.mp4',
      },
    };
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="video-progress"]').exists()).toBe(false);
    expect(wrapper.vm.videoURL).toBe('https://example.com/video.mp4');
  });

  it('downloads generated videos through authenticated content endpoint', async () => {
    vi.spyOn(api, 'getVideoContent').mockResolvedValue({
      type: 'blob',
      mimeType: 'video/mp4',
      size: 4,
      url: 'blob:video-content',
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const wrapper = mount(App);
    wrapper.vm.apiBase = '/api';
    wrapper.vm.apiKey = 'sk-test';
    wrapper.vm.currentTask = {
      id: 'task_1',
      status: 'completed',
      metadata: {
        url: 'https://platform.dataeyes.ai/seedance/api/v3/contents/generations/tasks/task_1',
      },
    };
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-test="download-video-button"]').trigger('click');

    expect(api.getVideoContent).toHaveBeenCalledWith(expect.objectContaining({
      apiBase: '/api',
      apiKey: 'sk-test',
      taskID: 'task_1',
      path: '/v1/videos',
    }));
    expect(clickSpy).toHaveBeenCalled();
    expect(wrapper.vm.statusKind).toBe('ok');
    expect(wrapper.vm.statusText).toBe('视频下载已开始');
  });

  it('does not expose DataEyes task query URLs as playable video links', async () => {
    const wrapper = mount(App);
    wrapper.vm.currentTask = {
      id: 'cgt-20260707213505-99fk8',
      status: 'completed',
      metadata: {
        url: 'https://platform.dataeyes.ai/seedance/api/v3/contents/generations/tasks/cgt-20260707213505-99fk8',
      },
    };
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.videoURL).toBe('');
    expect(wrapper.find('video.preview').exists()).toBe(false);
    expect(wrapper.find('[data-test="open-video-link"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="download-video-button"]').exists()).toBe(true);
  });

  it('renders download and open video actions with distinct styles', async () => {
    const wrapper = mount(App);
    wrapper.vm.currentTask = {
      id: 'task_1',
      status: 'completed',
      result_url: 'https://example.com/video.mp4',
    };
    await wrapper.vm.$nextTick();

    const actions = wrapper.get('[data-test="video-result-actions"]');
    const download = actions.get('[data-test="download-video-button"]');
    const open = actions.get('[data-test="open-video-link"]');

    expect(download.classes()).toContain('download-link');
    expect(open.classes()).toContain('open-link');
    expect(actions.element.children[0]).toBe(download.element);
    expect(actions.element.children[1]).toBe(open.element);
  });

  it('shows formatted error when authenticated video download fails', async () => {
    vi.spyOn(api, 'getVideoContent').mockRejectedValue(new Error('未提供令牌'));
    const wrapper = mount(App);
    wrapper.vm.currentTask = {
      id: 'task_1',
      status: 'completed',
      metadata: {
        url: 'https://platform.dataeyes.ai/seedance/api/v3/contents/generations/tasks/task_1',
      },
    };
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-test="download-video-button"]').trigger('click');

    expect(wrapper.vm.statusKind).toBe('error');
    expect(wrapper.vm.statusText).toBe('视频下载失败：未提供令牌');
  });

  it('fetches video content with authorization after succeeded video tasks', async () => {
    vi.spyOn(api, 'getTaskStatus').mockResolvedValue({
      id: 'task_S191X2YYdAxzwpvTUregQyut1DB1aYrD',
      model: 'doubao-seedance-2-0-fast-260128',
      object: 'video',
      status: 'succeeded',
      progress: 100,
    });
    vi.spyOn(api, 'getVideoContent').mockResolvedValue({
      type: 'blob',
      mimeType: 'video/mp4',
      size: 4,
      url: 'blob:video-content',
    });
    const wrapper = mount(App);
    wrapper.vm.apiBase = '/api';
    wrapper.vm.apiKey = 'sk-test';

    wrapper.vm.currentTask = {
      id: 'task_S191X2YYdAxzwpvTUregQyut1DB1aYrD',
      model: 'doubao-seedance-2-0-fast-260128',
      object: 'video',
      status: 'processing',
      progress: 90,
    };

    await wrapper.vm.refreshTask();

    expect(api.getVideoContent).toHaveBeenCalledWith(expect.objectContaining({
      apiBase: '/api',
      apiKey: 'sk-test',
      taskID: 'task_S191X2YYdAxzwpvTUregQyut1DB1aYrD',
      path: '/v1/videos',
    }));
    expect(wrapper.vm.videoURL).toBe('blob:video-content');
    expect(wrapper.find('[data-test="video-progress"]').exists()).toBe(false);
  });

  it('shows New API official docs shortcut', () => {
    const wrapper = mount(App);
    const link = wrapper.get('[data-test="new-api-docs-link"]');

    expect(link.attributes('href')).toBe('https://www.newapi.ai/zh/docs/api');
    expect(link.attributes('target')).toBe('_blank');
  });
});
