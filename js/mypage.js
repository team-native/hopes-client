import { api, requireAuth, toast, humanizeError } from './common.js';

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

// 명세서 기준 상한: username/nickname 50자, profileInfo 2,000자, profileImage 255자
const MAX = { name: 50, info: 2000, image: 255 };

$('save-btn').onclick = async () => {
  $('err-username').textContent = '';
  $('err-nickname').textContent = '';
  const username = $('username').value.trim();
  const nickname = $('nickname').value.trim();
  const profileImage = $('profileImage').value.trim();
  const profileInfo = $('bio').value;

  if (!username) return ($('err-username').textContent = '아이디를 입력해주세요.');
  if (username.length > MAX.name) return ($('err-username').textContent = `아이디는 ${MAX.name}자까지 입력할 수 있어요.`);
  if (nickname.length > MAX.name) return ($('err-nickname').textContent = `닉네임은 ${MAX.name}자까지 입력할 수 있어요.`);
  if (profileImage.length > MAX.image) return toast(`프로필 이미지 URL은 ${MAX.image}자까지 입력할 수 있어요.`, 'error');
  if (profileInfo.length > MAX.info) {
    return toast(`자기소개는 ${MAX.info.toLocaleString()}자까지 입력할 수 있어요. (현재 ${profileInfo.length.toLocaleString()}자)`, 'error');
  }

  const r = await api('/mypage', { method: 'PATCH', auth: true, body: { username, nickname, profileImage, profileInfo } });
  if (!r.ok) {
    // 400은 {errors:{필드:문구}}로 오므로 해당 칸에 표시한다. (매핑 없는 필드는 토스트)
    if (r.errors && Object.keys(r.errors).length) {
      const map = { username: 'err-username', nickname: 'err-nickname' };
      Object.entries(r.errors).forEach(([field, msg]) => {
        const el = map[field] ? $(map[field]) : null;
        if (el) el.textContent = humanizeError(msg);
        else toast(humanizeError(msg), 'error');
      });
      return;
    }
    // 409는 아이디 중복, 400은 길이 제한·금지된 아이디 → 아이디 필드에 표시한다.
    if (r.status === 409 || (r.status === 400 && r.message.includes('아이디'))) {
      return ($('err-username').textContent = r.message);
    }
    return toast(r.message, 'error');
  }
  toast('저장되었습니다.', 'success');
};

load();
