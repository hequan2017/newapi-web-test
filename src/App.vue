<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import {
  buildRequestPreview,
  getTaskStatus,
  getVideoContent,
  isTerminalStatus,
  normalizePath,
  sendModelRequest,
  serializePreviewPayload,
} from './api';
import { normalizeLanguage, translate, translateDynamic } from './i18n';
import {
  createVideoResolutionLabel,
  createVideoResolutionLabelFromSize,
} from './videoResolution';
import {
  AUDIO_MODE_PREFIXES,
  getVoicesByModel,
  buildCapabilityPayload,
  createDefaultForm,
  getCapabilities,
  getCapability,
  getDurationConstraints,
  getDoubaoSeedreamAspectRatioBySize,
  getDoubaoSeedreamSizeByAspectRatio,
  getModelRequestConfig,
  getPrimaryPrompt,
  resolveRequestContentType,
  isDoubaoSeedreamModel,
  isSeedreamModel,
  normalizeImageSize,
  DOUBAO_SEEDREAM_ASPECT_RATIO_SIZE_OPTIONS,
  SEEDREAM_DEFAULT_SIZE,
} from './modelPresets';

const MAX_HISTORY_ITEMS = 50;
const MAX_POLL_COUNT = 200;
const POLL_INTERVAL_MS = 5000;
const HISTORY_GENERATION_TYPE_LABELS = {
  text: '文生文',
  image: '文生图',
  'image-to-image': '图生图',
  audio: '文生语音',
  video: '文生视频',
};

const historyStorageKey = 'newapi-model-test-history';
const templateStorageKey = 'newapi-model-test-templates';
const themeStorageKey = 'newapi-model-test-theme';
const languageStorageKey = 'newapi-model-test-language';
const HISTORY_STATUS_FILTERS = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '等待中' },
  { value: 'submitted', label: '已提交' },
  { value: 'processing', label: '处理中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'cancelled', label: '已取消' },
];

const environments = [{ id: 'test', label: '测试环境' }];
const selectedEnvironmentId = ref('test');
const apiBase = ref('');
const apiKey = ref('');
const isConnectionSettingsOpen = ref(false);
const settingsApiBase = ref('');
const settingsApiKey = ref('');
const showSettingsApiKey = ref(false);
const activeCapabilityId = ref('video');
const activeWorkspace = ref('generator');
const colorTheme = ref(loadColorTheme());
const uiLanguage = ref(loadLanguage());
const defaultVideoForm = createDefaultForm('video');
const defaultVideoRequestConfig = getModelRequestConfig('video', defaultVideoForm.model);
const requestPath = ref(defaultVideoRequestConfig.defaultPath);
const form = reactive(defaultVideoForm);
const jsonPayloadText = ref('');
const jsonEdited = ref(false);
const statusText = ref('待提交');
const statusKind = ref('idle');
const isSubmitting = ref(false);
const submittedPayload = ref(null);
const lastContentType = ref(defaultVideoRequestConfig.contentType);
const rawResponse = ref({});
let prevBlobURL = null;
let prevVideoContentURL = null;
const currentTask = ref(null);
const currentTaskPath = ref(defaultVideoRequestConfig.taskPath);
const authenticatedVideoURL = ref('');
const authenticatedVideoTaskID = ref('');
const detectedVideoResolution = ref(null);
const currentHistoryId = ref('');
const selectedHistoryId = ref(null);
const selectedImageFileName = ref('');
const templateName = ref('');
const selectedTemplateId = ref('');
const requestTemplates = ref(loadRequestTemplates());
const historyCapabilityFilter = ref('all');
const historyStatusFilter = ref('all');
const historySearchText = ref('');
const detailHistoryItem = ref(null);
const errorDiagnosis = ref(null);
const copyStatus = reactive({
  request: '',
  response: '',
  report: '',
});
const taskHistory = ref(loadTaskHistory());
const pollTimer = ref(0);
const pollCount = ref(0);
// 轮询代际：每次提交/切换/清空自增，用于丢弃在途的旧轮询回调，避免覆盖最新任务状态
const pollGeneration = ref(0);

const capabilities = getCapabilities();

const isDarkTheme = computed(() => colorTheme.value === 'dark');
const isEnglish = computed(() => uiLanguage.value === 'en');
const labelSeparator = computed(() => (isEnglish.value ? ':' : '：'));
const localizedCapabilities = computed(() => {
  return capabilities.map((item) => ({ ...item, label: getCapabilityLabel(item.id) }));
});
const localizedHistoryStatusFilters = computed(() => {
  return HISTORY_STATUS_FILTERS.map((item) => ({ ...item, label: t(item.label) }));
});
const displayStatusText = computed(() => translateDynamic(uiLanguage.value, statusText.value));
const currentEnvironment = computed(() => {
  const environment = environments.find((item) => item.id === selectedEnvironmentId.value) || environments[0];
  return { ...environment, apiBase: apiBase.value.trim() };
});
const currentCapability = computed(() => getCapability(activeCapabilityId.value));
const currentCapabilityLabel = computed(() => getCapabilityLabel(activeCapabilityId.value));
const currentCapabilitySubmitLabel = computed(() => t(currentCapability.value.submitLabel));
const currentEnvironmentLabel = computed(() => getEnvironmentLabel(currentEnvironment.value));
const currentRequestConfig = computed(() => getModelRequestConfig(activeCapabilityId.value, form.model));
const isConnectionConfigured = computed(() => Boolean(apiBase.value.trim() && apiKey.value.trim()));

const durationMin = computed(() => {
  if (activeCapabilityId.value !== 'video') return 1;
  return getDurationConstraints(form.model).min;
});

const endpointURL = computed(() => {
  const base = apiBase.value.replace(/\/+$/, '');
  const path = normalizePath(requestPath.value);
  try {
    return buildRequestPreview({
      apiBase: base,
      apiKey: '',
      path,
      contentType: currentRequestConfig.value.contentType,
      payload: buildFormPayload(),
    }).url;
  } catch {
    return base ? `${base}${path}` : path;
  }
});

const docsURL = computed(() => currentCapability.value.docsURL);

const currentCapabilityTemplates = computed(() => {
  return requestTemplates.value.filter((item) => item.capability === activeCapabilityId.value);
});

const selectedTemplate = computed(() => {
  return currentCapabilityTemplates.value.find((item) => item.id === selectedTemplateId.value)
    || currentCapabilityTemplates.value[0]
    || null;
});

const filteredTaskHistory = computed(() => {
  const keyword = historySearchText.value.trim().toLowerCase();
  return taskHistory.value.filter((item) => {
    const capabilityMatched = historyCapabilityFilter.value === 'all'
      || item.capability === historyCapabilityFilter.value;
    const statusMatched = historyStatusFilter.value === 'all'
      || normalizeTaskStatus(item.status) === historyStatusFilter.value;
    const keywordMatched = !keyword || [
      item.prompt,
      item.path,
      item.contentType,
      item.capabilityLabel,
      item.generationTypeLabel,
      item.environment?.label,
      getCapabilityLabel(item.capability),
      getGenerationTypeLabel(item.capability),
      getEnvironmentLabel(item.environment),
      item.environment?.apiBase,
      item.request?.url,
      getVideoTaskID(item.response),
      item.response?.id,
    ].some((value) => String(value || '').toLowerCase().includes(keyword));
    return capabilityMatched && statusMatched && keywordMatched;
  });
});

const historyStats = computed(() => {
  const total = taskHistory.value.length;
  const success = taskHistory.value.filter((item) => isSuccessfulTaskStatus(item.status)).length;
  const failed = taskHistory.value.filter((item) => ['failed', 'cancelled'].includes(normalizeTaskStatus(item.status))).length;
  const running = total - success - failed;
  const durations = taskHistory.value
    .map((item) => Number(item.durationMs))
    .filter((value) => Number.isFinite(value));
  const averageDurationMs = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : NaN;
  const successRate = total ? Math.round((success / total) * 100) : 0;
  return {
    total,
    success,
    failed,
    running,
    averageDurationMs,
    successRate,
  };
});

const availableModelGroups = computed(() => {
  const modelsByCapability = new Map(
    capabilities.map((item) => [item.id, new Set()]),
  );

  taskHistory.value.forEach((item) => {
    if (!isSuccessfulTaskStatus(item.status)) {
      return;
    }
    const model = String(item.request?.body?.model || '').trim();
    const models = modelsByCapability.get(item.capability);
    if (model && models) {
      models.add(model);
    }
  });

  return capabilities
    .map((item) => ({
      id: item.id,
      label: getCapabilityLabel(item.id),
      models: [...modelsByCapability.get(item.id)],
    }))
    .filter((item) => item.models.length > 0);
});

const capabilityMatrix = computed(() => {
  return capabilities.map((item) => {
    const config = getModelRequestConfig(item.id, item.defaults?.model);
    return {
      id: item.id,
      label: getCapabilityLabel(item.id),
      modelCount: item.models.length,
      models: item.models.join('、'),
      defaultPath: config.defaultPath,
      contentType: config.contentType,
      taskPath: config.taskPath,
      docsURL: item.docsURL,
    };
  });
});

const imageAspectRatioOptions = computed(() => {
  if (!isDoubaoSeedreamModel(form.model)) {
    return [];
  }
  return DOUBAO_SEEDREAM_ASPECT_RATIO_SIZE_OPTIONS;
});

const imageSizeOptions = computed(() => {
  const options = ['1024x1024', '1024x1792', '1792x1024'];
  if (isDoubaoSeedreamModel(form.model)) {
    return DOUBAO_SEEDREAM_ASPECT_RATIO_SIZE_OPTIONS.map((item) => item.size);
  }
  if (isSeedreamModel(form.model)) {
    return [SEEDREAM_DEFAULT_SIZE];
  }
  return options;
});

const textResult = computed(() => {
  return rawResponse.value?.choices?.[0]?.message?.content
    || rawResponse.value?.choices?.[0]?.text
    || '';
});

const imageURLs = computed(() => {
  if (!isImageCapability(activeCapabilityId.value)) {
    return [];
  }
  const data = rawResponse.value?.data;
  if (Array.isArray(data)) {
    return data.map((item) => item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : '')).filter(Boolean);
  }
  return getGeminiInlineImages(rawResponse.value);
});

const audioURL = computed(() => {
  return rawResponse.value?.url
    || rawResponse.value?.audio_url
    || getChatCompletionAudioURL(rawResponse.value)
    || '';
});

// 当前模型可选音色列表（音色跟随当前模型）
const voiceOptions = computed(() => getVoicesByModel(form.model));
// 当前选中音色的介绍（仅语音能力显示）
const audioVoiceDescription = computed(() => {
  if (activeCapabilityId.value !== 'audio') return '';
  const item = voiceOptions.value.find((v) => v.voice === form.voice);
  if (!item) return '';
  return isEnglish.value
    ? `${item.voice} (${t(item.gender)}): ${t(item.description)}`
    : `${item.name}（${item.gender}）：${item.description}`;
});

