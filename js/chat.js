import { api, requireAuth, toast, logout } from './common.js';
import { renderMarkdown } from './markdown.js';

if (!requireAuth()) throw new Error('redirect');

const $ = (id) => document.getElementById(id);
const messagesEl = $('messages');
const listEl = $('chat-list');
const input = $('composer-input');

let currentChatId = null;
let streaming = false;
let msgCol = null;

// 일관된 라인 아이콘 세트 (feather 스타일)
const LINE_ICON = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  cap: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
};
const SUGGESTIONS = [
  { icon: 'home', text: '기숙사 하루 일과가 어떻게 돼?' },
  { icon: 'cap', text: '입학하려면 뭘 준비해야 해?' },
  { icon: 'code', text: '전공 선택은 어떻게 하는 게 좋아?' },
  { icon: 'chat', text: '후배한테 해주고 싶은 조언 있어?' },
];
const iconSvg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LINE_ICON[k]}</svg>`;

/* ---------- Sidebar (mobile) ---------- */
const backdrop = $('sidebar-backdrop');
function openSidebar(open) { $('sidebar').classList.toggle('open', open); backdrop.classList.toggle('show', open); }
$('hamburger').onclick = () => openSidebar(true);
backdrop.onclick = () => openSidebar(false);

/* ---------- Rendering ---------- */
function ensureCol() {
  if (msgCol && msgCol.isConnected) return msgCol;
  messagesEl.innerHTML = '';
  msgCol = document.createElement('div');
  msgCol.className = 'msg-col';
  messagesEl.appendChild(msgCol);
  return msgCol;
}
function showEmptyState() {
  msgCol = null;
  const cards = SUGGESTIONS.map((s) => `<button class="suggestion" data-q="${s.text}"><span class="s-icon">${iconSvg(s.icon)}</span><span class="s-text">${s.text}</span></button>`).join('');
  messagesEl.innerHTML = `
    <div class="empty-state">
      <span class="brand-mark" style="width:58px;height:58px;border-radius:17px;font-size:38px;margin-bottom:10px;">h</span>
      <h2>무엇이 궁금한가요?</h2>
      <p>광주소프트웨어마이스터고 선배에게 편하게 물어보세요.</p>
      <div class="suggestions">${cards}</div>
    </div>`;
  bindSuggestions();
}
function bindSuggestions() {
  document.querySelectorAll('.suggestion').forEach((s) => {
    s.onclick = () => { input.value = s.dataset.q; autoGrow(); send(); };
  });
}

function addMessage(role, text) {
  const col = ensureCol();
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  const body = document.createElement('div');
  body.className = 'msg-body';
  if (role === 'ai') {
    const av = document.createElement('div'); av.className = 'avatar'; av.textContent = '선';
    wrap.appendChild(av);
    const r = document.createElement('div'); r.className = 'msg-role'; r.textContent = '선배';
    body.appendChild(r);
  }
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (role === 'ai') bubble.innerHTML = renderMarkdown(text);
  else bubble.textContent = text;
  body.appendChild(bubble);
  wrap.appendChild(body);
  col.appendChild(wrap);
  scrollToBottom();
  return bubble;
}
function scrollToBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }
const roleOf = (m) => (m.role === 'ASSISTANT' ? 'ai' : 'user');

/* ---------- Chat list (GET /main) ---------- */
async function loadChats(activeId, keyword) {
  const q = keyword ? `?searchKeyword=${encodeURIComponent(keyword)}` : '';
  const r = await api(`/main${q}`, { auth: true });
  if (r.ok) renderChatList(r.data.chatList, activeId);
  else listEl.innerHTML = `<div class="chat-item" style="cursor:default;color:var(--muted)">${r.message}</div>`;
}

// created_at(ISO, e.g. 2024-01-01T12:00:00Z)을 오늘/어제/지난 7일/이전 버킷으로.
function dateBucket(iso) {
  const d = new Date(iso || '');
  if (isNaN(d)) return '이전';
  const midnight = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = (midnight(new Date()) - midnight(d)) / 86400000;
  if (diff <= 0) return '오늘';
  if (diff < 2) return '어제';
  if (diff < 8) return '지난 7일';
  return '이전';
}

const GROUP_ORDER = ['오늘', '어제', '지난 7일', '이전'];

function makeItem(c, activeId) {
  const item = document.createElement('div');
  item.className = 'chat-item' + (c.id === activeId ? ' active' : '');
  const title = document.createElement('span');
  title.className = 'chat-title';
  title.textContent = c.title || '새 대화';
  item.append(title);
  item.onclick = () => openChat(c.id);
  return item;
}

function renderChatList(chats, activeId) {
  listEl.innerHTML = '';
  if (!chats.length) { listEl.innerHTML = '<div class="chat-item empty">아직 대화가 없어요</div>'; return; }

  const groups = {};
  chats.forEach((c) => { (groups[dateBucket(c.updatedAt)] ||= []).push(c); });

  GROUP_ORDER.forEach((g) => {
    const items = groups[g];
    if (!items || !items.length) return;
    const label = document.createElement('div');
    label.className = 'list-label';
    label.textContent = g;
    listEl.appendChild(label);
    items.forEach((c) => listEl.appendChild(makeItem(c, activeId)));
  });
}

async function openChat(chatId) {
  const r = await api(`/chats/${chatId}`, { auth: true });
  if (!r.ok) return toast(r.message, 'error');
  currentChatId = chatId;
  if (r.data.messages.length === 0) showEmptyState();
  else { ensureCol(); r.data.messages.forEach((m) => addMessage(roleOf(m), m.content)); }
  loadChats(chatId);
  openSidebar(false);
}

/* ---------- New chat (POST /chats) ---------- */
$('new-chat-btn').onclick = async () => {
  const r = await api('/chats', { method: 'POST', auth: true, body: {} });
  if (!r.ok) return toast(r.message, 'error');
  currentChatId = r.data.id;
  showEmptyState();
  loadChats(currentChatId);
  openSidebar(false);
  input.focus();
};

/* ---------- Search (GET /main?searchKeyword=) ---------- */
$('search-btn').onclick = doSearch;
$('search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
function doSearch() {
  const q = $('search-input').value.trim();
  loadChats(currentChatId, q || undefined);
}

/* ---------- Composer ---------- */
function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 200) + 'px'; }
input.addEventListener('input', autoGrow);
$('send-btn').onclick = send;
input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

async function send() {
  if (streaming) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = ''; autoGrow();
  streaming = true;
  $('send-btn').disabled = true;

  addMessage('user', text);
  const aiBubble = addMessage('ai', '');
  aiBubble.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';

  try {
    // 아직 대화가 없으면(새로 들어온 상태) 먼저 대화를 만든 뒤 메시지를 보낸다.
    if (!currentChatId) {
      const created = await api('/chats', { method: 'POST', auth: true, body: {} });
      if (!created.ok) { aiBubble.textContent = created.message; return; }
      currentChatId = created.data.id;
    }
    const r = await api(`/chats/${currentChatId}/messages`, { method: 'POST', auth: true, body: { content: text } });
    if (!r.ok) { aiBubble.textContent = r.message; return; }
    const last = [...r.data.messages].reverse().find((m) => m.role === 'ASSISTANT');
    aiBubble.innerHTML = last ? renderMarkdown(last.content) : '(응답이 비어 있어요)';
  } catch {
    aiBubble.textContent = '연결 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
  } finally {
    streaming = false;
    $('send-btn').disabled = false;
    loadChats(currentChatId);
    scrollToBottom();
    input.focus();
  }
}

/* ---------- Init ---------- */
showEmptyState();
loadChats(null);
