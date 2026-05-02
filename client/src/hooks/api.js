export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const get   = (path)       => api(path);
export const post  = (path, body) => api(path, { method: 'POST',   body });
export const patch = (path, body) => api(path, { method: 'PATCH',  body });
export const del   = (path)       => api(path, { method: 'DELETE' });