const videoURL = computed(() => {
  if (!currentTask.value?.id || !isSuccessfulTaskStatus(currentTask.value.status)) {
    return '';
  }
  // 优先走 /content 代理流（避免直链受 CDN 时效/CORS 影响）；仅在响应里是明确视频文件地址时回退直链。
  if (authenticatedVideoTaskID.value === currentTask.value.id && authenticatedVideoURL.value) {
    return authenticatedVideoURL.value;
  }
  const directURL = getVideoDirectURL(currentTask.value);
  return isPlayableVideoURL(directURL) ? directURL : '';
});

const videoResolution = computed(() => {
  if (
    activeCapabilityId.value !== 'video'
    || !currentTask.value?.id
    || !isSuccessfulTaskStatus(currentTask.value.status)
  ) {
    return null;
  }
  return detectedVideoResolution.value
    || createVideoResolutionLabelFromSize(getVideoFormSize(submittedPayload.value?.body || {}));
});

const videoResolutionLevel = computed(() => videoResolution.value?.resolution || t('未分档'));

const videoIs1080p = computed(() => {
  return getVideoIs1080pText(videoResolution.value);
});

const videoResolutionSource = computed(() => {
  if (!videoResolution.value) return '-';
  return videoResolution.value.source === 'actual'
    ? t('视频实际元数据')
    : t('请求参数（兜底）');
});

const detailVideoResolution = computed(() => {
  const item = detailHistoryItem.value;
  if (item?.capability !== 'video') return null;
  const taskID = getVideoTaskID(item.response);
  if (
    detectedVideoResolution.value
    && item.id === currentHistoryId.value
    && taskID
    && taskID === currentTask.value?.id
  ) {
    return detectedVideoResolution.value;
  }
  return createVideoResolutionLabelFromSize(getVideoFormSize(item.request?.body || {}));
});

const detailVideoResolutionLevel = computed(() => detailVideoResolution.value?.resolution || t('未分档'));
const detailVideoIs1080p = computed(() => getVideoIs1080pText(detailVideoResolution.value));
const detailVideoResolutionSource = computed(() => {
  if (!detailVideoResolution.value) return '-';
  return detailVideoResolution.value.source === 'actual'
    ? t('视频实际元数据')
    : t('历史请求参数');
});

const currentHistoryItem = computed(() => {
  return taskHistory.value.find((item) => item.id === currentHistoryId.value) || null;
});

const currentDurationLabel = computed(() => getHistoryDurationLabel(currentHistoryItem.value));
const currentDurationText = computed(() => formatHistoryDuration(currentHistoryItem.value));

const hasDownloadableVideo = computed(() => {
  return activeCapabilityId.value === 'video'
    && Boolean(currentTask.value?.id)
    && isSuccessfulTaskStatus(currentTask.value.status);
});

const taskProgressPercent = computed(() => {
  const value = parseTaskProgress(currentTask.value?.progress);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.trunc(value)));
});

const showTaskProgress = computed(() => {
  if (activeCapabilityId.value !== 'video' || !currentTask.value?.id) {
    return false;
  }
  return !videoURL.value && !isTerminalStatus(currentTask.value.status);
});

const taskProgressLabel = computed(() => {
  const status = currentTask.value?.status || 'unknown';
  const percent = taskProgressPercent.value;
  // 部分视频渠道（如火山 Ark）查询响应不返回 progress，此时展示状态文字而非 0%
  return percent > 0 ? `${status} / ${percent}%` : `${status} / ${t('生成中')}`;
});

watch(
  taskHistory,
  (history) => {
    try {
      window.localStorage.setItem(historyStorageKey, JSON.stringify(history));
    } catch {
      // localStorage 满时静默忽略
    }
  },
  { deep: true },
);

watch(
  requestTemplates,
  (templates) => {
    try {
      window.localStorage.setItem(templateStorageKey, JSON.stringify(templates));
    } catch {
      // localStorage 满时静默忽略
    }
  },
  { deep: true },
);

watch(
  colorTheme,
  (theme) => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch {
      // localStorage 不可用时仍保留当前会话的主题
    }
  },
  { immediate: true },
);

watch(
  uiLanguage,
  (language) => {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.title = language === 'en' ? 'Model Lab · New API' : '模型实验室 · New API';
    try {
      window.localStorage.setItem(languageStorageKey, language);
    } catch {
      // localStorage 不可用时仍保留当前会话的语言
    }
  },
  { immediate: true },
);

watch(
  () => form.model,
  () => {
    syncRequestPathFromModel();
    if (isImageCapability(activeCapabilityId.value)) {
      syncDoubaoSeedreamImageSizeFromRatio();
      if (!isDoubaoSeedreamModel(form.model)) {
        delete form.aspectRatio;
        form.size = normalizeImageSize(form.model, form.size);
      }
    }
    if (activeCapabilityId.value === 'video') {
      const { min, max, fallback } = getDurationConstraints(form.model);
      if (form.duration < min || form.duration > max) {
        form.duration = fallback;
      }
    }
    syncJSONFromForm();
  },
);

watch(videoURL, () => {
  detectedVideoResolution.value = null;
});

watch(
  () => form.aspectRatio,
  () => {
    if (isImageCapability(activeCapabilityId.value)) {
      syncDoubaoSeedreamImageSizeFromRatio();
    }
  },
);

watch(
  () => form.size,
  () => {
    if (isImageCapability(activeCapabilityId.value)) {
      syncDoubaoSeedreamRatioFromImageSize();
    }
  },
);

watch(
  form,
  () => {
    if (!jsonEdited.value) {
      syncJSONFromForm();
    }
  },
  { deep: true },
);

onBeforeUnmount(() => {
  clearPolling();
  revokePrevBlobURL();
  revokePrevVideoContentURL();
});

syncJSONFromForm();

function switchCapability(id) {
  pollGeneration.value += 1;
  activeCapabilityId.value = id;
  requestPath.value = getCapability(id).defaultPath;
  resetForm(createDefaultForm(id));
  syncRequestPathFromModel();
  submittedPayload.value = null;
  lastContentType.value = currentRequestConfig.value.contentType;
  rawResponse.value = {};
  currentTask.value = null;
  currentTaskPath.value = currentRequestConfig.value.taskPath;
  revokePrevVideoContentURL();
  errorDiagnosis.value = null;
  statusKind.value = 'idle';
  statusText.value = '待提交';
  selectedImageFileName.value = '';
  jsonEdited.value = false;
  syncJSONFromForm();
}

function openCapability(id) {
  activeWorkspace.value = 'generator';
  switchCapability(id);
}

function openWorkspace(workspace) {
  activeWorkspace.value = workspace;
}

function resetForm(defaults) {
  Object.keys(form).forEach((key) => {
    delete form[key];
  });
  Object.assign(form, defaults);
}

function buildFormPayload() {
  return buildCapabilityPayload(activeCapabilityId.value, form);
}

function isImageCapability(id) {
  return id === 'image' || id === 'image-to-image';
}

function syncDoubaoSeedreamImageSizeFromRatio() {
  if (!isDoubaoSeedreamModel(form.model)) {
    return;
  }
  const nextSize = getDoubaoSeedreamSizeByAspectRatio(form.aspectRatio || '16:9');
  if (nextSize && form.size !== nextSize) {
    form.size = nextSize;
  }
}

function syncDoubaoSeedreamRatioFromImageSize() {
  if (!isDoubaoSeedreamModel(form.model)) {
    return;
  }
  const nextRatio = getDoubaoSeedreamAspectRatioBySize(form.size);
  if (nextRatio && form.aspectRatio !== nextRatio) {
    form.aspectRatio = nextRatio;
  }
}

function syncRequestPathFromModel() {
  if (!isImageCapability(activeCapabilityId.value)) {
    requestPath.value = currentRequestConfig.value.defaultPath;
    return;
  }
  const defaultPath = currentRequestConfig.value.defaultPath;
  const model = String(form.model || '').trim();
  requestPath.value = model.toLowerCase().includes('gemini')
    ? `/v1beta/models/${encodeURIComponent(model)}:generateContent`
    : defaultPath;
}

function syncJSONFromForm() {
  try {
    jsonPayloadText.value = JSON.stringify(serializePreviewPayload(buildFormPayload()), null, 2);
    jsonEdited.value = false;
  } catch {
    jsonPayloadText.value = '';
  }
}

function onJSONInput() {
  jsonEdited.value = true;
}

function parseJSONPayload() {
  const text = jsonPayloadText.value.trim();
  if (!text) {
    throw new Error('JSON 请求体不能为空');
  }
  const payload = JSON.parse(text);
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    throw new Error('JSON 请求体必须是对象');
  }
  return payload;
}

async function onImageFileChange(event) {
  const file = event.target.files?.[0] || null;
  form.imageFile = file;
  selectedImageFileName.value = file ? file.name : '';
  syncJSONFromForm();
}

async function submitFormTask() {
  if (!ensureConnectionConfigured()) {
    return;
  }
  let payload;
  try {
    payload = buildFormPayload();
  } catch (error) {
    showError(error, { updateHistory: false });
    return;
  }
  try {
    const submitContentType = resolveRequestContentType(activeCapabilityId.value, form.model, form);
    await submitPayload(payload, submitContentType);
  } catch (error) {
    showError(error);
  }
}

async function submitJSONTask() {
  if (!ensureConnectionConfigured()) {
    return;
  }
  let payload;
  try {
    payload = parseJSONPayload();
  } catch (error) {
    showError(error, { updateHistory: false });
    return;
  }
  try {
    await submitPayload(payload, 'json');
  } catch (error) {
    showError(error);
  }
}

