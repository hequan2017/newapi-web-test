const TERMINAL_STATUSES = new Set(['completed', 'done', 'succeeded', 'failed', 'cancelled']);

export async function sendModelRequest({
  apiBase,
  apiKey,
  path,
  contentType = 'json',
  payload,
  fetcher = fetch,
}) {
  const request = resolveModelRequest({ path, contentType, payload });
  const options = contentType === 'multipart'
    ? buildMultipartRequestOptions(request.payload)
    : buildJSONRequestOptions(request.payload);

  return requestAny({
    fetcher,
    url: joinURL(apiBase, request.path),
    apiKey,
    options,
  });
}

export function buildRequestPreview({
  apiBase,
  apiKey,
  path,
  contentType = 'json',
  payload,
}) {
  const request = resolveModelRequest({ path, contentType, payload });
  const displayHeaders = buildRequestHeaders(apiKey, {
    'Content-Type': contentType === 'multipart' ? 'multipart/form-data (auto boundary)' : 'application/json',
  });
  return {
    method: 'POST',
    url: joinURL(apiBase, request.path),
    headers: displayHeaders,
    body: serializePreviewPayload(request.payload),
  };
}

export async function getTaskStatus({ apiBase, apiKey, taskID, path = '/v1/videos', fetcher = fetch }) {
  return requestAny({
    fetcher,
    url: joinURL(apiBase, `${normalizePath(path).replace(/\/+$/, '')}/${encodeURIComponent(taskID)}`),
    apiKey,
    options: { method: 'GET' },
  });
}

export function getContentURL(apiBase, taskID, path = '/v1/videos') {
  return joinURL(apiBase, `${normalizePath(path).replace(/\/+$/, '')}/${encodeURIComponent(taskID)}/content`);
}

export async function getVideoContent({ apiBase, apiKey, taskID, path = '/v1/videos', fetcher = fetch }) {
  return requestAny({
    fetcher,
    url: getContentURL(apiBase, taskID, path),
    apiKey,
    options: { method: 'GET' },
  });
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(String(status || '').toLowerCase());
}

export function normalizePath(path) {
  const value = String(path || '').trim();
  if (!value) {
    return '/';
  }
  return value.startsWith('/') ? value : `/${value}`;
}

function resolveModelRequest({ path, contentType, payload }) {
  const normalizedPath = normalizePath(path);
  if (contentType !== 'json' || !isGeminiImageRequest(normalizedPath, payload)) {
    return { path: normalizedPath, payload };
  }

  const model = String(payload.model || '').trim();
  return {
    path: `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    payload: buildGeminiImagePayload(payload),
  };
}

function isGeminiImageRequest(path, payload) {
  const model = String(payload?.model || '').trim().toLowerCase();
  return model.includes('gemini') && (
    path === '/v1/images/generations'
    || /^\/v1beta\/models\/[^/]+:generateContent$/.test(path)
  );
}

function buildGeminiImagePayload(payload) {
  return {
    contents: [
      {
        role: 'user',
        parts: [{ text: String(payload.prompt || '').trim() }],
      },
    ],
  };
}

async function requestAny({ fetcher, url, apiKey, options = {} }) {
  const headers = buildRequestHeaders(apiKey, options.headers);
  const response = await fetcher(url, {
    ...options,
    headers,
  });
  const data = await readResponse(response);

  if (!response.ok) {
    const message = data?.error?.message || data?.message || `HTTP ${response.status}`;
    throw Object.assign(new Error(message), { response: data });
  }

  return data;
}

async function readResponse(response) {
  const contentType = response.headers?.get?.('Content-Type') || response.headers?.get?.('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }
  if (typeof response.blob === 'function') {
    const blob = await response.blob();
    return {
      type: 'blob',
      mimeType: blob.type || contentType || 'application/octet-stream',
      size: blob.size,
      url: URL.createObjectURL(blob),
    };
  }
  return response.json?.().catch(() => ({})) || {};
}

function buildJSONRequestOptions(payload) {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  };
}

function buildMultipartRequestOptions(payload) {
  return {
    method: 'POST',
    headers: {},
    body: buildFormData(payload),
  };
}

function buildFormData(payload) {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    if (Array.isArray(value)) {
      if (value.every(isScalarFormPart)) {
        value.forEach((item) => {
          appendFormValue(formData, key, item);
        });
        return;
      }
      if (value.some((item) => item && typeof item === 'object')) {
        formData.append(key, JSON.stringify(value));
        return;
      }
      value.forEach((item) => {
        appendFormValue(formData, key, item);
      });
      return;
    }
    if (typeof value === 'object' && !(value instanceof Blob)) {
      formData.append(key, JSON.stringify(value));
      return;
    }
    if (isBinaryPart(value)) {
      appendFormValue(formData, key, value);
      return;
    }
    appendFormValue(formData, key, value);
  });
  return formData;
}

export function serializePreviewPayload(value) {
  if (Array.isArray(value)) {
    return value.map(serializePreviewPayload);
  }
  if (isBinaryPart(value)) {
    return {
      ...(value.name ? { name: value.name } : {}),
      type: value.type || 'application/octet-stream',
      size: value.size,
    };
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializePreviewPayload(item)]),
    );
  }
  return value;
}

function appendFormValue(formData, key, value) {
  if (value === undefined || value === null || value === '') {
    return;
  }
  formData.append(key, isBinaryPart(value) ? value : String(value));
}

function isBinaryPart(value) {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isScalarFormPart(value) {
  return value === undefined
    || value === null
    || value === ''
    || typeof value !== 'object'
    || isBinaryPart(value);
}

function buildRequestHeaders(apiKey, extra = {}) {
  const headers = { ...extra };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

function joinURL(base, path) {
  return `${String(base || '').replace(/\/+$/, '')}${path}`;
}
