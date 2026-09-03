import { api, qs, requireAuth, toast, logout } from './common.js';
import { renderMarkdown } from './markdown.js';

if (!requireAuth()) throw new Error('redirect');

const $ = (id) => document.getElementById(id);
const messagesEl = $('messages');
const listEl = $('chat-list');
const input = $('composer-input');

// 명세서 기준 상한: GET /main size 최대 100, GET /chats/{id} messageSize 최대 100,
// POST /chats/{id}/messages content 최대 12,000자.
const CHAT_PAGE_SIZE = 50;
const MESSAGE_PAGE_SIZE = 100;
const MAX_CONTENT = 12000;
const MAX_KEYWORD = 255;

let currentChatId = null;
let streaming = false;
let msgCol = null;

// 메시지 페이징 상태 (GET /chats/{id} messagePage / hasMoreMessages)
let msgItems = [];
let msgPage = 0;
let msgHasMore = false;

// 대화 목록 페이징 상태
let chatPage = 0;
let chatKeyword = '';
let chatItems = [];
let chatHasMore = false;

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

/* ---------- Message store ----------
   서버가 messagePage를 어느 방향(오래된 순/최신 순)으로 주더라도 화면 순서가 깨지지 않도록
   받은 메시지를 id로 합치고 createdAt(동률이면 id) 기준으로 정렬해 통째로 다시 그린다. */
const msgKey = (m) => (m.id != null ? `id:${m.id}` : `${m.role}:${m.content}`);
function sortMsgs(a, b) {
  const ta = Date.parse(a.createdAt || '');
  const tb = Date.parse(b.createdAt || '');
  if (!isNaN(ta) && !isNaN(tb) && ta !== tb) return ta - tb;
  return (a.id || 0) - (b.id || 0);
}
function mergeMessages(list) {
  const map = new Map(msgItems.map((m) => [msgKey(m), m]));
  (list || []).forEach((m) => map.set(msgKey(m), m));
  msgItems = [...map.values()].sort(sortMsgs);
}
function resetMessages() {
  msgItems = [];
  msgPage = 0;
  msgHasMore = false;
  msgCol = null;
  messagesEl.innerHTML = '';
}
function renderMessages() {
  if (!msgItems.length) return showEmptyState();
  messagesEl.innerHTML = '';
  msgCol = null;
  const col = ensureCol();
  if (msgHasMore) col.appendChild(moreMessagesBtn());
  msgItems.forEach((m) => addMessage(roleOf(m), m.content));
  scrollToBottom();
}

// 이전(추가) 메시지 페이지를 불러오는 버튼. 목록 맨 위에 붙는다.
function moreMessagesBtn() {
  const btn = document.createElement('button');
  btn.className = 'load-more';
  btn.textContent = '이전 메시지 더 보기';
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = '불러오는 중…';
    const next = msgPage + 1;
    const r = await api(`/chats/${currentChatId}${qs({ messagePage: next, messageSize: MESSAGE_PAGE_SIZE })}`, { auth: true });
    if (!r.ok) { btn.disabled = false; btn.textContent = '이전 메시지 더 보기'; return toast(r.message, 'error'); }
    msgPage = next;
    msgHasMore = !!r.data.hasMoreMessages;
    const keepTop = messagesEl.scrollHeight - messagesEl.scrollTop;
    mergeMessages(r.data.messages);
    renderMessages();
    // 새로 붙은 만큼 스크롤 위치를 보정해 읽던 지점을 유지한다.
    messagesEl.scrollTop = messagesEl.scrollHeight - keepTop;
  };
  return btn;
}