async function submitPayload(payload, contentType) {
  clearPolling();
  pollGeneration.value += 1;
  revokePrevVideoContentURL();
  errorDiagnosis.value = null;
  isSubmitting.value = true;
  statusKind.value = 'running';
  statusText.value = '提交中';
  lastContentType.value = contentType;
  const requestStartedAt = Date.now();
  let historyId = '';

  try {
    const requestPreview = buildRequestPreview({
      apiBase: apiBase.value.trim(),
      apiKey: maskAPIKey(apiKey.value.trim()),
      path: requestPath.value.trim(),
      contentType,
      payload,
    });
    submittedPayload.value = requestPreview;
    historyId = addHistoryItem(requestPreview, contentType, requestStartedAt);
    currentTaskPath.value = currentRequestConfig.value.taskPath;
    currentHistoryId.value = historyId;
    const response = await sendModelRequest({
      apiBase: apiBase.value.trim(),
      apiKey: apiKey.value.trim(),
      path: requestPath.value.trim(),
      contentType,
      payload,
    });
    const responseReceivedAt = Date.now();
    const durationMs = responseReceivedAt - requestStartedAt;
    const taskID = getVideoTaskID(response);
    const isVideoTask = activeCapabilityId.value === 'video' && Boolean(taskID);
    const normalizedVideoTask = isVideoTask ? normalizeVideoTask(response) : null;
    const isTerminalVideoTask = normalizedVideoTask && isTerminalStatus(normalizedVideoTask.status);

    updateHistoryItem(historyId, {
      status: getResponseHistoryStatus(response),
      response,
      ...(!isVideoTask ? { durationMs } : {}),
      ...(isTerminalVideoTask ? getTerminalTimingPatch(historyId, responseReceivedAt) : {}),
    });
    setResponse(response);
    statusKind.value = 'ok';
    statusText.value = '请求完成';
    validateAudioResponse();

    if (activeCapabilityId.value === 'video' && taskID) {
      currentTask.value = normalizedVideoTask;
      if (isTerminalStatus(currentTask.value.status)) {
        if (isSuccessfulTaskStatus(currentTask.value.status)) {
          await loadVideoContent(currentTask.value);
        }
        statusKind.value = isSuccessfulTaskStatus(currentTask.value.status) ? 'ok' : 'error';
        statusText.value = isSuccessfulTaskStatus(currentTask.value.status) ? '生成完成' : `任务结束：${currentTask.value.status}`;
        return;
      }
      statusText.value = `已提交：${taskID}`;
      pollCount.value = 0;
      schedulePoll(taskID);
    }
  } catch (error) {
    if (historyId) {
      updateHistoryItem(historyId, {
        ...getTerminalTimingPatch(historyId),
      });
    }
    throw error;
  } finally {
    isSubmitting.value = false;
  }
}

async function refreshTask() {
  if (!currentTask.value?.id) {
    statusKind.value = 'error';
    statusText.value = '暂无可刷新任务';
    return;
  }
  clearPolling();
  statusKind.value = 'running';
  statusText.value = '正在刷新状态';
  await pollTask(currentTask.value.id, { manual: true });
}

async function pollTask(taskID, options = {}) {
  const generation = pollGeneration.value;
  try {
    const pollStartedAt = Date.now();
    const task = await getTaskStatus({
      apiBase: apiBase.value.trim(),
      apiKey: apiKey.value.trim(),
      taskID,
      path: currentTaskPath.value,
    });
    // 代际过期：在途回调返回时若已被新提交/切换取代，则丢弃，避免覆盖最新状态
    if (generation !== pollGeneration.value) {
      return;
    }
    const normalized = normalizeVideoTask(task);
    const terminal = isTerminalStatus(normalized.status);
    if (currentHistoryId.value) {
      updateHistoryItem(currentHistoryId.value, {
        status: normalized.status || 'unknown',
        response: task,
        lastPollDurationMs: Date.now() - pollStartedAt,
        ...(terminal ? getTerminalTimingPatch(currentHistoryId.value) : {}),
      });
    }
    setResponse(task);
    currentTask.value = normalized;

    if (terminal) {
      clearPolling();
      if (isSuccessfulTaskStatus(normalized.status)) {
        await loadVideoContent(normalized);
      }
      statusKind.value = isSuccessfulTaskStatus(normalized.status) ? 'ok' : 'error';
      statusText.value = isSuccessfulTaskStatus(normalized.status) ? '生成完成' : `任务结束：${normalized.status}`;
      return;
    }

    // 手动刷新不计入自动轮询配额，避免提前停止轮询
    if (!options.manual) {
      pollCount.value += 1;
      if (pollCount.value >= MAX_POLL_COUNT) {
        clearPolling();
        statusKind.value = 'error';
        statusText.value = `轮询已达上限（${MAX_POLL_COUNT} 次），请手动刷新`;
        return;
      }
    }

    statusKind.value = 'running';
    statusText.value = `轮询中：${normalized.status || 'unknown'} / ${taskProgressPercent.value}%`;
    schedulePoll(taskID);
  } catch (error) {
    if (generation !== pollGeneration.value) {
      return;
    }
    clearPolling();
    showError(error);
  }
}

function setResponse(response) {
  revokePrevBlobURL();
  rawResponse.value = response;
  if (response?.type === 'blob' && response.url) {
    prevBlobURL = response.url;
  }
}

function onVideoLoadedMetadata(event) {
  const video = event?.currentTarget;
  detectedVideoResolution.value = createVideoResolutionLabel({
    width: video?.videoWidth,
    height: video?.videoHeight,
    source: 'actual',
  });
}

function getVideoIs1080pText(resolution) {
  if (!resolution) return '-';
  if (resolution.source === 'request') {
    return resolution.resolution === '1080p'
      ? t('待确认（请求为 1080P）')
      : t('待实际视频确认');
  }
  return resolution.resolution === '1080p' ? t('是') : t('否');
}

function getGeminiInlineImages(response) {
  const candidates = response?.candidates;
  if (!Array.isArray(candidates)) return [];
  return candidates.flatMap((candidate) => {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) return [];
    return parts.map((part) => {
      const inlineData = part.inlineData || part.inline_data;
      if (!inlineData?.data) return '';
      return `data:${inlineData.mimeType || inlineData.mime_type || 'image/png'};base64,${inlineData.data}`;
    }).filter(Boolean);
  });
}

function getChatCompletionAudioURL(response) {
  const audio = response?.choices?.[0]?.message?.audio;
  if (!audio) return '';
  if (audio.url) return audio.url;
  if (!audio.data) return '';
  const format = audio.format || form.responseFormat || 'mp3';
  return `data:audio/${format};base64,${audio.data}`;
}

function validateAudioResponse() {
  if (activeCapabilityId.value !== 'audio' || audioURL.value) {
    return;
  }
  statusKind.value = 'error';
  statusText.value = '响应未包含可播放的音频数据';
}

function getVideoDirectURL(task) {
  const unwrapped = unwrapTaskResponse(task);
  return unwrapped?.result_url
    || unwrapped?.data?.content?.video_url
    || unwrapped?.data?.content?.url
    || unwrapped?.metadata?.url
    || unwrapped?.video?.url
    || unwrapped?.output?.url
    || unwrapped?.result?.video_url
    || unwrapped?.result?.url
    || unwrapped?.data?.url
    || unwrapped?.data?.video_url
    || unwrapped?.data?.find?.((item) => item?.url)?.url
    || unwrapped?.video_url
    || unwrapped?.url
    || '';
}

function isPlayableVideoURL(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (value.startsWith('blob:') || value.startsWith('data:video/')) return true;
  try {
    const parsed = new URL(value, window.location.href);
    return /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(parsed.pathname);
  } catch {
    return /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(value);
  }
}

async function loadVideoContent(task) {
  const taskID = task?.id;
  const generation = pollGeneration.value;
  if (!taskID || !isSuccessfulTaskStatus(task.status)) {
    return;
  }
  if (authenticatedVideoTaskID.value === taskID && authenticatedVideoURL.value) {
    return;
  }
  revokePrevVideoContentURL();
  try {
    const content = await getVideoContent({
      apiBase: apiBase.value.trim(),
      apiKey: apiKey.value.trim(),
      taskID,
      path: currentTaskPath.value,
    });
    if (generation !== pollGeneration.value || currentTask.value?.id !== taskID) {
      return;
    }
    if (content?.type === 'blob' && content.url) {
      authenticatedVideoURL.value = content.url;
      authenticatedVideoTaskID.value = taskID;
      prevVideoContentURL = content.url;
    }
  } catch {
    // /content 代理拉流失败时静默回退到直链（由 videoURL computed 兜底）
  }
}

async function downloadGeneratedVideo() {
  const taskID = currentTask.value?.id;
  if (!taskID || !isSuccessfulTaskStatus(currentTask.value?.status)) {
    statusKind.value = 'error';
    statusText.value = '暂无可下载视频';
    return;
  }

  statusKind.value = 'running';
  statusText.value = '正在准备视频下载';
  try {
    const content = await getVideoContent({
      apiBase: apiBase.value.trim(),
      apiKey: apiKey.value.trim(),
      taskID,
      path: currentTaskPath.value,
    });
    if (content?.type !== 'blob' || !content.url) {
      const message = content?.error?.message || content?.message || '视频内容接口未返回可下载文件';
      throw new Error(message);
    }
    authenticatedVideoURL.value = content.url;
    authenticatedVideoTaskID.value = taskID;
    prevVideoContentURL = content.url;
    triggerDownload(content.url, `${taskID}.mp4`);
    statusKind.value = 'ok';
    statusText.value = '视频下载已开始';
  } catch (error) {
    statusKind.value = 'error';
    statusText.value = `视频下载失败：${error.message || '未知错误'}`;
  }
}

function triggerDownload(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function getVideoTaskID(task) {
  const unwrapped = unwrapTaskResponse(task);
  return unwrapped?.task_id || unwrapped?.request_id || unwrapped?.id || '';
}

function normalizeVideoTask(task) {
  const unwrapped = unwrapTaskResponse(task);
  const taskID = getVideoTaskID(unwrapped);
  return {
    ...unwrapped,
    ...(taskID ? { id: taskID } : {}),
    status: normalizeTaskStatus(unwrapped.status),
    progress: parseTaskProgress(unwrapped.progress),
  };
}

// new-api 视频任务响应为 { code, message, data } 包装，真实任务对象在 data 内
function unwrapTaskResponse(task) {
  if (task && typeof task === 'object' && 'code' in task && task.data && typeof task.data === 'object') {
    return task.data;
  }
  return task;
}

// 规范化任务状态：new-api 使用大写 SUCCESS/FAIL/IN_PROGRESS，统一映射为小写标准值
function normalizeTaskStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'success') return 'succeeded';
  if (value === 'fail') return 'failed';
  return value;
}

