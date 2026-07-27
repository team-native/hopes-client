// Shared utilities: API base, tokens, theme, toast, authed fetch.
// back2(Spring) 서버는 {success,message} 봉투 없이 DTO를 그대로 반환하고,
// 에러는 상태 코드 + {message} 바디로 내려준다.
import { API_BASE } from './config.js';

// ---- Theme (persisted) ----
export function initTheme() {
  const t = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
  return t;
}
export function setTheme(t) {
  localStorage.setItem('theme', t);
  document.documentElement.setAttribute('data-theme', t);
}
export const toApiTheme = (t) => (t === 'dark' ? 'DARK' : 'LIGHT');
export const fromApiTheme = (t) => (String(t).toUpperCase() === 'DARK' ? 'dark' : 'light');
initTheme();

// ---- Token storage (localStorage if "로그인 유지", else sessionStorage) ----
export function saveAuth(accessToken, keep) {
  const store = keep ? localStorage : sessionStorage;
  const other = keep ? sessionStorage : localStorage;
  other.removeItem('accessToken');
  store.setItem('accessToken', accessToken);
}
function getStore() {
  return localStorage.getItem('accessToken') ? localStorage : sessionStorage;
}
export function getAccessToken() { return getStore().getItem('accessToken'); }
export function logout() {
  localStorage.removeItem('accessToken');
  sessionStorage.removeItem('accessToken');
  location.href = '/pages/login.html';
}
export function requireAuth() {
  if (!getAccessToken()) { location.href = '/pages/login.html'; return false; }
  return true;
}

// ---- Toast ----
export function toast(message, type = 'info') {
  let c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ---- API helper ----
// auth:true 면 Authorization 헤더를 붙이고, 401이면 세션 만료로 보고 로그인 화면으로 보낸다.
export async function api(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${getAccessToken()}`;

  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    return { ok: false, status: 0, data: null, message: '서버에 연결할 수 없습니다.' };
  }

  if (auth && res.status === 401) {
    toast('세션이 만료되었습니다. 다시 로그인해주세요.', 'error');
    setTimeout(logout, 800);
    return { ok: false, status: 401, data: null, message: '로그인이 필요합니다' };
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, data, message: data?.message || '요청을 처리할 수 없습니다.' };
  }
  return { ok: true, status: res.status, data, message: '' };
}