/* ---------- Chat list (GET /main?searchKeyword&page&size) ---------- */
// append=true 면 다음 페이지를 기존 목록 뒤에 이어 붙인다.
async function loadChats(activeId, keyword, { append = false } = {}) {
  if (!append) { chatPage = 0; chatItems = []; chatKeyword = keyword || ''; }

  const r = await api(`/main${qs({ searchKeyword: chatKeyword, page: chatPage, size: CHAT_PAGE_SIZE })}`, { auth: true });
  if (!r.ok) {
    if (!append) listEl.innerHTML = `<div class="chat-item" style="cursor:default;color:var(--muted)">${r.message}</div>`;
    else toast(r.message, 'error');
    return;
  }

  const page = r.data.chatList || [];
  chatItems = append ? chatItems.concat(page) : page;
  // 서버가 주는 hasNext를 그대로 쓰고, 없으면 페이지가 꽉 찼는지로 판단한다.
  chatHasMore = r.data.hasNext ?? (page.length === CHAT_PAGE_SIZE);
  renderChatList(chatItems, activeId);
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

const TRASH_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';

function makeItem(c, activeId) {
  const item = document.createElement('div');
  item.className = 'chat-item' + (c.id === activeId ? ' active' : '');
  const title = document.createElement('span');
  title.className = 'chat-title';
  title.textContent = c.title || '새 대화';
  item.append(title);

  const actions = document.createElement('div');
  actions.className = 'chat-actions';
  const del = document.createElement('button');
  del.className = 'chat-act';
  del.type = 'button';
  del.title = '대화 삭제';
  del.innerHTML = TRASH_SVG;
  del.onclick = (e) => { e.stopPropagation(); deleteChat(c); };
  actions.append(del);
  item.append(actions);

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

  if (chatHasMore) {
    const more = document.createElement('button');
    more.className = 'load-more';
    more.textContent = '이전 대화 더 보기';
    more.onclick = async () => {
      more.disabled = true;
      more.textContent = '불러오는 중…';
      chatPage += 1;
      await loadChats(activeId, chatKeyword, { append: true });
    };
    listEl.appendChild(more);
  }
}

// 공용 확인 모달. 확인=true / 취소·바깥클릭=false 로 resolve.
function confirmModal({ title, body, okText = '삭제' }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3></h3>
        <p></p>
        <div class="row">
          <button class="secondary" data-act="cancel">취소</button>
          <button class="danger" data-act="ok"></button>
        </div>
      </div>`;
    backdrop.querySelector('h3').textContent = title;
    backdrop.querySelector('p').textContent = body;
    backdrop.querySelector('[data-act="ok"]').textContent = okText;
    const close = (v) => { backdrop.remove(); resolve(v); };
    backdrop.querySelector('[data-act="cancel"]').onclick = () => close(false);
    backdrop.querySelector('[data-act="ok"]').onclick = () => close(true);
    backdrop.onclick = (e) => { if (e.target === backdrop) close(false); };
    document.body.appendChild(backdrop);
  });
}

// 대화 1건 삭제 (DELETE /chats/{id})
async function deleteChat(c) {
  const ok = await confirmModal({
    title: '대화 삭제',
    body: `"${c.title || '새 대화'}" 대화를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
  });
  if (!ok) return;
  const r = await api(`/chats/${c.id}`, { method: 'DELETE', auth: true });
  // 성공은 204 No Content. 본인 소유가 아니거나 없는 대화면 404.
  if (!r.ok) {
    if (r.status === 404) { toast('이미 삭제된 대화예요.', 'info'); loadChats(currentChatId); return; }
    return toast(r.message, 'error');
  }
  toast('대화를 삭제했어요.', 'success');
  if (c.id === currentChatId) {
    currentChatId = null;
    resetMessages();
    showEmptyState();
  }
  loadChats(currentChatId);
}

async function openChat(chatId) {
  const r = await api(`/chats/${chatId}${qs({ messagePage: 0, messageSize: MESSAGE_PAGE_SIZE })}`, { auth: true });
  if (!r.ok) return toast(r.message, 'error');
  currentChatId = chatId;
  // 이전 대화 내용이 남지 않도록 항상 비우고 새로 그린다.
  resetMessages();
  msgHasMore = !!r.data.hasMoreMessages;
  mergeMessages(r.data.messages);
  renderMessages();
  loadChats(chatId);
  openSidebar(false);
}

/* ---------- New chat ----------
   서버에 빈 대화가 쌓이지 않도록 여기서는 화면만 비운다.
   실제 POST /chats 는 첫 메시지를 보낼 때 send()에서 만든다. */
$('new-chat-btn').onclick = () => {
  currentChatId = null;
  resetMessages();
  showEmptyState();
  loadChats(null);
  openSidebar(false);
  input.focus();
};

/* ---------- Search (GET /main?searchKeyword=) ---------- */
$('search-btn').onclick = doSearch;
$('search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
function doSearch() {
  const q = $('search-input').value.trim();
  if (q.length > MAX_KEYWORD) return toast(`검색어는 ${MAX_KEYWORD}자까지 입력할 수 있어요.`, 'error');
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
  if (text.length > MAX_CONTENT) {
    return toast(`질문은 ${MAX_CONTENT.toLocaleString()}자까지 보낼 수 있어요. (현재 ${text.length.toLocaleString()}자)`, 'error');
  }
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
    const last = [...(r.data.messages || [])].reverse().find((m) => m.role === 'ASSISTANT');
    if (!last) { aiBubble.innerHTML = '(응답이 비어 있어요)'; return; }
    // 응답에 방금 보낸 질문이 들어 있으면 서버 목록으로 화면 전체를 맞춘다.
    // (낙관적으로 그린 임시 말풍선이 실제 메시지로 교체된다)
    if (r.data.messages.some((m) => m.role === 'USER' && m.content === text)) {
      mergeMessages(r.data.messages);
      renderMessages();
    } else {
      aiBubble.innerHTML = renderMarkdown(last.content);
    }
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
