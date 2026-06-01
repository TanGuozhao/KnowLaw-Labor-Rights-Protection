const TOKEN_KEY_PERSISTENT = "auth_token";
const TOKEN_KEY_SESSION = "auth_token_session";
const USER_KEY_PERSISTENT = "auth_user";
const USER_KEY_SESSION = "auth_user_session";
const LEGACY_TOKEN_KEY = "access_token";

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

function migrateLegacyTokenIfNeeded() {
  const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (!legacyToken) return;
  if (!localStorage.getItem(TOKEN_KEY_PERSISTENT) && !sessionStorage.getItem(TOKEN_KEY_SESSION)) {
    localStorage.setItem(TOKEN_KEY_PERSISTENT, legacyToken);
  }
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

function resolveUserStorage() {
  migrateLegacyTokenIfNeeded();
  if (localStorage.getItem(TOKEN_KEY_PERSISTENT) || localStorage.getItem(USER_KEY_PERSISTENT)) {
    return localStorage;
  }
  return sessionStorage;
}

export function saveAuthSession({ token, user = null, remember = false }) {
  if (!token) return;

  clearAuthSession();
  if (remember) {
    localStorage.setItem(TOKEN_KEY_PERSISTENT, token);
    if (user) {
      localStorage.setItem(USER_KEY_PERSISTENT, JSON.stringify(user));
    }
    return;
  }

  sessionStorage.setItem(TOKEN_KEY_SESSION, token);
  if (user) {
    sessionStorage.setItem(USER_KEY_SESSION, JSON.stringify(user));
  }
}

export function getAuthToken() {
  migrateLegacyTokenIfNeeded();
  return localStorage.getItem(TOKEN_KEY_PERSISTENT) || sessionStorage.getItem(TOKEN_KEY_SESSION) || "";
}

export function getCurrentUser() {
  const persistentUser = safeParse(localStorage.getItem(USER_KEY_PERSISTENT));
  if (persistentUser) return persistentUser;
  return safeParse(sessionStorage.getItem(USER_KEY_SESSION));
}

export function setCurrentUser(user) {
  const storage = resolveUserStorage();
  const key = storage === localStorage ? USER_KEY_PERSISTENT : USER_KEY_SESSION;
  if (!user) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify(user));
}

export function mergeCurrentUser(nextFields = {}) {
  const currentUser = getCurrentUser() || {};
  const merged = {
    ...currentUser,
    ...nextFields,
  };
  setCurrentUser(merged);
  return merged;
}

export function isAuthenticated() {
  return Boolean(getAuthToken());
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY_PERSISTENT);
  localStorage.removeItem(USER_KEY_PERSISTENT);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY_SESSION);
  sessionStorage.removeItem(USER_KEY_SESSION);
}