// 解析进度：兼容 "50%" 字符串与数字
function parseTaskProgress(progress) {
  if (progress == null || progress === '') return 0;
  const match = String(progress).match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function isSuccessfulTaskStatus(status) {
  const value = String(status || '').toLowerCase();
  return value === 'completed' || value === 'done' || value === 'succeeded';
}

function revokePrevBlobURL() {
  if (prevBlobURL) {
    URL.revokeObjectURL(prevBlobURL);
    prevBlobURL = null;
  }
}

function revokePrevVideoContentURL() {
  if (prevVideoContentURL) {
    URL.revokeObjectURL(prevVideoContentURL);
    prevVideoContentURL = null;
  }
  authenticatedVideoURL.value = '';
  authenticatedVideoTaskID.value = '';
}

function addHistoryItem(request, contentType, startedAt = Date.now()) {
  const id = `${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10)}`;
  const environment = currentEnvironment.value;
  taskHistory.value.unshift({
    id,
    environment: {
      id: environment.id,
      label: environment.label,
      apiBase: environment.apiBase,
    },
    capability: activeCapabilityId.value,
    capabilityLabel: currentCapability.value.label,
    generationTypeLabel: getGenerationTypeLabel(activeCapabilityId.value),
    contentType,
    path: requestPath.value,
    taskPath: currentRequestConfig.value.taskPath,
    createdAt: new Date().toLocaleString(),
    startedAt,
    durationType: activeCapabilityId.value === 'video' ? 'generation' : 'request',
    status: 'pending',
    prompt: getPrimaryPrompt(activeCapabilityId.value, form),
    request,
    response: null,
  });
  if (taskHistory.value.length > MAX_HISTORY_ITEMS) {
    taskHistory.value.splice(MAX_HISTORY_ITEMS);
  }
  return id;
}

function getResponseHistoryStatus(response) {
  if (response?.status) {
    return normalizeTaskStatus(response.status);
  }
  if (activeCapabilityId.value === 'video' && getVideoTaskID(response)) {
    return 'submitted';
  }
  return 'completed';
}

function getGenerationTypeLabel(capabilityId) {
  return t(HISTORY_GENERATION_TYPE_LABELS[capabilityId] || '未知类型');
}

function updateHistoryItem(id, patch) {
  const item = taskHistory.value.find((entry) => entry.id === id);
  if (item) {
    Object.assign(item, patch);
  }
}

async function selectHistoryItem(item) {
  pollGeneration.value += 1;
  const generation = pollGeneration.value;
  selectedHistoryId.value = item.id;
  currentHistoryId.value = item.id;
  if (item.environment?.id && environments.some((environment) => environment.id === item.environment.id)) {
    selectedEnvironmentId.value = item.environment.id;
  }
  if (item.capability && item.capability !== activeCapabilityId.value) {
    switchCapability(item.capability);
    currentHistoryId.value = item.id;
  } else if (item.capability) {
    resetForm(createDefaultForm(item.capability));
  }
  restoreFormFromHistoryItem(item);
  submittedPayload.value = item.request;
  requestPath.value = item.path || requestPath.value;
  currentTaskPath.value = currentRequestConfig.value.taskPath;
  lastContentType.value = item.contentType || currentRequestConfig.value.contentType;
  syncJSONFromForm();
  revokePrevBlobURL();
  revokePrevVideoContentURL();
  rawResponse.value = item.response || {};
  if (item.capability === 'video' && getVideoTaskID(item.response)) {
    currentTask.value = normalizeVideoTask(item.response);
    statusKind.value = isSuccessfulTaskStatus(currentTask.value.status) ? 'ok' : item.status === 'failed' ? 'error' : 'idle';
    statusText.value = currentTask.value.status ? `历史记录：${currentTask.value.status}` : '历史记录';
  } else {
    currentTask.value = null;
    statusKind.value = item.status === 'failed' ? 'error' : 'idle';
    statusText.value = item.status === 'failed' ? '任务失败' : '历史记录';
  }
  activeWorkspace.value = 'generator';
  const historyTask = currentTask.value;
  if (historyTask && isSuccessfulTaskStatus(historyTask.status)) {
    await nextTick();
    if (generation !== pollGeneration.value) return;
    await loadVideoContent(historyTask);
  }
}

function getTerminalTimingPatch(id, completedAt = Date.now()) {
  const item = taskHistory.value.find((entry) => entry.id === id);
  const startedAt = Number(item?.startedAt);
  if (item?.durationType !== 'generation' || !Number.isFinite(startedAt)) {
    return {};
  }
  return {
    completedAt,
    durationMs: Math.max(0, completedAt - startedAt),
  };
}

function saveCurrentTemplate() {
  const name = templateName.value.trim()
    || (isEnglish.value ? `${currentCapabilityLabel.value} Template` : `${currentCapabilityLabel.value}模板`);
  const template = {
    id: `${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10)}`,
    name,
    capability: activeCapabilityId.value,
    capabilityLabel: currentCapability.value.label,
    contentType: currentRequestConfig.value.contentType,
    path: requestPath.value,
    form: serializeFormSnapshot(form),
    createdAt: new Date().toLocaleString(),
  };
  requestTemplates.value.unshift(template);
  selectedTemplateId.value = template.id;
  templateName.value = '';
  statusKind.value = 'ok';
  statusText.value = `已保存模板：${name}`;
}

function loadSelectedTemplate() {
  const template = selectedTemplate.value;
  if (!template) {
    statusKind.value = 'error';
    statusText.value = '暂无可加载模板';
    return;
  }
  if (template.capability !== activeCapabilityId.value) {
    switchCapability(template.capability);
  }
  resetForm(createDefaultForm(template.capability));
  Object.assign(form, cloneSerializable(template.form || {}));
  requestPath.value = template.path || getCapability(template.capability).defaultPath;
  selectedTemplateId.value = template.id;
  submittedPayload.value = null;
  rawResponse.value = {};
  currentTask.value = null;
  jsonEdited.value = false;
  syncJSONFromForm();
  statusKind.value = 'idle';
  statusText.value = `已加载模板：${template.name}`;
}

function deleteSelectedTemplate() {
  const template = selectedTemplate.value;
  if (!template) {
    return;
  }
  requestTemplates.value = requestTemplates.value.filter((item) => item.id !== template.id);
  selectedTemplateId.value = currentCapabilityTemplates.value[0]?.id || '';
  statusKind.value = 'idle';
  statusText.value = `已删除模板：${template.name}`;
}

function serializeFormSnapshot(source) {
  return Object.fromEntries(
    Object.entries(source)
      .filter(([, value]) => !isFileLike(value))
      .map(([key, value]) => [key, cloneSerializable(value)]),
  );
}

function cloneSerializable(value) {
  if (value === undefined) {
    return undefined;
  }
  const text = JSON.stringify(value, (_key, current) => {
    if (isFileLike(current)) {
      return undefined;
    }
    return current;
  });
  return text === undefined ? undefined : JSON.parse(text);
}

function isFileLike(value) {
  return value
    && typeof value === 'object'
    && typeof value.name === 'string'
    && typeof value.size === 'number'
    && typeof value.type === 'string';
}

function openHistoryDetail(item) {
  detailHistoryItem.value = item;
}

function closeHistoryDetail() {
  detailHistoryItem.value = null;
}

function restoreFormFromHistoryItem(item) {
  const payload = item.request?.body;
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    return;
  }
  if (item.capability === 'text') {
    restoreTextForm(payload);
    return;
  }
  if (item.capability === 'image') {
    restoreImageForm(payload, item);
    return;
  }
  if (item.capability === 'audio') {
    restoreAudioForm(payload);
    return;
  }
  if (item.capability === 'video') {
    restoreVideoForm(payload);
  }
}

function restoreTextForm(payload) {
  form.model = payload.model || form.model;
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  form.systemPrompt = getMessageContent(messages, 'system') || '';
  form.prompt = getMessageContent(messages, 'user') || payload.prompt || '';
  if (payload.temperature != null) form.temperature = Number(payload.temperature);
  if (payload.max_tokens != null) form.maxTokens = Number(payload.max_tokens);
}

function restoreImageForm(payload, item) {
  form.model = payload.model || getModelFromGenerateContentPath(item.path || item.request?.url) || form.model;
  form.prompt = payload.prompt || getGeminiPrompt(payload) || '';
  if (payload.size) form.size = payload.size;
  if (payload.quality) form.quality = payload.quality;
  if (payload.n != null) form.n = Number(payload.n);
}

// 从历史 chat/completions 的 content 中剥离风格指令前缀，还原「模式」与纯朗读文本
function stripAudioModePrefix(content) {
  const value = String(content || '');
  for (const [mode, prefix] of Object.entries(AUDIO_MODE_PREFIXES)) {
    const sep = `${prefix}\n\n`;
    if (value.startsWith(sep)) {
      return { mode, text: value.slice(sep.length) };
    }
  }
  return { mode: form.mode, text: value };
}

function restoreAudioForm(payload) {
  form.model = payload.model || form.model;
  if (Array.isArray(payload.messages)) {
    const rawContent = getMessageContent(payload.messages, 'user') || '';
    const stripped = stripAudioModePrefix(rawContent);
    form.mode = stripped.mode;
    form.input = stripped.text || form.input;
  } else if (payload.input) {
    form.input = payload.input;
  }
  form.voice = payload.voice || payload.audio?.voice || form.voice;
  form.responseFormat = payload.response_format || payload.audio?.format || form.responseFormat;
}

function restoreVideoForm(payload) {
  form.model = payload.model || form.model;
  form.prompt = payload.prompt || getSeedancePrompt(payload.content) || '';
  const imageURLs = getVideoImageURLs(payload);
  form.imageURL = imageURLs.join('\n');
  form.imageBase64List = [];
  form.inputReferenceFiles = [];
  form.size = getVideoFormSize(payload) || form.size;
  form.duration = Number(payload.duration || payload.seconds || form.duration);
  if (payload.fps != null) form.fps = Number(payload.fps);
  if (payload.n != null) form.n = Number(payload.n);
  form.metadataText = stringifyMetadata(getVideoMetadataFields(payload));
}

function getMessageContent(messages, role) {
  const message = messages.find((item) => item?.role === role);
  return typeof message?.content === 'string' ? message.content : '';
}

function getGeminiPrompt(payload) {
  const parts = payload.contents?.[0]?.parts;
  if (!Array.isArray(parts)) return '';
  const textPart = parts.find((part) => typeof part?.text === 'string');
  return textPart?.text || '';
}

function getModelFromGenerateContentPath(path) {
  const match = /\/v1beta\/models\/([^/:]+):generateContent/.exec(String(path || ''));
  return match ? decodeURIComponent(match[1]) : '';
}

function getSeedancePrompt(content) {
  if (!Array.isArray(content)) return '';
  const textPart = content.find((item) => item?.type === 'text' && typeof item.text === 'string');
  return textPart?.text || '';
}

