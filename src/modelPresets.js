const CAPABILITIES = [
  {
    id: 'text',
    label: '文字',
    defaultPath: '/v1/chat/completions',
    contentType: 'json',
    submitLabel: '提交文字',
    docsURL: 'https://www.newapi.ai/zh/docs/api/ai-model/chat/openai/createchatcompletion',
    models: ['deepseek-v4-flash-260425', 'deepseek-v4-flash'],
    defaults: {
      model: 'deepseek-v4-flash-260425',
      systemPrompt: 'You are a helpful assistant.',
      prompt: '用一句话介绍 New API。',
      temperature: 0.7,
      maxTokens: 1024,
    },
  },
  {
    id: 'image',
    label: '文生图',
    defaultPath: '/v1/images/generations',
    contentType: 'json',
    submitLabel: '生成图片',
    docsURL: 'https://www.newapi.ai/zh/docs/api/ai-model/images/openai/create-image',
    models: ['doubao-seedream-5-0-260128', 'doubao-seedream-5-0-pro-260628', 'gemini-3.1-flash-image-preview-sp', 'ByteDance-Seedream-5.0'],
    defaults: {
      model: 'doubao-seedream-5-0-pro-260628',
      prompt: '一只跑的 橘猫',
      aspectRatio: '16:9',
      size: '2848x1600',
      quality: 'standard',
      n: 1,
    },
  },
  {
    id: 'image-to-image',
    label: '图生图',
    defaultPath: '/v1/images/edits',
    contentType: 'multipart',
    submitLabel: '生成图片',
    docsURL: 'https://www.volcengine.com/docs/82379/1541523?lang=zh',
    models: ['doubao-seedream-5-0-260128', 'doubao-seedream-5-0-pro-260628'],
    defaults: {
      model: 'doubao-seedream-5-0-pro-260628',
      prompt: '参考这张图片，生成一张风格一致的新图片 一只狗',
      aspectRatio: '16:9',
      size: '2848x1600',
      quality: 'standard',
      n: 1,
      imageURL: 'https://img0.baidu.com/it/u=551513121,4065728939&fm=253&app=138&f=JPEG?w=800&h=1200',
      imageFile: null,
    },
  },
  {
    id: 'audio',
    label: '语音',
    defaultPath: '/v1/chat/completions',
    contentType: 'json',
    submitLabel: '生成语音',
    docsURL: 'https://www.newapi.ai/zh/docs/api/ai-model/chat/openai/createchatcompletion',
    models: ['cosyvoice-v3-flash'],
    defaults: {
      model: 'cosyvoice-v3-flash',
      mode: 'narration',
      input: '这是一个 New API 语音模型测试。',
      voice: 'longanwen_v3',
      responseFormat: 'mp3',
    },
  },
  {
    id: 'video',
    label: '视频',
    defaultPath: '/v1/videos',
    contentType: 'multipart',
    taskPath: '/v1/videos',
    submitLabel: '生成视频',
    docsURL: 'https://docs.newapi.pro/zh/docs/api/ai-model/videos/createvideogeneration',
    models: [
      'seedance2.0-满血版02-720p',
      'seedance2.0-满血版02-1080p',
      'doubao-seedance-2.0',
      'Seedance2.0-720p',
      'Seedance2.0-1080p',
      'Seedance2.5-720p',
    ],
    defaults: {
      model: 'seedance2.0-满血版02-720p',
      prompt: '保持图片1中虚拟女性的身份、五官和发型一致，她面向镜头自然微笑并缓慢挥手，轻微眨眼，镜头稳定，中景，柔和影棚光，电影质感，高细节',
      size: '1280x720',
      duration: 5,
      fps: 24,
      n: 1,
      imageURL: 'https://b0.bdstatic.com/ugc/oCkIS81PtxUJGhJv6tqHnAa283fc0b5833666bafcb6a44bb5e553a.jpg',
      imageRole: 'reference_image',
      imageBase64List: [],
      inputReferenceFiles: [],
      metadataText: '',
    },
  },
];

