const API_BASE = '';

async function fetchApi(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
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
    list: () => fetchApi('/api/sessions'),
    create: (data: { title?: string; personaId?: string }) =>
      fetchApi('/api/sessions', { method: 'POST', body: JSON.stringify(data) }),
    get: (id: string) => fetchApi(`/api/sessions/${id}`),
  },

  messages: {
    list: (sessionId: string) => fetchApi(`/api/messages/session/${sessionId}`),
    send: (sessionId: string, content: string) =>
      fetchApi(`/api/messages/session/${sessionId}`, { method: 'POST', body: JSON.stringify({ content }) }),
    sendStream: (sessionId: string, content: string) => {
      return fetch(`${API_BASE}/api/messages/session/${sessionId}/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
    },
  },

  notes: {
    list: () => fetchApi('/api/notes'),
    create: (data: { title: string; content: string; tags?: string[] }) =>
      fetchApi('/api/notes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ title: string; content: string; tags: string[] }>) =>
      fetchApi(`/api/notes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi(`/api/notes/${id}`, { method: 'DELETE' }),
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
