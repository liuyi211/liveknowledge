const API_BASE = '';

async function fetchApi(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    const message = error.message || error.error || `HTTP ${response.status}`;
    const apiError = new Error(message) as Error & { status?: number; code?: string; data?: unknown };
    apiError.status = response.status;
    apiError.code = error.error;
    apiError.data = error;
    throw apiError;
  }

  return response.json();
}

export const api = {
  auth: {
    register: (username: string, password: string) =>
      fetchApi('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
    login: (username: string, password: string) =>
      fetchApi('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => fetchApi('/api/auth/logout', { method: 'POST' }),
    me: () => fetchApi('/api/auth/me'),
  },

  personas: {
    list: () => fetchApi('/api/personas'),
    create: (data: { name: string; systemPromptTemplate: string }) =>
      fetchApi('/api/personas', { method: 'POST', body: JSON.stringify(data) }),
  },

  sessions: {
    list: (params?: { q?: string; sort?: string; limit?: number; offset?: number }) => {
      const search = new URLSearchParams();
      if (params?.q) search.set('q', params.q);
      if (params?.sort) search.set('sort', params.sort);
      if (params?.limit) search.set('limit', String(params.limit));
      if (params?.offset !== undefined) search.set('offset', String(params.offset));
      const qs = search.toString();
      return fetchApi(`/api/sessions${qs ? `?${qs}` : ''}`);
    },
    create: (data: { title?: string; personaId?: string; modelId?: string }) =>
      fetchApi('/api/sessions', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => fetchApi(`/api/sessions/${id}`),
    update: (id: string, data: Partial<{ title: string; personaId: string | null; modelId: string | null }>) =>
      fetchApi(`/api/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi(`/api/sessions/${id}`, { method: 'DELETE' }),
    clear: (id: string) => fetchApi(`/api/sessions/${id}/clear`, { method: 'POST' }),
  },

  messages: {
    list: (sessionId: string, params?: { limit?: number; offset?: number }) => {
      const search = new URLSearchParams();
      if (params?.limit) search.set('limit', String(params.limit));
      if (params?.offset !== undefined) search.set('offset', String(params.offset));
      const qs = search.toString();
      return fetchApi(`/api/messages/session/${sessionId}${qs ? `?${qs}` : ''}`);
    },
    sendStream: (sessionId: string, body: {
      content: string;
      action?: 'send' | 'editAndResend' | 'regenerate';
      messageId?: string;
      modelId?: string;
      attachments?: Array<{ fileName: string; fileType: string; extractedText?: string; base64?: string }>;
    }, signal?: AbortSignal) => {
      return fetch(`${API_BASE}/api/messages/session/${sessionId}/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    },
    delete: (id: string) => fetchApi(`/api/messages/${id}`, { method: 'DELETE' }),
    feedback: (id: string, feedback: 'like' | 'dislike') =>
      fetchApi(`/api/messages/${id}/feedback`, { method: 'POST', body: JSON.stringify({ feedback }) }),
  },

  upload: {
    uploadFile: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      }).then((r) => {
        if (!r.ok) throw new Error('Upload failed');
        return r.json();
      });
    },
    uploadUrl: (url: string) => fetchApi('/api/upload/url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  },

  notes: {
    list: (params?: { folderId?: string | null; q?: string; tag?: string | null }) => {
      const search = new URLSearchParams();
      if (params?.q) search.set('q', params.q);
      else if (params?.folderId !== undefined) {
        search.set('folderId', params.folderId === null ? 'root' : params.folderId);
      }
      if (params?.tag) search.set('tag', params.tag);
      const qs = search.toString();
      return fetchApi(`/api/notes${qs ? `?${qs}` : ''}`);
    },
    create: (data: { title: string; content: string; tags?: string[]; folderId?: string | null; sourceType?: string | null; sourceId?: string | null; sourceMetadata?: Record<string, unknown> | null }) =>
      fetchApi('/api/notes', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => fetchApi(`/api/notes/${id}`),
    update: (id: string, data: Partial<{ title: string; content: string; tags: string[]; folderId: string | null; version: number }>) =>
      fetchApi(`/api/notes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi(`/api/notes/${id}`, { method: 'DELETE' }),
    tags: () => fetchApi('/api/notes/meta/tags'),
    index: (id: string) => fetchApi(`/api/notes/${id}/index`, { method: 'POST' }),
    indexStatus: (id: string) => fetchApi(`/api/notes/${id}/index-status`),
  },

  retrieval: {
    getSettings: () => fetchApi('/api/retrieval/settings'),
    updateSettings: (data: any) => fetchApi('/api/retrieval/settings', { method: 'PUT', body: JSON.stringify(data) }),
    debug: (query: string) => fetchApi('/api/retrieval/debug', { method: 'POST', body: JSON.stringify({ query }) }),
  },

  extraction: {
    createJob: (sourceType: string, sourceId: string) =>
      fetchApi('/api/extraction/jobs', { method: 'POST', body: JSON.stringify({ sourceType, sourceId }) }),
    getJob: (jobId: string) => fetchApi(`/api/extraction/jobs/${jobId}`),
    adopt: (jobId: string, data: any) =>
      fetchApi(`/api/extraction/jobs/${jobId}/adopt`, { method: 'POST', body: JSON.stringify(data) }),
  },

  folders: {
    list: () => fetchApi('/api/folders'),
    create: (data: { name: string; parentId?: string | null }) =>
      fetchApi('/api/folders', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ name: string; parentId: string | null }>) =>
      fetchApi(`/api/folders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi(`/api/folders/${id}`, { method: 'DELETE' }),
  },

  providers: {
    list: () => fetchApi('/api/providers'),
    create: (data: { providerType: string; apiKey: string; baseUrl?: string; model?: string; purpose?: 'chat' | 'embedding' }) =>
      fetchApi('/api/providers', { method: 'POST', body: JSON.stringify(data) }),
    models: () => fetchApi('/api/providers/models'),
    test: (data: { providerType: string; apiKey: string; baseUrl?: string; model?: string; purpose?: 'chat' | 'embedding' }) =>
      fetchApi('/api/providers/test', { method: 'POST', body: JSON.stringify(data) }),
  },
};