function getVideoImageURLs(payload) {
  if (Array.isArray(payload.image_urls)) {
    return payload.image_urls
      .map((item) => item?.url || '')
      .map((value) => String(value || '').trim())
      .filter(Boolean);
  }
  if (Array.isArray(payload.images)) {
    return payload.images
      .map((value) => String(value || '').trim())
      .filter(Boolean);
  }
  if (!Array.isArray(payload.content)) {
    return [];
  }
  return payload.content
    .map((item) => item?.image_url?.url || item?.imageUrl?.url || item?.url || '')
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function getVideoFormSize(payload) {
  if (/^\d+x\d+$/i.test(String(payload.size || ''))) {
    return payload.size;
  }
  const ratio = payload.size || payload.aspect_ratio;
  const resolution = payload.resolution;
  if (ratio && resolution) {
    return sizeFromAspectRatioResolution(ratio, resolution);
  }
  if (payload.width && payload.height) {
    return `${payload.width}x${payload.height}`;
  }
  return '';
}

function sizeFromAspectRatioResolution(ratio, resolution) {
  const ratioMatch = /^(\d+):(\d+)$/.exec(String(ratio || '').trim());
  const resolutionMatch = /^(\d+)p$/.exec(String(resolution || '').trim());
  if (!ratioMatch || !resolutionMatch) {
    return '';
  }
  const ratioWidth = Number(ratioMatch[1]);
  const ratioHeight = Number(ratioMatch[2]);
  const shortEdge = Number(resolutionMatch[1]);
  if (!ratioWidth || !ratioHeight || !shortEdge) {
    return '';
  }
  const isLandscape = ratioWidth >= ratioHeight;
  const width = isLandscape
    ? Math.round((shortEdge * ratioWidth) / ratioHeight)
    : shortEdge;
  const height = isLandscape
    ? shortEdge
    : Math.round((shortEdge * ratioHeight) / ratioWidth);
  return `${width}x${height}`;
}

function getVideoMetadataFields(payload) {
  const knownKeys = new Set([
    'model',
    'prompt',
    'image',
    'image_urls',
    'content',
    'images',
    'input_reference',
    'duration',
    'size',
    'resolution',
    'seconds',
    'width',
    'height',
    'fps',
    'n',
    'mode',
    'aspect_ratio',
  ]);
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => !knownKeys.has(key)),
  );
}

function stringifyMetadata(metadata) {
  if (!metadata || !Object.keys(metadata).length) {
    return '';
  }
  return JSON.stringify(metadata);
}

function clearHistory() {
  pollGeneration.value += 1;
  taskHistory.value = [];
  selectedHistoryId.value = null;
  currentHistoryId.value = '';
  submittedPayload.value = null;
  rawResponse.value = {};
  currentTask.value = null;
  revokePrevVideoContentURL();
  errorDiagnosis.value = null;
  statusKind.value = 'idle';
  statusText.value = '待提交';
}

async function copyJSON(value, target) {
  const text = JSON.stringify(value ?? {}, null, 2);
  try {
    await writeClipboardText(text);
    copyStatus[target] = '已复制';
    window.setTimeout(() => {
      if (copyStatus[target] === '已复制') {
        copyStatus[target] = '';
      }
    }, 1500);
  } catch {
    copyStatus[target] = '复制失败';
  }
}

async function copyHistoryReport(item) {
  try {
    await writeClipboardText(buildHistoryReport(item));
    copyStatus.report = '报告已复制';
    window.setTimeout(() => {
      if (copyStatus.report === '报告已复制') {
        copyStatus.report = '';
      }
    }, 1500);
  } catch {
    copyStatus.report = '复制失败';
  }
}

function buildHistoryReport(item) {
  return [
    t('# New API 模型测试报告'),
    '',
    `- ${t('能力')}${labelSeparator.value} ${getCapabilityLabel(item.capability)}`,
    `- ${t('生成类型')}${labelSeparator.value} ${getGenerationTypeLabel(item.capability)}`,
    `- ${t('状态')}${labelSeparator.value} ${statusLabel(item.status)}`,
    `- ${t('环境')}${labelSeparator.value} ${getEnvironmentLabel(item.environment)}`,
    `- ${t('接口')}${labelSeparator.value} ${item.path || item.request?.url || '-'}`,
    `- Content-Type${labelSeparator.value} ${item.contentType || '-'}`,
    `- ${getHistoryDurationLabel(item)}${labelSeparator.value} ${formatHistoryDuration(item)}`,
    `- ${t('创建时间')}${labelSeparator.value} ${item.createdAt || '-'}`,
    '',
    '## Prompt',
    '',
    item.prompt || '-',
    '',
    t('## 请求'),
    '',
    '```json',
    JSON.stringify(item.request ?? {}, null, 2),
    '```',
    '',
    t('## 响应'),
    '',
    '```json',
    JSON.stringify(item.response ?? {}, null, 2),
    '```',
  ].join('\n');
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand?.('copy');
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error('copy failed');
  }
}

function schedulePoll(taskID) {
  if (!taskID) return;
  clearPolling();
  pollTimer.value = window.setTimeout(() => pollTask(taskID), POLL_INTERVAL_MS);
}

function clearPolling() {
  if (pollTimer.value) {
    window.clearTimeout(pollTimer.value);
    pollTimer.value = 0;
  }
}

function stopPolling() {
  pollGeneration.value += 1;
  clearPolling();
  statusKind.value = 'idle';
  statusText.value = '已停止轮询';
}

function toggleColorTheme() {
  colorTheme.value = isDarkTheme.value ? 'light' : 'dark';
}

function toggleLanguage() {
  uiLanguage.value = isEnglish.value ? 'zh' : 'en';
}

function openConnectionSettings() {
  settingsApiBase.value = apiBase.value;
  settingsApiKey.value = apiKey.value;
  showSettingsApiKey.value = false;
  isConnectionSettingsOpen.value = true;
}

function closeConnectionSettings() {
  settingsApiKey.value = '';
  showSettingsApiKey.value = false;
  isConnectionSettingsOpen.value = false;
}

function saveConnectionSettings() {
  const nextApiBase = settingsApiBase.value.trim().replace(/\/+$/, '');
  const nextApiKey = settingsApiKey.value.trim();
  if (!nextApiBase || !nextApiKey) {
    statusKind.value = 'error';
    statusText.value = '请填写 API Base URL 和 API Key';
    return;
  }
  apiBase.value = nextApiBase;
  apiKey.value = nextApiKey;
  closeConnectionSettings();
  statusKind.value = 'ok';
  statusText.value = '连接设置已更新';
}

function ensureConnectionConfigured() {
  if (isConnectionConfigured.value) {
    return true;
  }
  statusKind.value = 'error';
  statusText.value = apiKey.value.trim() ? '请先设置 API Base URL' : '请先设置 API Key';
  openConnectionSettings();
  return false;
}

function t(source, params) {
  return translate(uiLanguage.value, source, params);
}

function getCapabilityLabel(capabilityId) {
  return t(getCapability(capabilityId).label);
}

function getEnvironmentLabel(environment) {
  if (!environment) return '-';
  if (environment.id === 'test') return t('测试环境');
  if (environment.id === 'production') return t('线上环境');
  if (environment.id === 'overseas') return t('海外环境');
  return environment.label;
}

function formatVoiceOption(voice) {
  if (!isEnglish.value) {
    return `${voice.voice} · ${voice.name}（${voice.gender}）`;
  }
  return `${voice.voice} · ${t(voice.gender)}`;
}

