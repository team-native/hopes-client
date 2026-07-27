import { api, saveAuth, toast, getAccessToken } from './common.js';

const $ = (id) => document.getElementById(id);
const setErr = (id, msg) => { const e = $(id); if (e) e.textContent = msg || ''; };
const clearErrs = () => document.querySelectorAll('.error-msg').forEach((e) => (e.textContent = ''));

// Already logged in? skip
if (getAccessToken() && /login\.html|register\.html/.test(location.pathname)) {
  location.replace('/pages/chat.html');
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@gsm\.hs\.kr$/i;
const EMAIL_MSG = '학교 이메일 형식(예: s00000@gsm.hs.kr)만 사용 가능합니다.';
const PW_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,15}$/;

/* ============ REGISTER PAGE (POST /signup) ============ */
if ($('register-btn')) {
  let verifiedEmail = null;

  $('send-code-btn').onclick = async () => {
    clearErrs();
    const email = $('email').value.trim();
    if (!EMAIL_RE.test(email)) return setErr('err-email', EMAIL_MSG);
    const r = await api('/signup/email-verifications', { method: 'POST', body: { email } });
    if (!r.ok) return setErr('err-email', r.message);
    toast('인증번호를 이메일로 보냈어요.', 'success');
  };

  $('confirm-code-btn').onclick = async () => {
    setErr('err-code', '');
    const email = $('email').value.trim();
    const code = $('code').value.trim();
    if (!EMAIL_RE.test(email)) return setErr('err-email', EMAIL_MSG);
    if (!/^\d{6}$/.test(code)) return setErr('err-code', '인증번호 6자리를 입력해주세요.');
    const r = await api('/signup/email-verifications/confirm', { method: 'POST', body: { email, code } });
    if (!r.ok) return setErr('err-code', r.message);
    verifiedEmail = email;
    $('signup-fields').disabled = false;
    $('signup-fields').style.opacity = '1';
    $('register-btn').disabled = false;
    toast('이메일 인증이 완료되었습니다.', 'success');
  };

  $('register-btn').onclick = async () => {
    clearErrs();
    const email = $('email').value.trim();
    const code = $('code').value.trim();
    const username = $('username').value.trim();
    const password = $('password').value;
    const passwordConfirm = $('password2').value;
    let bad = false;
    if (email !== verifiedEmail) { setErr('err-email', '이메일 인증을 먼저 완료해주세요.'); bad = true; }
    if (!username) { setErr('err-username', '아이디를 입력해주세요.'); bad = true; }
    if (!PW_RE.test(password)) { setErr('err-password', '비밀번호는 영문과 숫자를 포함하여 8~15자여야 합니다.'); bad = true; }
    if (password !== passwordConfirm) { setErr('err-password2', '비밀번호가 일치하지 않습니다'); bad = true; }
    if (bad) return;

    const body = {
      email, username, password, passwordConfirm, verificationCode: code,
      gender: $('gender').value, major: $('major').value,
      cohort: $('cohort').value ? Number($('cohort').value) : null,
    };
    const r = await api('/signup', { method: 'POST', body });
    if (!r.ok) {
      if (r.message.includes('아이디') || r.message.includes('이미 가입')) return setErr('err-username', r.message);
      if (r.message.includes('비밀번호')) return setErr('err-password', r.message);
      return toast(r.message, 'error');
    }
    saveAuth(r.data.accessToken, true);
    toast('회원가입 완료!', 'success');
    location.href = '/pages/chat.html';
  };
}

/* ============ LOGIN PAGE (POST /login) ============ */
if ($('login-btn')) {
  $('login-btn').onclick = async () => {
    clearErrs();
    const username = $('username').value.trim();
    const password = $('password').value;
    const keep = $('keep').checked;
    if (!username) return setErr('err-username', '아이디를 입력해주세요.');
    const r = await api('/login', { method: 'POST', body: { username, password } });
    if (!r.ok) return setErr('err-password', r.message);
    saveAuth(r.data.accessToken, keep);
    location.href = '/pages/chat.html';
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('login-btn').click(); });
}
