// Shared utilities: API base, tokens, theme, toast, authed fetch.
// back2(Spring) 서버는 {success,message} 봉투 없이 DTO를 그대로 반환하고,
// 에러는 상태 코드 + {message} 바디로 내려준다.
import { API_BASE } from './config.js';

// ---- Theme (persisted) ----
export function initTheme() {
  const authPage = /\/(login|register)(?:\.html)?$/.test(location.pathname)
    || /\/pages\/(login|register)\.html$/.test(location.pathname);
  const t = authPage ? 'light' : (localStorage.getItem('theme') || 'light');
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
  location.href = '/login';
}
export function requireAuth() {
  if (!getAccessToken()) { location.href = '/login'; return false; }
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

// ---- Query string ----
// undefined/null/'' 값은 빼고 조립한다. (searchKeyword 미지정 시 파라미터 자체를 안 보냄)
export function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ---- API helper ----
// auth:true 면 Authorization 헤더를 붙이고, 401이면 세션 만료로 보고 로그인 화면으로 보낸다.
// 서버가 {message}를 안 주는 상태 코드는 명세서 기준 문구로 채운다.
// 서버 400 응답의 errors 맵은 Bean Validation 기본 문구(영문)가 섞여 온다.
// 실측된 문구를 한국어로 바꿔주고, 모르는 문구는 그대로 보여준다.
const EN_MESSAGE = [
  [/^size must be between (\d+) and (\d+)$/, (m) => `${m[1]}~${m[2]}자로 입력해주세요.`],
  [/^must be less than or equal to (\d+)$/, (m) => `${m[1]} 이하여야 합니다.`],
  [/^must be greater than or equal to (\d+)$/, (m) => `${m[1]} 이상이어야 합니다.`],
  [/^must not be (blank|empty|null)$/, () => '필수 입력 항목입니다.'],
  [/^must be a well-formed email address$/, () => '이메일 형식이 올바르지 않습니다.'],
];
export function humanizeError(msg) {
  const text = String(msg || '');
  for (const [re, to] of EN_MESSAGE) {
    const m = text.match(re);
    if (m) return to(m);
  }
  return text;
}

const STATUS_FALLBACK = {
  409: '이미 사용 중입니다.',
  429: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.',
  502: '서버가 외부 서비스와 통신하지 못했습니다. 잠시 후 다시 시도해주세요.',
  503: 'AI 서비스가 준비 중입니다. 잠시 후 다시 시도해주세요.',
};

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
    const message = humanizeError(data?.message) || STATUS_FALLBACK[res.status] || '요청을 처리할 수 없습니다.';
    // 400 응답은 {message, errors:{필드:문구}} 형태로 온다. (실측)
    const errors = data?.errors && typeof data.errors === 'object' ? data.errors : null;
    return { ok: false, status: res.status, data, message, errors };
  }
  return { ok: true, status: res.status, data, message: '', errors: null };
}