const SEEDREAM_MIN_PIXELS = 3686400;
export const DOUBAO_SEEDREAM_MODEL = 'doubao-seedream-5-0-260128';
export const DOUBAO_SEEDREAM_PRO_MODEL = 'doubao-seedream-5-0-pro-260628';
const DOUBAO_SEEDREAM_MODELS = new Set([
  DOUBAO_SEEDREAM_MODEL,
  DOUBAO_SEEDREAM_PRO_MODEL,
]);
export const SEEDREAM_MODEL = 'ByteDance-Seedream-5.0';
export const SEEDREAM_DEFAULT_SIZE = '1920x1920';
export const DOUBAO_SEEDREAM_ASPECT_RATIO_SIZE_OPTIONS = [
  { aspectRatio: '16:9', size: '2848x1600' },
  { aspectRatio: '9:16', size: '1600x2848' },
  { aspectRatio: '1:1', size: '2048x2048' },
];
export const COSYVOICE_MODEL = 'cosyvoice-v3-flash';
// 语音「模式」下拉对应的固定风格指令前缀，提交时拼接为「前缀 + 空行 + 朗读文本」
export const AUDIO_MODE_PREFIXES = {
  narration: '请使用自然、克制的中文旁白语气朗读以下内容，语速稍快一些，停顿更干净，整体紧凑但保持清晰，不要添加额外文本。',
  dialogue: '请使用有情绪但不过度夸张的中文对白语气朗读以下内容，语速稍快一些，保持语义清晰和咬字清楚，不要添加额外文本。',
};
// CosyVoice-v3-Flash 官方系统音色（精选 10 个 _v3 系列音色，默认 longanwen_v3）
// 注：_v2 系列音色属于 CosyVoice-v2，不被 cosyvoice-v3-flash 支持，故不收录
export const COSYVOICE_VOICES = [
  { voice: 'longanwen_v3', name: '龙安温', gender: '女', description: '优雅知性女' },
  { voice: 'longanya_v3', name: '龙安雅', gender: '女', description: '高雅气质女' },
  { voice: 'longwanjun_v3', name: '龙婉君', gender: '女', description: '细腻柔声女' },
  { voice: 'longanqin_v3', name: '龙安亲', gender: '女', description: '亲和活泼女' },
  { voice: 'longfeifei_v3', name: '龙菲菲', gender: '女', description: '甜美娇气女' },
  { voice: 'longanzhi_v3', name: '龙安智', gender: '男', description: '睿智轻熟男' },
  { voice: 'longanshuo_v3', name: '龙安朔', gender: '男', description: '干净清爽男' },
  { voice: 'longanlang_v3', name: '龙安朗', gender: '男', description: '清爽利落男' },
  { voice: 'longyichen_v3', name: '龙逸尘', gender: '男', description: '洒脱活力男' },
  { voice: 'longanyang', name: '龙安洋', gender: '男', description: '阳光大男孩' },
];
// 模型 → 音色列表映射（音色跟随当前模型）
export const MODEL_VOICE_OPTIONS = {
  [COSYVOICE_MODEL]: COSYVOICE_VOICES,
};
// 按当前模型获取可选音色列表
export function getVoicesByModel(model) {
  return MODEL_VOICE_OPTIONS[String(model || '').trim()] || [];
}
export const KLING_V3_MODEL = 'kling-v3';
export const GROK_IMAGINE_VIDEO_MODEL = 'grok-imagine-video';
export const VEO_3_1_STANDARD_MODEL = 'veo-3.1-generate-preview';
export const VEO_3_1_FAST_MODEL = 'veo-3.1-fast-generate-preview';
export const VEO_3_1_FAST_ALIAS_MODEL = 'veo_3_1-fast';
export const DOUBAO_SEEDANCE_SHORT_MODEL = 'doubao-seedance-2-0';
export const DOUBAO_SEEDANCE_DOT_SHORT_MODEL = 'doubao-seedance-2.0';
export const DOUBAO_SEEDANCE_DOT_SHORT_TEST_MODEL = 'doubao-seedance-2.0-test';
export const SEEDANCE_2_0_720P_MODEL = 'Seedance2.0-720p';
export const SEEDANCE_2_0_1080P_MODEL = 'Seedance2.0-1080p';
export const SEEDANCE_2_5_720P_MODEL = 'Seedance2.5-720p';
export const DOUBAO_SEEDANCE_STANDARD_MODEL = 'doubao-seedance-2-0-260128';
export const DOUBAO_SEEDANCE_FAST_MODEL = 'doubao-seedance-2-0-fast-260128';
export const DOUBAO_SEEDANCE_MINI_MODEL = 'doubao-seedance-2-0-mini-260615';
export const DOUBAO_SEEDANCE_FULL_01_MODEL = 'seedance2.0-满血版01';
export const DOUBAO_SEEDANCE_FULL_01_FAST_MODEL = 'seedance2.0-满血版01-fast';
export const DOUBAO_SEEDANCE_FULL_02_MODEL = 'seedance2.0-满血版02';
export const DOUBAO_SEEDANCE_FULL_02_720P_MODEL = 'seedance2.0-满血版02-720p';
export const DOUBAO_SEEDANCE_FULL_02_1080P_MODEL = 'seedance2.0-满血版02-1080p';
export const DOUBAO_SEEDANCE_FULL_03_MODEL = 'seedance2.0-满血版03';
export const DOUBAO_SEEDANCE_FULL_03_FAST_MODEL = 'seedance2.0-满血版03-fast';
export const DOUBAO_SEEDANCE_FULL_03_MINI_MODEL = 'seedance2.0-满血版03-mini';

