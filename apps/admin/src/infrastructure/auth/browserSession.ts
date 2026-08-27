const SESSION_KEY = 'eduzone.admin.session_id';

export function getBrowserSessionId() {
  if (typeof window === 'undefined') return null;

  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;

  const sessionId = crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_KEY, sessionId);
  return sessionId;
}

export function clearBrowserSessionId() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(SESSION_KEY);
}
