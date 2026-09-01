const SESSION_KEY = 'eduzone.admin.session_id';

export function getBrowserSessionId() {
  if (typeof window === 'undefined') return null;

  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;

  const sessionId = crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, sessionId);
  return sessionId;
}

export function clearBrowserSessionId() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SESSION_KEY);
}