const VIDEO_GENERATION_MODELS = new Set([
  DOUBAO_SEEDANCE_SHORT_MODEL,
  DOUBAO_SEEDANCE_DOT_SHORT_MODEL,
  DOUBAO_SEEDANCE_DOT_SHORT_TEST_MODEL,
  SEEDANCE_2_0_720P_MODEL,
  SEEDANCE_2_0_1080P_MODEL,
  SEEDANCE_2_5_720P_MODEL,
]);

const DOUBAO_SEEDANCE_FORM_MODELS = new Set([
  DOUBAO_SEEDANCE_STANDARD_MODEL,
  DOUBAO_SEEDANCE_FAST_MODEL,
  DOUBAO_SEEDANCE_MINI_MODEL,
  DOUBAO_SEEDANCE_FULL_01_MODEL,
  DOUBAO_SEEDANCE_FULL_01_FAST_MODEL,
  DOUBAO_SEEDANCE_FULL_02_MODEL,
  DOUBAO_SEEDANCE_FULL_02_720P_MODEL,
  DOUBAO_SEEDANCE_FULL_02_1080P_MODEL,
  DOUBAO_SEEDANCE_FULL_03_MODEL,
  DOUBAO_SEEDANCE_FULL_03_FAST_MODEL,
  DOUBAO_SEEDANCE_FULL_03_MINI_MODEL,
]);

export function getCapabilities() {
  return CAPABILITIES;
}

export function getCapability(id) {
  const capability = CAPABILITIES.find((item) => item.id === id);
  if (!capability) {
    throw new Error(`未知能力类型: ${id}`);
  }
  return capability;
}

export function getModelRequestConfig(id) {
  const capability = getCapability(id);
  return {
    defaultPath: capability.defaultPath,
    contentType: capability.contentType,
    taskPath: capability.taskPath || '/v1/videos',
  };
}

// 解析实际提交用的 Content-Type，默认使用模型静态配置。
export function resolveRequestContentType(id, model) {
  return getModelRequestConfig(id, model).contentType;
}

export function createDefaultForm(id) {
  return structuredCloneSafe(getCapability(id).defaults);
}

export function buildCapabilityPayload(id, form) {
  if (id === 'text') {
    return buildTextPayload(form);
  }
  if (id === 'image') {
    return buildImagePayload(form);
  }
  if (id === 'image-to-image') {
    return buildImageToImagePayload(form);
  }
  if (id === 'audio') {
    return buildAudioPayload(form);
  }
  if (id === 'video') {
    return buildVideoPayload(form);
  }
  throw new Error(`未知能力类型: ${id}`);
}

export function getPrimaryPrompt(id, form) {
  if (id === 'audio') {
    return form.input || '';
  }
  return form.prompt || '';
}

