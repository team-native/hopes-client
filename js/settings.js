import { api, requireAuth, toast, logout, setTheme, initTheme, toApiTheme, fromApiTheme } from './common.js';

if (!requireAuth()) throw new Error('redirect');

const $ = (id) => document.getElementById(id);
const views = { menu: $('menu-view'), general: $('general-view'), personal: $('personal-view') };

// 명세서 기준 상한: customPrompt 최대 4,000자 / inquiry content 최대 4,000자
const MAX_TEXT = 4000;

function show(name) {
  Object.entries(views).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
}

document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => show(b.dataset.go)));
document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => show('menu')));

/* ---- Logout (POST /logout) ---- */
$('logout-btn').onclick = async () => {
  await api('/logout', { method: 'POST', auth: true });
  logout();
};

/* ---- Contact (POST /setting/inquiry) ---- */
$('contact-btn').onclick = async () => {
  const content = prompt('문의하실 내용을 입력해주세요.');
  if (content === null) return;
  const text = content.trim();
  if (!text) return toast('내용을 입력해주세요.', 'error');
  if (text.length > MAX_TEXT) return toast(`문의는 ${MAX_TEXT.toLocaleString()}자까지 입력할 수 있어요.`, 'error');
  const r = await api('/setting/inquiry', { method: 'POST', auth: true, body: { content: text } });
  toast(r.ok ? '문의가 접수되었습니다.' : r.message, r.ok ? 'success' : 'error');
};

/* ---- Theme toggle (PATCH /general) ---- */
const themeToggle = $('theme-toggle');
initTheme();
themeToggle.onchange = async () => {
  const next = themeToggle.checked ? 'dark' : 'light';
  const r = await api('/general', { method: 'PATCH', auth: true, body: { theme: toApiTheme(next) } });
  if (!r.ok) { themeToggle.checked = !themeToggle.checked; return toast(r.message, 'error'); }
  setTheme(next);
};

/* ---- Load menu data (GET /setting/main): theme + customPrompt + 메뉴 상태 ---- */
// SettingMainResponse 하나로 화면 상태를 맞춘다. PATCH /setting 응답도 같은 형식이라 재사용한다.
function applySettingMain(d) {
  const localTheme = fromApiTheme(d.theme);
  setTheme(localTheme);
  themeToggle.checked = localTheme === 'dark';
  $('prompt').value = d.customPrompt || '';
  // 서버가 내려주는 메뉴 노출 상태(logout / inquiry)를 그대로 따른다.
  $('logout-btn').classList.toggle('hidden', d.logout === false);
  $('contact-btn').classList.toggle('hidden', d.inquiry === false);
}

async function loadSettingMain() {
  const r = await api('/setting/main', { auth: true });
  if (!r.ok) return toast(r.message, 'error');
  applySettingMain(r.data);
}

/* ---- Personal prompt (PATCH /setting) ---- */
$('save-prompt-btn').onclick = async () => {
  const customPrompt = $('prompt').value;
  if (customPrompt.length > MAX_TEXT) {
    return toast(`프롬프트는 ${MAX_TEXT.toLocaleString()}자까지 저장할 수 있어요. (현재 ${customPrompt.length.toLocaleString()}자)`, 'error');
  }
  const r = await api('/setting', { method: 'PATCH', auth: true, body: { customPrompt } });
  if (r.ok && r.data) applySettingMain(r.data);
  toast(r.ok ? '프롬프트가 저장되었습니다.' : r.message, r.ok ? 'success' : 'error');
};

/* ---- Delete all chats (PATCH /setting, confirm modal) ---- */
$('delete-all-btn').onclick = () => {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h3>모든 대화 삭제</h3>
      <p>정말 모든 대화를 삭제하시겠어요? 이 작업은 되돌릴 수 없습니다.</p>
      <div class="row">
        <button class="secondary" id="m-cancel">취소</button>
        <button class="danger" id="m-ok">삭제</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#m-cancel').onclick = () => backdrop.remove();
  backdrop.querySelector('#m-ok').onclick = async () => {
    const r = await api('/setting', { method: 'PATCH', auth: true, body: { deleteAllChats: true } });
    backdrop.remove();
    if (r.ok && r.data) applySettingMain(r.data);
    toast(r.ok ? '모든 대화가 삭제되었습니다.' : r.message, r.ok ? 'success' : 'error');
  };
};

loadSettingMain();
