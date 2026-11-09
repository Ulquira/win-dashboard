export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
export const AUTH_TOKEN_KEY = 'win_auth_token';
export const AUTH_USER_KEY = 'win_auth_user';

export async function apiFetch<T = any>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const token = localStorage.getItem(AUTH_TOKEN_KEY);

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers || {}),
    },
  });

  if (response.status === 401 && !endpoint.includes('/api/auth/login')) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    window.dispatchEvent(new Event('win-auth-logout'));
  }

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.error) errMsg = errJson.error;
    } catch {
      // Ignorar si no es JSON
    }
    throw new Error(errMsg);
  }

  return response.json() as Promise<T>;
}