function buildTextPayload(form) {
  if (!form.prompt?.trim()) {
    throw new Error('用户输入不能为空');
  }
  const messages = [];
  const systemPrompt = form.systemPrompt?.trim();
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: form.prompt.trim() });

  return {
    model: form.model.trim(),
    messages,
    temperature: Number(form.temperature),
    max_tokens: Number(form.maxTokens),
  };
}

function buildImagePayload(form) {
  if (!form.prompt?.trim()) {
    throw new Error('提示词不能为空');
  }
  const size = normalizeImageSize(form.model, form.size);
  return {
    model: form.model.trim(),
    prompt: form.prompt.trim(),
    size,
    quality: form.quality,
    n: Number(form.n),
  };
}

export function normalizeImageSize(model, size) {
  const normalizedSize = String(size || '').trim();
  if (isDoubaoSeedreamModel(model)) {
    return getDoubaoSeedreamSizeBySize(normalizedSize)
      || getDoubaoSeedreamSizeByAspectRatio('16:9');
  }
  if (!isSeedreamModel(model)) {
    return normalizedSize;
  }
  const dimensions = getDimensions(normalizedSize);
  if (dimensions.width * dimensions.height >= SEEDREAM_MIN_PIXELS) {
    return normalizedSize;
  }
  return SEEDREAM_DEFAULT_SIZE;
}

function buildImageToImagePayload(form) {
  const payload = buildImagePayload(form);
  const imageURLs = splitImageURLs(form.imageURL);
  const imageFile = form.imageFile || null;
  // image 文件（满足 newapi 平台 image is required）与 image_urls（URL）至少提供一项
  if (!imageURLs.length && !imageFile) {
    throw new Error('请提供参考图：上传 image 图片或填写参考图 URL');
  }
  if (imageURLs.length) {
    payload.image_urls = imageURLs;
  }
  if (imageFile) {
    payload.image = imageFile;
  }
  return payload;
}

export function isSeedreamModel(model) {
  const value = String(model || '').trim();
  return isDoubaoSeedreamModel(value) || value === SEEDREAM_MODEL;
}

export function isDoubaoSeedreamModel(model) {
  return DOUBAO_SEEDREAM_MODELS.has(String(model || '').trim());
}

export function getDoubaoSeedreamSizeByAspectRatio(aspectRatio) {
  return DOUBAO_SEEDREAM_ASPECT_RATIO_SIZE_OPTIONS
    .find((item) => item.aspectRatio === String(aspectRatio || '').trim())
    ?.size || '';
}

export function getDoubaoSeedreamAspectRatioBySize(size) {
  return DOUBAO_SEEDREAM_ASPECT_RATIO_SIZE_OPTIONS
    .find((item) => item.size === String(size || '').trim())
    ?.aspectRatio || '';
}

function getDoubaoSeedreamSizeBySize(size) {
  return DOUBAO_SEEDREAM_ASPECT_RATIO_SIZE_OPTIONS
    .find((item) => item.size === String(size || '').trim())
    ?.size || '';
}

function buildAudioPayload(form) {
  if (!form.input?.trim()) {
    throw new Error('文本不能为空');
  }
  const prefix = AUDIO_MODE_PREFIXES[String(form.mode || '').trim()] || '';
  const content = prefix ? `${prefix}\n\n${form.input.trim()}` : form.input.trim();
  return {
    model: form.model.trim(),
    modalities: ['text', 'audio'],
    audio: {
      voice: form.voice,
      format: form.responseFormat,
    },
    messages: [
      { role: 'user', content },
    ],
  };
}

// 视频统一按 OpenAI 视频任务格式（POST /v1/videos）构建：
// model / prompt / seconds / size / metadata(扩展参数) + 图片输入
// URL 图片使用 image_urls 结构化数组；上传图片使用 image 重复字段；参考图使用 input_reference 重复字段。
function buildVideoPayload(form) {
  if (!form.prompt?.trim()) {
    throw new Error('提示词不能为空');
  }
  getDimensions(form.size);
  const duration = getNormalizedVideoDuration(form.model, Number(form.duration));
  const metadata = parseMetadata(form.metadataText);
  const imageURLs = collectSubmittedImageURLs(form);
  const imageUploads = collectSubmittedImageUploads(form);
  const inputReferences = collectInputReferences(form);

  const payload = {
    model: form.model.trim(),
    prompt: form.prompt.trim(),
    seconds: duration,
    size: String(form.size || '').trim(),
  };

  if (imageURLs.length) {
    payload.image_urls = imageURLs;
  }

  if (imageUploads.length) {
    payload.image = imageUploads.length === 1 ? imageUploads[0] : imageUploads;
  }

  if (inputReferences.length) {
    payload.input_reference = inputReferences;
  }

  if (Object.keys(metadata).length) {
    payload.metadata = metadata;
  }

  return payload;
}

