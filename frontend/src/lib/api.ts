const API_BASE = '';
const STREAM_API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';

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
    create: (data: { name: string; systemPromptTemplate?: string; description?: string; knowledgeDomains?: string[] }) =>
      fetchApi('/api/personas', { method: 'POST', body: JSON.stringify(data) }),
    generate: (description: string) =>
      fetchApi('/api/personas/generate', { method: 'POST', body: JSON.stringify({ description }) }),
    delete: (id: string) => fetchApi(`/api/personas/${id}`, { method: 'DELETE' }),
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
    regenerateSummary: (id: string) => fetchApi(`/api/sessions/${id}/summary/regenerate`, { method: 'POST' }),
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
      return fetch(`${STREAM_API_BASE}/api/messages/session/${sessionId}/stream`, {
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

  review: {
    due: (params?: { limit?: number; tag?: string; noteId?: string; mode?: 'due' | 'weak' }) => {
      const search = new URLSearchParams();
      if (params?.limit) search.set('limit', String(params.limit));
      if (params?.tag) search.set('tag', params.tag);
      if (params?.noteId) search.set('noteId', params.noteId);
      if (params?.mode) search.set('mode', params.mode);
      const qs = search.toString();
      return fetchApi(`/api/review/due${qs ? `?${qs}` : ''}`);
    },
    rate: (cardId: string, data: { rating: 1 | 2 | 3 | 4; responseTimeMs: number }) =>
      fetchApi(`/api/review/cards/${cardId}/rate`, { method: 'POST', body: JSON.stringify(data) }),
    updateCard: (cardId: string, data: { front?: string; back?: string }) =>
      fetchApi(`/api/review/cards/${cardId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    suspendCard: (cardId: string) =>
      fetchApi(`/api/review/cards/${cardId}/suspend`, { method: 'POST' }),
    markQualityReviewed: (cardId: string) =>
      fetchApi(`/api/review/cards/${cardId}/quality-reviewed`, { method: 'POST' }),
    stats: () => fetchApi('/api/review/stats'),
    filters: () => fetchApi('/api/review/filters'),
    quality: (params?: { includeReviewed?: boolean; limit?: number }) => {
      const search = new URLSearchParams();
      if (params?.includeReviewed !== undefined) search.set('includeReviewed', String(params.includeReviewed));
      if (params?.limit) search.set('limit', String(params.limit));
      const qs = search.toString();
      return fetchApi(`/api/review/quality${qs ? `?${qs}` : ''}`);
    },
  },

  extraction: {
    createJob: (
      sourceType: string,
      sourceId?: string,
      extra?: { title?: string; content?: string; metadata?: Record<string, unknown> }
    ) =>
      fetchApi('/api/extraction/jobs', { method: 'POST', body: JSON.stringify({ sourceType, sourceId, ...extra }) }),
    getJob: (jobId: string) => fetchApi(`/api/extraction/jobs/${jobId}`),
    adopt: (jobId: string, data: any) =>
      fetchApi(`/api/extraction/jobs/${jobId}/adopt`, { method: 'POST', body: JSON.stringify(data) }),
  },

  graph: {
    overview: (params?: { limit?: number; q?: string; relationType?: string; isolatedOnly?: boolean }) => {
      const search = new URLSearchParams();
      if (params?.limit) search.set('limit', String(params.limit));
      if (params?.q) search.set('q', params.q);
      if (params?.relationType) search.set('relationType', params.relationType);
      if (params?.isolatedOnly) search.set('isolatedOnly', 'true');
      const qs = search.toString();
      return fetchApi(`/api/graph/overview${qs ? `?${qs}` : ''}`);
    },
    search: (q: string) => fetchApi(`/api/graph/search?q=${encodeURIComponent(q)}`),
    concept: (id: string) => fetchApi(`/api/graph/concepts/${id}`),
    neighborhood: (id: string) => fetchApi(`/api/graph/concepts/${id}/neighborhood`),
    cardContext: (cardId: string) => fetchApi(`/api/graph/cards/${cardId}/context`),
    quality: (params?: { limit?: number }) => {
      const search = new URLSearchParams();
      if (params?.limit) search.set('limit', String(params.limit));
      const qs = search.toString();
      return fetchApi(`/api/graph/quality${qs ? `?${qs}` : ''}`);
    },
    health: () => fetchApi('/api/graph/health'),
    path: (params: { sourceId: string; targetId: string; maxDepth?: number }) => {
      const search = new URLSearchParams();
      search.set('sourceId', params.sourceId);
      search.set('targetId', params.targetId);
      if (params.maxDepth) search.set('maxDepth', String(params.maxDepth));
      return fetchApi(`/api/graph/path?${search.toString()}`);
    },
    learningPath: (params?: { targetConceptId?: string; limit?: number }) => {
      const search = new URLSearchParams();
      if (params?.targetConceptId) search.set('targetConceptId', params.targetConceptId);
      if (params?.limit) search.set('limit', String(params.limit));
      const qs = search.toString();
      return fetchApi(`/api/graph/learning-path${qs ? `?${qs}` : ''}`);
    },
    syncNeo4j: () => fetchApi('/api/graph/sync/neo4j', { method: 'POST' }),
    confirmRelation: (relationId: string) =>
      fetchApi(`/api/graph/relations/${relationId}/confirm`, { method: 'POST' }),
    deleteRelation: (relationId: string) =>
      fetchApi(`/api/graph/relations/${relationId}`, { method: 'DELETE' }),
  },

  profile: {
    get: () => fetchApi('/api/profile'),
    recompute: () => fetchApi('/api/profile/recompute', { method: 'POST' }),
    summary: () => fetchApi('/api/profile/summary'),
    domainMastery: () => fetchApi('/api/profile/domain-mastery'),
    weakPoints: (params?: { limit?: number }) => {
      const search = new URLSearchParams();
      if (params?.limit) search.set('limit', String(params.limit));
      const qs = search.toString();
      return fetchApi(`/api/profile/weak-points${qs ? `?${qs}` : ''}`);
    },
  },

  memories: {
    list: (params?: { status?: string; type?: string; limit?: number; offset?: number }) => {
      const search = new URLSearchParams();
      if (params?.status) search.set('status', params.status);
      if (params?.type) search.set('type', params.type);
      if (params?.limit) search.set('limit', String(params.limit));
      if (params?.offset !== undefined) search.set('offset', String(params.offset));
      const qs = search.toString();
      return fetchApi(`/api/memories${qs ? `?${qs}` : ''}`);
    },
    update: (id: string, data: Partial<{ type: string; content: string; importance: number; confidence: number; status: string }>) =>
      fetchApi(`/api/memories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    archive: (id: string) => fetchApi(`/api/memories/${id}`, { method: 'DELETE' }),
    reject: (id: string) => fetchApi(`/api/memories/${id}/reject`, { method: 'POST' }),
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