function loadColorTheme() {
  try {
    return window.localStorage.getItem(themeStorageKey) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function loadLanguage() {
  try {
    return normalizeLanguage(window.localStorage.getItem(languageStorageKey));
  } catch {
    return normalizeLanguage();
  }
}

function loadTaskHistory() {
  try {
    const raw = window.localStorage.getItem(historyStorageKey);
    const history = raw ? JSON.parse(raw) : [];
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function loadRequestTemplates() {
  try {
    const raw = window.localStorage.getItem(templateStorageKey);
    const templates = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(templates)) {
      return [];
    }
    return templates.filter((item) => {
      return item
        && typeof item === 'object'
        && typeof item.id === 'string'
        && typeof item.name === 'string'
        && typeof item.capability === 'string'
        && item.form
        && typeof item.form === 'object';
    });
  } catch {
    return [];
  }
}

function statusLabel(status) {
  const map = { pending: '等待中', submitted: '已提交', processing: '处理中', completed: '已完成', failed: '失败', cancelled: '已取消' };
  return t(map[status] || status || '未知');
}

function statusBadgeClass(status) {
  if (status === 'completed' || status === 'done' || status === 'succeeded') return 'badge-ok';
  if (status === 'failed' || status === 'cancelled') return 'badge-error';
  return 'badge-running';
}

function formatDuration(value) {
  if (!Number.isFinite(Number(value))) {
    return '-';
  }
  const duration = Math.max(0, Math.round(Number(value)));
  if (duration < 1000) {
    return `${duration} ms`;
  }
  if (duration >= 60000) {
    const minutes = (duration / 60000).toFixed(2);
    return isEnglish.value ? `${minutes} min` : `${minutes} 分钟`;
  }
  return `${(duration / 1000).toFixed(duration < 10000 ? 2 : 1)} s`;
}

function formatHistoryDuration(item) {
  if (!item) return '-';
  const value = Number(item.durationMs);
  if (!Number.isFinite(value)) return '-';
  if (item.durationType === 'generation') {
    const minutes = (Math.max(0, value) / 60000).toFixed(2);
    return isEnglish.value ? `${minutes} min` : `${minutes} 分钟`;
  }
  return formatDuration(value);
}

function getHistoryDurationLabel(item) {
  if (item?.durationType === 'generation') return t('生成耗时');
  if (item?.capability === 'video') return t('请求耗时（旧记录）');
  return t('请求耗时');
}

function maskAPIKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '***';
  return `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`;
}

function showError(error, { updateHistory = true } = {}) {
  statusKind.value = 'error';
  statusText.value = error.message || '请求失败';
  const response = error.response || { error: error.message };
  rawResponse.value = response;
  errorDiagnosis.value = diagnoseError(error, response);
  if (updateHistory && currentHistoryId.value) {
    updateHistoryItem(currentHistoryId.value, {
      status: 'failed',
      response,
      ...getTerminalTimingPatch(currentHistoryId.value),
    });
  }
}

function diagnoseError(error, response) {
  const message = [
    error?.message,
    response?.error,
    response?.message,
    response?.code,
  ].map((item) => String(item || '').toLowerCase()).join(' ');
  if (/401|403|unauthorized|forbidden|api key|apikey|invalid key|token/.test(message)) {
    return {
      title: '认证失败',
      suggestions: [
        '检查 API Key 是否为空、过期或属于当前环境。',
        '确认所选环境地址和 Key 来自同一套 New API 服务。',
      ],
    };
  }
  if (/404|not found|path|endpoint/.test(message)) {
    return {
      title: '接口路径异常',
      suggestions: [
        '检查请求路径是否匹配当前模型能力。',
        '对 Gemini 图片模型确认是否使用原生 generateContent 路径。',
      ],
    };
  }
  if (/json|parse|syntax|payload|body/.test(message)) {
    return {
      title: '请求体格式异常',
      suggestions: [
        '检查 JSON 请求体是否为对象且语法有效。',
        '优先点击“同步表单到 JSON”重新生成请求体。',
      ],
    };
  }
  if (/timeout|network|failed to fetch|econn|cors/.test(message)) {
    return {
      title: '网络或代理异常',
      suggestions: [
        '确认 Vite 代理或 API 服务可访问。',
        '检查浏览器控制台和服务端日志中的网络错误。',
      ],
    };
  }
  return {
    title: '请求失败',
    suggestions: [
      '查看响应结果中的 error、code、message 字段。',
      '复制请求和响应 JSON，结合 New API 日志定位。',
    ],
  };
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="topbar-brand">
        <span class="brand-signal" aria-hidden="true">
          <svg viewBox="0 0 36 36">
            <path d="M18 10.2 25.8 18 18 25.8 10.2 18Z" />
            <path d="M18 5.5v4.7M30.5 18h-4.7M18 30.5v-4.7M5.5 18h4.7" />
            <circle cx="18" cy="5.5" r="1.5" />
            <circle cx="30.5" cy="18" r="1.5" />
            <circle cx="18" cy="30.5" r="1.5" />
            <circle cx="5.5" cy="18" r="1.5" />
          </svg>
        </span>
        <div>
          <p class="topbar-subtitle">NEW API · {{ t('多模态模型调试工作台') }}</p>
          <h1>{{ t('模型实验室') }}</h1>
        </div>
      </div>
      <div class="topbar-actions">
        <div class="topbar-control-group" role="group" :aria-label="t('外观与语言')">
          <button
            type="button"
            class="connection-settings-button secondary"
            data-test="connection-settings-button"
            :aria-label="t('连接设置')"
            @click="openConnectionSettings"
          >
            <span class="topbar-action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M7 8.5h10M7 15.5h10" />
                <circle cx="10" cy="8.5" r="2" />
                <circle cx="14" cy="15.5" r="2" />
              </svg>
            </span>
            <span>{{ t('连接设置') }}</span>
          </button>
          <button
            type="button"
            class="language-toggle secondary"
            data-test="language-toggle"
            :aria-label="isEnglish ? t('切换到中文') : t('切换到英文')"
            :aria-pressed="isEnglish"
            @click="toggleLanguage"
          >
            <span class="topbar-action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5S14.3 18.1 12 20.5M12 3.5C9.7 5.9 8.5 8.7 8.5 12s1.2 6.1 3.5 8.5" />
              </svg>
            </span>
            <span>{{ isEnglish ? '中文' : 'English' }}</span>
          </button>
          <button
            type="button"
            class="theme-toggle secondary"
            data-test="theme-toggle"
            :aria-label="isDarkTheme ? t('切换到浅色外观') : t('切换到深色外观')"
            :aria-pressed="isDarkTheme"
            @click="toggleColorTheme"
          >
            <span class="theme-toggle-icon" aria-hidden="true" />
            <span>{{ isDarkTheme ? t('浅色外观') : t('深色外观') }}</span>
          </button>
        </div>
        <div class="topbar-doc-group" role="group" :aria-label="t('帮助与文档')">
          <a
            data-test="new-api-docs-link"
            class="button-link secondary-link docs-link docs-link-primary"
            href="https://www.newapi.ai/zh/docs/api"
            target="_blank"
            rel="noreferrer"
          >
            <span class="topbar-action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M5 4.5h10.5A2.5 2.5 0 0 1 18 7v12.5H7.5A2.5 2.5 0 0 1 5 17z" />
                <path d="M5 17a2.5 2.5 0 0 1 2.5-2.5H18M9 8h5" />
              </svg>
            </span>
            <span>{{ t('New API 官方文档') }}</span>
          </a>
          <a class="button-link secondary-link docs-link docs-link-context" :href="docsURL" target="_blank" rel="noreferrer">
            <span class="topbar-action-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M9 6h9v9M18 6l-8 8" />
                <path d="M15 12v6H6V9h6" />
              </svg>
            </span>
            <span>{{ t('当前接口文档') }}</span>
          </a>
        </div>
        <div class="status" :class="statusKind">
          <span class="status-dot" aria-hidden="true" />
          {{ displayStatusText }}
        </div>
      </div>
    </header>

    <div class="app-shell">
      <nav class="capability-rail" :aria-label="t('模型能力与工作区')">
        <div class="rail-section-label">CAPABILITY</div>
        <button
          v-for="item in localizedCapabilities"
          :key="item.id"
          data-test="capability-tab"
          :data-capability="item.id"
          type="button"
          class="tab-button"
          :class="{ active: item.id === activeCapabilityId && activeWorkspace === 'generator' }"
          @click="openCapability(item.id)"
        >
          <span class="rail-icon" aria-hidden="true">
            <svg v-if="item.id === 'text'" viewBox="0 0 24 24">
              <path d="M7 3.5h7.2L18 7.3v13.2H7z" />
              <path d="M14 3.5v4h4M9.5 11h6M9.5 14.5h6M9.5 18h4" />
            </svg>
            <svg v-else-if="item.id === 'image'" viewBox="0 0 24 24">
              <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
              <circle cx="9" cy="9" r="1.5" />
              <path d="m5.5 17 4.2-4.3 3.2 3.1 2.2-2.2 3.4 3.4" />
            </svg>
            <svg v-else-if="item.id === 'image-to-image'" viewBox="0 0 24 24">
              <rect x="6" y="4" width="14" height="14" rx="3" />
              <path d="M4 8v10a2 2 0 0 0 2 2h10M8.5 15l3-3 4 4 2-2" />
              <circle cx="15.5" cy="8.5" r="1.25" />
            </svg>
            <svg v-else-if="item.id === 'audio'" viewBox="0 0 24 24">
              <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" />
            </svg>
            <svg v-else viewBox="0 0 24 24">
              <rect x="3.5" y="5" width="17" height="14" rx="3" />
              <path d="m10 9 5 3-5 3z" />
            </svg>
          </span>
          <span class="rail-label">{{ item.label }}</span>
        </button>
        <div class="rail-divider" />
        <div class="rail-section-label">WORKSPACE</div>
        <button
          type="button"
          class="workspace-nav-button"
          :class="{ active: activeWorkspace === 'history' }"
          data-test="history-workspace-button"
          @click="openWorkspace('history')"
        >
          <span class="rail-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5v5l3.2 2" />
            </svg>
          </span>
          <span class="rail-label">{{ t('历史记录') }}</span>
        </button>
        <button
          type="button"
          class="workspace-nav-button"
          :class="{ active: activeWorkspace === 'matrix' }"
          data-test="matrix-workspace-button"
          @click="openWorkspace('matrix')"
        >
          <span class="rail-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="3" />
              <path d="M12 4v16M4 12h16" />
            </svg>
          </span>
          <span class="rail-label">{{ t('能力矩阵') }}</span>
        </button>
      </nav>

      <main class="workspace-shell">
        <section :hidden="activeWorkspace !== 'generator'" data-test="generator-workspace">
          <div class="runtime-overview" :aria-label="t('运行概览')">
            <div class="runtime-card">
              <span>{{ t('当前环境') }}</span>
              <strong>{{ currentEnvironmentLabel }}</strong>
            </div>
            <div class="runtime-card">
              <span>{{ t('当前能力') }}</span>
              <strong>{{ currentCapabilityLabel }}</strong>
            </div>
            <div class="runtime-card">
              <span>{{ t('任务状态') }}</span>
              <strong>{{ displayStatusText }}</strong>
            </div>
            <div class="runtime-card">
              <span>{{ currentDurationLabel }}</span>
              <strong data-test="current-duration">{{ currentDurationText }}</strong>
            </div>
          </div>

          <div class="command-grid">
      <section class="panel form-panel config-console">
        <div class="panel-title">
          <div>
            <p class="section-code">01 / CONFIG</p>
            <h2>{{ currentCapabilityLabel }} · {{ t('生成配置') }}</h2>
            <span>{{ currentRequestConfig.contentType }} / {{ requestPath }}</span>
          </div>
          <span class="mode-pill">{{ currentCapabilitySubmitLabel }}</span>
        </div>

        <form @submit.prevent="submitFormTask">
          <div v-if="!isConnectionConfigured" class="connection-reminder" data-test="connection-reminder">
            <div>
              <strong>{{ t('尚未配置连接') }}</strong>
              <span>{{ t('提交前请先设置 API Base URL 和 API Key。') }}</span>
            </div>
            <button type="button" class="secondary small" @click="openConnectionSettings">{{ t('立即设置') }}</button>
          </div>
          <div class="field-group">
            <label>
              {{ t('环境') }}
              <select v-model="selectedEnvironmentId" data-test="environment-select" disabled>
                <option v-for="environment in environments" :key="environment.id" :value="environment.id">
                  {{ getEnvironmentLabel(environment) }}
                </option>
              </select>
              <span class="endpoint-hint">{{ t('连接地址') }}{{ labelSeparator }} {{ apiBase || t('未设置') }}</span>
            </label>
            <label>
              {{ t('请求路径') }}
              <input v-model="requestPath" type="text" />
              <span class="endpoint-hint">{{ t('接口地址') }}{{ labelSeparator }} {{ endpointURL }}</span>
            </label>
          </div>

          <section class="template-panel">
            <div class="template-head">
              <div>
                <h2>{{ t('请求模板') }}</h2>
                <span class="endpoint-hint">{{ t('保存当前能力的常用参数组合') }}</span>
              </div>
              <span class="template-count">{{ currentCapabilityTemplates.length }} {{ t('个') }}</span>
            </div>
            <div class="template-grid">
              <label>
                {{ t('模板名称') }}
                <input v-model="templateName" type="text" :placeholder="t('例如：视频基准测试')" data-test="template-name-input" />
              </label>
              <label>
                {{ t('已保存模板') }}
                <select v-model="selectedTemplateId" data-test="template-select">
                  <option value="">{{ t('选择模板') }}</option>
                  <option v-for="item in currentCapabilityTemplates" :key="item.id" :value="item.id">
                    {{ item.name }}
                  </option>
                </select>
              </label>
            </div>
            <div class="template-actions">
              <button type="button" class="secondary small" data-test="save-template-button" @click="saveCurrentTemplate">{{ t('保存模板') }}</button>
              <button type="button" class="secondary small" data-test="load-template-button" @click="loadSelectedTemplate">{{ t('加载模板') }}</button>
              <button type="button" class="secondary small" :disabled="!selectedTemplate" @click="deleteSelectedTemplate">{{ t('删除模板') }}</button>
            </div>
          </section>

          <label>
            {{ t('模型') }}
            <select v-model="form.model">
              <option
                v-for="model in currentCapability.models"
                :key="model"
                data-test="model-option"
                :value="model"
              >
                {{ model }}
              </option>
            </select>
          </label>

          <template v-if="activeCapabilityId === 'text'">
            <label>
              System
              <textarea v-model="form.systemPrompt" rows="3" />
            </label>
            <label>
              {{ t('用户输入') }}
              <textarea v-model="form.prompt" rows="5" required />
            </label>
            <div class="grid">
              <label>
                Temperature
                <input v-model.number="form.temperature" type="number" min="0" max="2" step="0.1" />
              </label>
              <label>
                Max Tokens
                <input v-model.number="form.maxTokens" type="number" min="1" step="1" />
              </label>
            </div>
          </template>

          <template v-else-if="isImageCapability(activeCapabilityId)">
            <label>
              {{ t('提示词') }}
              <textarea v-model="form.prompt" rows="5" required />
            </label>
            <div v-if="activeCapabilityId === 'image-to-image'" class="field-group">
              <label>
                {{ t('参考图 URL（可选，每行一个）') }}
                <textarea v-model="form.imageURL" rows="3" placeholder="https://example.com/image.png" />
              </label>
              <label>
                {{ t('上传 image 图片（可选）') }}
                <input type="file" accept="image/*" @change="onImageFileChange" />
                <span v-if="selectedImageFileName" class="endpoint-hint">{{ selectedImageFileName }}</span>
              </label>
            </div>
            <div class="grid">
              <label v-if="imageAspectRatioOptions.length">
                {{ t('长宽比') }}
                <select v-model="form.aspectRatio" data-test="image-aspect-ratio-select">
                  <option
                    v-for="option in imageAspectRatioOptions"
                    :key="option.aspectRatio"
                    :value="option.aspectRatio"
                    data-test="image-aspect-ratio-option"
                  >
                    {{ option.aspectRatio }}
                  </option>
                </select>
              </label>
              <label>
                {{ t('分辨率') }}
                <select v-model="form.size" data-test="image-size-select">
                  <option v-for="size in imageSizeOptions" :key="size" :value="size" data-test="image-size-option">{{ size }}</option>
                </select>
              </label>
              <label>
                {{ t('质量') }}
                <select v-model="form.quality">
                  <option value="standard">standard</option>
                  <option value="hd">hd</option>
                </select>
              </label>
              <label>
                {{ t('数量') }}
                <input v-model.number="form.n" type="number" min="1" step="1" />
              </label>
            </div>
          </template>

          <template v-else-if="activeCapabilityId === 'audio'">
            <label>
              {{ t('模式') }}
              <select v-model="form.mode">
                <option value="narration">{{ t('旁白模式') }}</option>
                <option value="dialogue">{{ t('对话模式') }}</option>
              </select>
            </label>
            <label>
              {{ t('文本') }}
              <textarea v-model="form.input" rows="5" required />
            </label>
            <label>
              {{ t('音色') }}
              <select v-model="form.voice">
                <option v-for="v in voiceOptions" :key="v.voice" :value="v.voice">
                  {{ formatVoiceOption(v) }}
                </option>
              </select>
            </label>
            <p v-if="audioVoiceDescription" class="field-hint">{{ audioVoiceDescription }}</p>
            <div class="grid">
              <label>
                {{ t('格式') }}
                <select v-model="form.responseFormat">
                  <option value="mp3">mp3</option>
                  <option value="wav">wav</option>
                  <option value="opus">opus</option>
                </select>
              </label>
            </div>
          </template>

          <template v-else>
            <label>
              {{ t('提示词') }}
              <textarea v-model="form.prompt" rows="5" required />
            </label>
            <div class="field-group">
              <label>
                {{ t('图片 URL（可选，每行一个）') }}
                <textarea v-model="form.imageURL" rows="3" placeholder="https://example.com/image.png" />
              </label>
              <label>
                image_urls role
                <input v-model="form.imageRole" type="text" placeholder="reference_image" data-test="video-image-role-input" />
              </label>
            </div>
            <div class="grid">
              <label>
                {{ t('尺寸') }}
                <select v-model="form.size" data-test="video-size-select">
                  <option value="960x540" data-test="video-size-option">960x540</option>
                  <option value="1280x720" data-test="video-size-option">1280x720</option>
                  <option value="720x1280" data-test="video-size-option">720x1280</option>
                  <option value="1920x1080" data-test="video-size-option">1920x1080</option>
                  <option value="1080x1920" data-test="video-size-option">1080x1920</option>
                  <option value="1024x1024" data-test="video-size-option">1024x1024</option>
                </select>
              </label>
              <label>
                {{ t('时长') }}
                <input v-model.number="form.duration" type="number" :min="durationMin" step="1" />
              </label>
              <label>
                FPS
                <input v-model.number="form.fps" type="number" min="1" step="1" />
              </label>
              <label>
                {{ t('数量') }}
                <input v-model.number="form.n" type="number" min="1" step="1" />
              </label>
            </div>
            <details class="metadata-collapse">
              <summary>{{ t('Metadata JSON（可选）') }}</summary>
              <textarea v-model="form.metadataText" rows="4" :placeholder="t('例如：seed 为 123456')" />
            </details>
          </template>

          <details class="metadata-collapse" :open="!jsonEdited">
            <summary>{{ t('JSON 请求体') }}{{ jsonEdited ? t('（已手动修改）') : '' }}</summary>
            <textarea v-model="jsonPayloadText" rows="8" spellcheck="false" @input="onJSONInput" />
          </details>

          <div class="actions">
            <button type="submit" :disabled="isSubmitting">{{ currentCapabilitySubmitLabel }}</button>
            <button type="button" :disabled="isSubmitting" @click="submitJSONTask">{{ t('JSON 提交') }}</button>
            <button type="button" class="secondary" @click="syncJSONFromForm">{{ t('同步表单到 JSON') }}</button>
            <button type="button" class="secondary" data-test="refresh-task-button" @click="refreshTask">{{ t('刷新状态') }}</button>
            <button type="button" class="secondary" @click="stopPolling">{{ t('停止轮询') }}</button>
          </div>
        </form>
      </section>

      <section class="panel result-panel output-monitor">
        <div class="result-head">
          <div>
            <p class="section-code">02 / OUTPUT</p>
            <h2>{{ t('输出监视器') }}</h2>
            <span class="endpoint-hint">{{ endpointURL }}</span>
          </div>
          <a
            v-if="imageURLs.length"
            data-test="download-image-link"
            class="button-link"
            :href="imageURLs[0]"
            download="generated-image.png"
            target="_blank"
            rel="noreferrer"
          >
            {{ t('下载图片') }}
          </a>
          <div v-if="hasDownloadableVideo || videoURL" class="result-actions" data-test="video-result-actions">
            <button
              v-if="hasDownloadableVideo"
              type="button"
              class="button-link download-link"
              data-test="download-video-button"
              @click="downloadGeneratedVideo"
            >
              {{ t('下载视频') }}
            </button>
            <a v-if="videoURL" data-test="open-video-link" class="button-link open-link" :href="videoURL" target="_blank" rel="noreferrer">{{ t('打开视频') }}</a>
          </div>
        </div>

        <div class="preview-surface">
          <div v-if="textResult" class="rendered-result text-output">{{ textResult }}</div>
          <div v-else-if="imageURLs.length" class="image-grid" :class="{ 'single-image': imageURLs.length === 1 }">
            <img v-for="url in imageURLs" :key="url" :src="url" :alt="t('生成图片预览')" />
          </div>
          <div v-else-if="hasDownloadableVideo" class="video-preview-wrap">
            <video
              v-if="videoURL"
              class="preview"
              data-test="video-preview"
              :src="videoURL"
              controls
              @loadedmetadata="onVideoLoadedMetadata"
            />
            <div v-else class="empty-preview" data-test="video-content-unavailable">
              <strong>{{ t('视频任务已完成') }}</strong>
              <span>{{ t('暂未加载到可播放内容，仍可查看历史请求参数或尝试下载。') }}</span>
            </div>
            <section v-if="videoResolution" class="video-parameters" data-test="video-parameters">
              <h3>{{ t('生成视频参数') }}</h3>
              <dl>
                <div>
                  <dt>{{ t('视频尺寸') }}</dt>
                  <dd data-test="video-dimensions">{{ videoResolution.width }}×{{ videoResolution.height }}</dd>
                </div>
                <div>
                  <dt>{{ t('分辨率') }}</dt>
                  <dd data-test="video-resolution-level">{{ videoResolutionLevel }}</dd>
                </div>
                <div>
                  <dt>{{ t('是否 1080P') }}</dt>
                  <dd data-test="video-is-1080p">{{ videoIs1080p }}</dd>
                </div>
                <div>
                  <dt>{{ t('数据来源') }}</dt>
                  <dd data-test="video-resolution-source">{{ videoResolutionSource }}</dd>
                </div>
              </dl>
            </section>
          </div>
          <audio v-else-if="audioURL" class="audio-player" :src="audioURL" controls />
          <div v-else class="empty-preview">
            <strong>{{ currentCapabilityLabel }}</strong>
            <span>{{ t('提交请求后在这里查看渲染结果和原始响应。') }}</span>
          </div>
        </div>

        <div v-if="errorDiagnosis" class="diagnosis-panel" data-test="error-diagnosis">
          <div>
            <h2>{{ t(errorDiagnosis.title) }}</h2>
            <ul>
              <li v-for="item in errorDiagnosis.suggestions" :key="item">{{ t(item) }}</li>
            </ul>
          </div>
        </div>

        <div v-if="showTaskProgress" class="task-progress" data-test="video-progress">
          <div class="task-progress-head">
            <span>{{ t('任务进度') }}</span>
            <strong>{{ taskProgressLabel }}</strong>
          </div>
          <div class="task-progress-track" role="progressbar" :aria-valuenow="taskProgressPercent" aria-valuemin="0" aria-valuemax="100">
            <div class="task-progress-bar" data-test="video-progress-bar" :style="{ width: `${taskProgressPercent}%` }" />
          </div>
        </div>

        <div class="summary">
          <div>
            <span>{{ t('能力') }}</span>
            <strong>{{ currentCapabilityLabel }}</strong>
          </div>
          <div>
            <span>Content-Type</span>
            <strong>{{ lastContentType }}</strong>
          </div>
          <div>
            <span>{{ t('任务 ID') }}</span>
            <strong>{{ currentTask?.id || rawResponse?.id || '-' }}</strong>
          </div>
          <div>
            <span>{{ t('状态') }}</span>
            <strong>{{ currentTask?.status || rawResponse?.status || '-' }}</strong>
          </div>
          <div>
            <span>{{ currentDurationLabel }}</span>
            <strong data-test="result-duration">{{ currentDurationText }}</strong>
          </div>
        </div>

        <div class="debug-grid">
          <div>
            <div class="debug-panel-head">
              <h2>{{ t('请求参数') }}</h2>
              <button type="button" class="secondary small" data-test="copy-request-json" @click="copyJSON(submittedPayload, 'request')">
                {{ copyStatus.request ? translateDynamic(uiLanguage, copyStatus.request) : t('复制完整 JSON') }}
              </button>
            </div>
            <pre data-test="request-debug-json">{{ JSON.stringify(submittedPayload, null, 2) }}</pre>
          </div>
          <div>
            <div class="debug-panel-head">
              <h2>{{ t('响应结果') }}</h2>
              <button type="button" class="secondary small" data-test="copy-response-json" @click="copyJSON(rawResponse, 'response')">
                {{ copyStatus.response ? translateDynamic(uiLanguage, copyStatus.response) : t('复制完整 JSON') }}
              </button>
            </div>
            <pre data-test="response-debug-json">{{ JSON.stringify(rawResponse, null, 2) }}</pre>
          </div>
        </div>
      </section>
          </div>
        </section>

        <section :hidden="activeWorkspace !== 'history'" class="history-section" data-test="history-workspace">
      <div class="history-header">
        <div>
          <h2>{{ t('提交记录') }}（{{ filteredTaskHistory.length }} / {{ taskHistory.length }}）</h2>
          <span class="endpoint-hint">{{ t('筛选只影响当前视图，不会删除历史数据') }}</span>
        </div>
        <button class="secondary small" @click="clearHistory">{{ t('清空记录') }}</button>
      </div>
      <div class="history-stats" data-test="history-stats">
        <div>
          <span>{{ t('总数') }}</span>
          <strong>{{ historyStats.total }}</strong>
        </div>
        <div>
          <span>{{ t('成功') }}</span>
          <strong>{{ historyStats.success }}</strong>
        </div>
        <div>
          <span>{{ t('失败') }}</span>
          <strong>{{ historyStats.failed }}</strong>
        </div>
        <div>
          <span>{{ t('进行中') }}</span>
          <strong>{{ historyStats.running }}</strong>
        </div>
        <div>
          <span>{{ t('成功率') }}</span>
          <strong>{{ historyStats.successRate }}%</strong>
        </div>
        <div>
          <span>{{ t('平均耗时') }}</span>
          <strong>{{ formatDuration(historyStats.averageDurationMs) }}</strong>
        </div>
      </div>
      <div class="history-filters">
        <label>
          {{ t('能力') }}
          <select v-model="historyCapabilityFilter" data-test="history-capability-filter">
            <option value="all">{{ t('全部能力') }}</option>
            <option v-for="item in localizedCapabilities" :key="item.id" :value="item.id">
              {{ item.label }}
            </option>
          </select>
        </label>
        <label>
          {{ t('状态') }}
          <select v-model="historyStatusFilter" data-test="history-status-filter">
            <option v-for="item in localizedHistoryStatusFilters" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </label>
        <label>
          {{ t('搜索') }}
          <input v-model="historySearchText" type="search" :placeholder="t('Prompt / 任务 ID / 地址')" data-test="history-search-input" />
        </label>
      </div>
      <div class="history-list">
        <div
          v-for="item in filteredTaskHistory"
          :key="item.id"
          data-test="history-item"
          class="history-item"
          :class="{ active: item.id === selectedHistoryId }"
          @click="selectHistoryItem(item)"
        >
          <div class="history-item-main">
            <span data-test="history-status-badge" class="badge" :class="statusBadgeClass(item.status)">{{ statusLabel(item.status) }}</span>
            <span data-test="history-environment-badge" class="environment-badge">{{ getEnvironmentLabel(item.environment) }}</span>
            <span data-test="history-generation-type-badge" class="generation-type-badge">{{ getGenerationTypeLabel(item.capability) }}</span>
            <span class="history-time">{{ item.createdAt }}</span>
          </div>
          <p class="history-prompt">{{ item.prompt || '-' }}</p>
          <div class="history-meta">
            <span>{{ item.environment?.apiBase || item.request?.url || '-' }}</span>
            <span>{{ getCapabilityLabel(item.capability) }}</span>
            <span>{{ item.contentType }}</span>
            <span>{{ item.path }}</span>
            <span data-test="history-duration">{{ getHistoryDurationLabel(item) }} {{ formatHistoryDuration(item) }}</span>
          </div>
          <div class="history-actions">
            <button type="button" class="secondary small" data-test="load-history-item" @click.stop="selectHistoryItem(item)">{{ t('载入') }}</button>
            <button type="button" class="secondary small" data-test="open-history-detail" @click.stop="openHistoryDetail(item)">{{ t('详情') }}</button>
          </div>
        </div>
      </div>
      <div v-if="!filteredTaskHistory.length" class="empty-history">{{ t('没有符合筛选条件的记录。') }}</div>
        </section>

        <section
      :hidden="activeWorkspace !== 'matrix'"
      class="matrix-section panel"
      data-test="matrix-workspace"
    >
      <div class="matrix-header">
        <div>
          <h2>{{ t('模型能力矩阵') }}</h2>
          <span class="endpoint-hint">{{ t('来自当前能力预设，用于快速核对接口、类型和模型覆盖') }}</span>
        </div>
      </div>
      <section class="available-models" data-test="available-models" aria-labelledby="available-models-title">
        <div class="available-models-header">
          <div>
            <h3 id="available-models-title">{{ t('可用模型') }}</h3>
            <span>{{ t('来自历史记录中测试通过的模型') }}</span>
          </div>
        </div>
        <div v-if="availableModelGroups.length" class="available-model-groups">
          <article
            v-for="group in availableModelGroups"
            :key="group.id"
            class="available-model-group"
            data-test="available-model-group"
            :data-capability="group.id"
          >
            <h4>{{ group.label }}</h4>
            <div class="available-model-chips">
              <span v-for="model in group.models" :key="model" class="available-model-chip" data-test="available-model-chip">
                {{ model }}
              </span>
            </div>
          </article>
        </div>
        <div v-else class="available-models-empty">{{ t('暂无测试通过的模型。') }}</div>
      </section>
      <div class="matrix-table" data-test="capability-matrix">
        <div class="matrix-row matrix-row-head">
          <span>{{ t('能力') }}</span>
          <span>{{ t('模型数量') }}</span>
          <span>{{ t('接口路径') }}</span>
          <span>Content-Type</span>
          <span>{{ t('模型') }}</span>
        </div>
        <div v-for="item in capabilityMatrix" :key="item.id" class="matrix-row" data-test="capability-matrix-row">
          <strong>{{ item.label }}</strong>
          <span>{{ item.modelCount }} {{ t('个模型') }}</span>
          <span>{{ item.defaultPath }}</span>
          <span>{{ item.contentType }}</span>
          <span class="matrix-models">{{ item.models }}</span>
        </div>
      </div>
        </section>
      </main>
    </div>

    <aside v-if="isConnectionSettingsOpen" class="detail-drawer connection-settings-drawer" data-test="connection-settings-drawer">
      <div class="detail-backdrop" @click="closeConnectionSettings" />
      <section class="detail-panel connection-settings-panel" role="dialog" aria-modal="true" :aria-label="t('连接设置')">
        <div class="detail-head">
          <div>
            <p class="section-code">CONNECTION</p>
            <h2>{{ t('连接设置') }}</h2>
            <span class="endpoint-hint">{{ t('仅用于当前页面会话，刷新后自动清空。') }}</span>
          </div>
          <button type="button" class="secondary small" data-test="close-connection-settings" @click="closeConnectionSettings">
            {{ t('关闭') }}
          </button>
        </div>
        <div class="connection-settings-form">
          <label>
            API Base URL
            <input
              v-model="settingsApiBase"
              type="url"
              inputmode="url"
              autocomplete="off"
              :placeholder="t('请输入 API Base URL')"
              data-test="settings-api-base"
            />
          </label>
          <label>
            API Key
            <div class="secret-input-row">
              <input
                v-model="settingsApiKey"
                :type="showSettingsApiKey ? 'text' : 'password'"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                :placeholder="t('请输入 API Key')"
                data-test="settings-api-key"
              />
              <button type="button" class="secondary" data-test="toggle-api-key-visibility" @click="showSettingsApiKey = !showSettingsApiKey">
                {{ showSettingsApiKey ? t('隐藏') : t('显示') }}
              </button>
            </div>
          </label>
          <div class="connection-security-note">
            <strong>{{ t('会话级凭据') }}</strong>
            <span>{{ t('不会写入源码、环境变量、LocalStorage 或运行时配置。') }}</span>
          </div>
          <button type="button" class="primary connection-save-button" data-test="save-connection-settings" @click="saveConnectionSettings">
            {{ t('保存并使用') }}
          </button>
        </div>
      </section>
    </aside>

    <aside v-if="detailHistoryItem" class="detail-drawer" data-test="history-detail-drawer">
      <div class="detail-backdrop" @click="closeHistoryDetail" />
      <section class="detail-panel" role="dialog" :aria-label="t('任务详情')">
        <div class="detail-head">
          <div>
            <h2>{{ t('任务详情') }}</h2>
            <span class="endpoint-hint">{{ detailHistoryItem.createdAt }}</span>
          </div>
          <div class="detail-actions">
            <button type="button" class="secondary small" data-test="copy-history-report" @click="copyHistoryReport(detailHistoryItem)">
              {{ copyStatus.report ? translateDynamic(uiLanguage, copyStatus.report) : t('复制报告') }}
            </button>
            <button type="button" class="secondary small" data-test="close-history-detail" @click="closeHistoryDetail">{{ t('关闭') }}</button>
          </div>
        </div>
        <div class="detail-summary">
          <div>
            <span>{{ t('能力') }}</span>
            <strong>{{ getCapabilityLabel(detailHistoryItem.capability) }}</strong>
          </div>
          <div>
            <span>{{ t('状态') }}</span>
            <strong>{{ statusLabel(detailHistoryItem.status) }}</strong>
          </div>
          <div>
            <span>{{ t('路径') }}</span>
            <strong>{{ detailHistoryItem.path }}</strong>
          </div>
          <div>
            <span>Content-Type</span>
            <strong>{{ detailHistoryItem.contentType }}</strong>
          </div>
          <div>
            <span>{{ getHistoryDurationLabel(detailHistoryItem) }}</span>
            <strong data-test="history-detail-duration">{{ formatHistoryDuration(detailHistoryItem) }}</strong>
          </div>
          <template v-if="detailVideoResolution">
            <div>
              <span>{{ t('视频尺寸') }}</span>
              <strong data-test="history-detail-video-dimensions">{{ detailVideoResolution.width }}×{{ detailVideoResolution.height }}</strong>
            </div>
            <div>
              <span>{{ t('分辨率') }}</span>
              <strong data-test="history-detail-video-resolution">{{ detailVideoResolutionLevel }}</strong>
            </div>
            <div>
              <span>{{ t('是否 1080P') }}</span>
              <strong data-test="history-detail-video-is-1080p">{{ detailVideoIs1080p }}</strong>
            </div>
            <div>
              <span>{{ t('数据来源') }}</span>
              <strong data-test="history-detail-video-resolution-source">{{ detailVideoResolutionSource }}</strong>
            </div>
          </template>
        </div>
        <p class="detail-prompt">{{ detailHistoryItem.prompt || '-' }}</p>
        <div class="detail-json-grid">
          <div>
            <h2>{{ t('请求') }}</h2>
            <pre>{{ JSON.stringify(detailHistoryItem.request, null, 2) }}</pre>
          </div>
          <div>
            <h2>{{ t('响应') }}</h2>
            <pre>{{ JSON.stringify(detailHistoryItem.response, null, 2) }}</pre>
          </div>
        </div>
      </section>
    </aside>
  </div>
</template>