function collectSubmittedImageURLs(form) {
  const role = String(form.imageRole || 'reference_image').trim() || 'reference_image';
  return splitImageURLs(form.imageURL).map((url) => ({ url, role }));
}

function collectSubmittedImageUploads(form) {
  return normalizeMediaParts(Array.isArray(form.imageBase64List) ? form.imageBase64List : []);
}

function collectInputReferences(form) {
  return normalizeMediaParts(Array.isArray(form.inputReferenceFiles) ? form.inputReferenceFiles : []);
}


function normalizeMediaParts(values) {
  return values
    .map((value) => (typeof value === 'string' ? value.trim() : value))
    .filter(Boolean);
}

export function isVideoGenerationModel(model) {
  return VIDEO_GENERATION_MODELS.has(String(model || '').trim());
}

export function getDurationConstraints(model) {
  if (isKlingV3Model(model)) {
    return { min: 3, max: 15, fallback: 5 };
  }
  if (isVideoGenerationModel(model) || isDoubaoSeedanceStandardModel(model)) {
    return { min: 4, max: 15, fallback: 5 };
  }
  if (isGrokImagineVideoModel(model)) {
    return { min: 1, max: 15, fallback: 6 };
  }
  if (isVeo31VideoModel(model)) {
    return { min: 4, max: 8, fallback: 4 };
  }
  return { min: 1, max: Infinity, fallback: 2 };
}

function getNormalizedVideoDuration(model, duration) {
  if (isVideoGenerationModel(model) || isDoubaoSeedanceStandardModel(model)) {
    return normalizeSeedanceDuration(duration);
  }
  return isVeo31VideoModel(model)
    ? normalizeVeo31Duration(duration)
    : normalizeDefaultVideoDuration(duration);
}

function isKlingV3Model(model) {
  return String(model || '').trim() === KLING_V3_MODEL;
}

function isGrokImagineVideoModel(model) {
  return String(model || '').trim() === GROK_IMAGINE_VIDEO_MODEL;
}

function isDoubaoSeedanceStandardModel(model) {
  return DOUBAO_SEEDANCE_FORM_MODELS.has(String(model || '').trim());
}

function isVeo31VideoModel(model) {
  const value = String(model || '').trim();
  return value === VEO_3_1_STANDARD_MODEL
    || value === VEO_3_1_FAST_MODEL
    || value === VEO_3_1_FAST_ALIAS_MODEL;
}

function normalizeVeo31Duration(duration) {
  const value = Number(duration);
  if (!Number.isFinite(value) || value < 4) {
    return 4;
  }
  if (value > 8) {
    return 8;
  }
  return Math.trunc(value);
}

function normalizeSeedanceDuration(duration) {
  const value = Number(duration);
  if (!Number.isFinite(value) || value < 4) {
    return 5;
  }
  if (value > 15) {
    return 15;
  }
  return Math.trunc(value);
}

function normalizeDefaultVideoDuration(duration) {
  const value = Number(duration);
  if (!Number.isFinite(value) || value < 1) {
    return 2;
  }
  return Math.trunc(value);
}

function parseMetadata(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return {};
  }
  try {
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      throw new Error('metadata 必须是 JSON 对象');
    }
    return value;
  } catch (e) {
    if (e.message === 'metadata 必须是 JSON 对象') throw e;
    throw new Error('Metadata JSON 格式无效，请检查语法');
  }
}

function splitImageURLs(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function getDimensions(size) {
  const match = /^(\d+)x(\d+)$/i.exec(String(size || '').trim());
  if (!match) {
    throw new Error(`无效的尺寸格式「${size}」，应为 WxH，如 1280x720`);
  }
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
