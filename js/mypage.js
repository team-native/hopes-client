import { api, requireAuth, toast } from './common.js';

if (!requireAuth()) throw new Error('redirect');

const $ = (id) => document.getElementById(id);

function updatePreview() {
  const url = $('profileImage').value.trim();
  $('profile-preview').style.display = url ? 'block' : 'none';
  $('profile-preview').src = url;
}
$('profileImage').addEventListener('input', updatePreview);

async function load() {
  const r = await api('/mypage', { auth: true });
  if (!r.ok) return toast(r.message, 'error');
  const u = r.data;
  $('username').value = u.username || '';
  $('nickname').value = u.nickname || '';
  $('profileImage').value = u.profileImage || '';
  $('bio').value = u.profileInfo || '';
  $('v-email').textContent = u.email || '-';
  $('v-gender').textContent = u.gender || '-';
  $('v-major').textContent = u.major || '-';
  $('v-cohort').textContent = u.cohort ? `${u.cohort}기` : '-';
  updatePreview();
}

$('save-btn').onclick = async () => {
  $('err-username').textContent = '';
  $('err-nickname').textContent = '';
  const username = $('username').value.trim();
  if (!username) return ($('err-username').textContent = '아이디를 입력해주세요.');
  const body = {
    username,
    nickname: $('nickname').value.trim(),
    profileImage: $('profileImage').value.trim(),
    profileInfo: $('bio').value,
  };
  const r = await api('/mypage', { method: 'PATCH', auth: true, body });
  if (!r.ok) {
    if (r.message.includes('이름')) return ($('err-username').textContent = r.message);
    return toast(r.message, 'error');
  }
  toast('저장되었습니다.', 'success');
};

load();
