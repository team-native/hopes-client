import { api, saveAuth, toast, getAccessToken, humanizeError } from './common.js';

const $ = (id) => document.getElementById(id);
const setErr = (id, msg) => { const e = $(id); if (e) e.textContent = msg || ''; };
const clearErrs = () => document.querySelectorAll('.error-msg').forEach((e) => (e.textContent = ''));

/* 서버 400 응답의 errors 맵({필드: 문구})을 해당 입력 칸 밑에 뿌린다.
   매핑에 없는 필드가 있으면 토스트로 보여주고, 하나라도 처리했으면 true. */
function showFieldErrors(r, map) {
  if (!r.errors) return false;
  let shown = false;
  Object.entries(r.errors).forEach(([field, msg]) => {
    const id = map[field];
    if (id) { setErr(id, humanizeError(msg)); shown = true; }
  });
  return shown;
}

// Already logged in? skip
if (getAccessToken() && /\/(login|register|forgot-password)(?:\.html)?$/.test(location.pathname)) {
  location.replace('/chat');
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@gsm\.hs\.kr$/i;
const EMAIL_MSG = '학교 이메일 형식(예: s00000@gsm.hs.kr)만 사용 가능합니다.';
const PW_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,15}$/;

/* ---- 인증번호 정책 (서버와 동일하게 맞춘 값) ----
   유효시간 10분 / 이메일당 분당 3회(4회째부터 429, 실측 확인).
   30초 쿨다운이면 어느 60초 구간에서도 3회를 넘지 않는다. */
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_S = 30;

const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// 전송 버튼에 쿨다운을 걸고 남은 시간을 라벨에 표시한다.
function startCooldown(btn, label) {
  let left = RESEND_COOLDOWN_S;
  btn.disabled = true;
  btn.textContent = `재전송 (${left})`;
  const t = setInterval(() => {
    left -= 1;
    if (left <= 0) { clearInterval(t); btn.disabled = false; btn.textContent = label; }
    else btn.textContent = `재전송 (${left})`;
  }, 1000);
}

// 인증번호 만료까지 남은 시간을 hintId 요소에 표시한다. 만료되면 onExpire 호출.
function startExpiry(hintId, onExpire) {
  const el = $(hintId);
  const until = Date.now() + CODE_TTL_MS;
  if (!el) return null;
  const tick = () => {
    const left = until - Date.now();
    if (left <= 0) {
      clearInterval(t);
      el.textContent = '인증번호가 만료되었습니다. 다시 요청해주세요.';
      el.classList.add('expired');
      onExpire?.();
      return;
    }
    el.textContent = `인증번호 유효시간 ${mmss(left)}`;
    el.classList.remove('expired');
  };
  const t = setInterval(tick, 1000);
  tick();
  return t;
}

/* ============ REGISTER PAGE (POST /signup) ============ */
if ($('register-btn')) {
  let verifiedEmail = null;
  let expiryTimer = null;

  // 인증 완료 상태를 되돌린다. (재전송·만료 시)
  const resetVerified = () => {
    verifiedEmail = null;
    $('signup-fields').disabled = true;
    $('signup-fields').style.opacity = '.5';
    $('register-btn').disabled = true;
  };

  $('send-code-btn').onclick = async () => {
    clearErrs();
    const email = $('email').value.trim();
    if (!EMAIL_RE.test(email)) return setErr('err-email', EMAIL_MSG);

    const btn = $('send-code-btn');
    btn.disabled = true;
    const r = await api('/signup/email-verifications', { method: 'POST', body: { email } });
    if (!r.ok) {
      btn.disabled = false;
      if (showFieldErrors(r, { email: 'err-email' })) return;
      return setErr('err-email', r.message);
    }

    // 재전송하면 서버가 이전 코드를 즉시 무효화하므로 인증 완료 상태도 함께 되돌린다.
    resetVerified();
    startCooldown(btn, '인증번호 전송');
    if (expiryTimer) clearInterval(expiryTimer);
    expiryTimer = startExpiry('code-hint', resetVerified);
    toast('인증번호를 이메일로 보냈어요. 10분 안에 입력해주세요.', 'success');
    $('code').focus();
  };

  $('confirm-code-btn').onclick = async () => {
    setErr('err-code', '');
    const email = $('email').value.trim();
    const code = $('code').value.trim();
    if (!EMAIL_RE.test(email)) return setErr('err-email', EMAIL_MSG);
    if (!/^\d{6}$/.test(code)) return setErr('err-code', '인증번호 6자리를 입력해주세요.');
    const r = await api('/signup/email-verifications/confirm', { method: 'POST', body: { email, code } });
    if (!r.ok) {
      if (showFieldErrors(r, { email: 'err-email', code: 'err-code' })) return;
      return setErr('err-code', r.message);
    }
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
    const cohortRaw = $('cohort').value.trim();
    const cohort = cohortRaw ? Number(cohortRaw) : null;

    let bad = false;
    if (email !== verifiedEmail) { setErr('err-email', '이메일 인증을 먼저 완료해주세요.'); bad = true; }
    if (!username) { setErr('err-username', '아이디를 입력해주세요.'); bad = true; }
    else if (username.length > 50) { setErr('err-username', '아이디는 50자까지 입력할 수 있습니다.'); bad = true; }
    if (!PW_RE.test(password)) { setErr('err-password', '비밀번호는 영문과 숫자를 포함하여 8~15자여야 합니다.'); bad = true; }
    if (password !== passwordConfirm) { setErr('err-password2', '비밀번호가 일치하지 않습니다'); bad = true; }
    // 기수는 선택 입력이지만 넣는다면 8·9·10기 중 하나여야 한다.
    if (cohort !== null && ![8, 9, 10].includes(cohort)) {
      setErr('err-cohort', '기수는 8·9·10기 중에서 선택해주세요.'); bad = true;
    }
    if (bad) return;

    // 선택 항목은 비워두면 아예 보내지 않는다.
    const body = { email, username, password, passwordConfirm, verificationCode: code };
    if ($('gender').value) body.gender = $('gender').value;
    if ($('major').value) body.major = $('major').value;
    if (cohort !== null) body.cohort = cohort;
    const r = await api('/signup', { method: 'POST', body });
    if (!r.ok) {
      // 400이면 필드별 errors 맵을 먼저 쓴다. (실측: {"errors":{"email":"학교 이메일만…"}})
      if (showFieldErrors(r, {
        email: 'err-email', username: 'err-username', password: 'err-password',
        passwordConfirm: 'err-password2', verificationCode: 'err-code', cohort: 'err-cohort',
      })) return;
      // 409는 이메일 또는 아이디 중복, 그 외 400은 단일 message만 온다.
      if (r.message.includes('이메일')) return setErr('err-email', r.message);
      if (r.message.includes('인증')) return setErr('err-code', r.message);
      if (r.status === 409 || r.message.includes('아이디')) return setErr('err-username', r.message);
      if (r.message.includes('비밀번호')) return setErr('err-password', r.message);
      return toast(r.message, 'error');
    }
    saveAuth(r.data.accessToken, true);
    toast('회원가입 완료!', 'success');
    location.href = '/chat';
  };
}

/* ============ FORGOT PASSWORD PAGE ============
   POST /password/request  { email }                     → 202 접수
   POST /password/reset    { email, code, newPassword }  → 200 성공          */
if ($('pw-reset-btn')) {
  let expiryTimer = null;

  $('pw-send-btn').onclick = async () => {
    clearErrs();
    const email = $('email').value.trim();
    if (!EMAIL_RE.test(email)) return setErr('err-email', EMAIL_MSG);

    const btn = $('pw-send-btn');
    btn.disabled = true;
    const r = await api('/password/request', { method: 'POST', body: { email } });
    if (!r.ok) {
      btn.disabled = false;
      if (showFieldErrors(r, { email: 'err-email' })) return;
      return setErr('err-email', r.message);
    }

    startCooldown(btn, '인증번호 전송');
    if (expiryTimer) clearInterval(expiryTimer);
    expiryTimer = startExpiry('code-hint');
    toast('인증번호를 이메일로 보냈어요. 10분 안에 입력해주세요.', 'success');
    $('code').focus();
  };

  $('pw-reset-btn').onclick = async () => {
    clearErrs();
    const email = $('email').value.trim();
    const code = $('code').value.trim();
    const newPassword = $('new-password').value;
    const confirm = $('new-password2').value;

    let bad = false;
    if (!EMAIL_RE.test(email)) { setErr('err-email', EMAIL_MSG); bad = true; }
    if (!/^\d{6}$/.test(code)) { setErr('err-code', '인증번호 6자리를 입력해주세요.'); bad = true; }
    if (!PW_RE.test(newPassword)) { setErr('err-password', '비밀번호는 영문과 숫자를 포함하여 8~15자여야 합니다.'); bad = true; }
    if (newPassword !== confirm) { setErr('err-password2', '비밀번호가 일치하지 않습니다'); bad = true; }
    if (bad) return;

    const btn = $('pw-reset-btn');
    btn.disabled = true;
    const r = await api('/password/reset', { method: 'POST', body: { email, code, newPassword } });
    btn.disabled = false;
    if (!r.ok) {
      if (showFieldErrors(r, { email: 'err-email', code: 'err-code', newPassword: 'err-password' })) return;
      // 404 계정 없음은 이메일 문제, 그 외 코드 오류·만료는 인증번호 필드에 표시한다.
      if (r.status === 404) return setErr('err-email', r.message);
      if (r.message.includes('비밀번호')) return setErr('err-password', r.message);
      return setErr('err-code', r.message);
    }
    // 서버가 기존 액세스 토큰을 모두 무효화하므로 저장된 토큰도 지운다.
    localStorage.removeItem('accessToken');
    sessionStorage.removeItem('accessToken');
    toast('비밀번호가 변경되었습니다. 다시 로그인해주세요.', 'success');
    setTimeout(() => location.replace('/login'), 1000);
  };
}

/* ============ LOGIN PAGE (POST /login) ============ */
if ($('login-btn')) {
  /* 서버는 로그인 실패를 상태 코드 + 단일 message로만 준다.
     계정 존재 여부는 노출하지 않는다(회원없음·비밀번호오류를 한 문구로 병합).
     단, 재시도 안내(429)·계정 정지(403)는 사용자가 조치해야 하므로 구분해서 보여준다. */
  const BAD_CREDENTIALS = '아이디 또는 비밀번호가 올바르지 않습니다.';
  const routeLoginError = (r) => {
    const m = r.message || '';
    // 네트워크 단절(status 0) → 자격증명 문제 아님, 토스트로만
    if (r.status === 0) return toast(m || '서버에 연결할 수 없습니다.', 'error');
    // 시도 횟수 초과 · 일시 잠금 → 비밀번호 칸(재시도 안내)
    if (r.status === 429 || /시도|초과|잠시 후|잠겼|잠금/.test(m)) {
      return setErr('err-password', m || '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');
    }
    // 정지 · 비활성 · 탈퇴된 계정 → 아이디 칸(관리자 문의 유도)
    if (r.status === 403 || /정지|비활성|탈퇴|사용할 수 없|차단/.test(m)) {
      return setErr('err-username', m || '사용할 수 없는 계정입니다. 관리자에게 문의해주세요.');
    }
    // 회원없음(401/404) · 비밀번호 불일치 → 구분 없이 비밀번호 칸에 병합 문구
    if (r.status === 401 || r.status === 404 || /비밀번호|암호|일치|회원|등록|찾을 수 없/.test(m)) {
      return setErr('err-password', BAD_CREDENTIALS);
    }
    // 그 외(5xx 등) → 비밀번호 칸 + 토스트
    setErr('err-password', m || BAD_CREDENTIALS);
    if (m) toast(m, 'error');
  };

  $('login-btn').onclick = async () => {
    clearErrs();
    const username = $('username').value.trim();
    const password = $('password').value;
    const keep = $('keep').checked;

    let bad = false;
    if (!username) {
      setErr('err-username', '아이디 또는 학교 이메일을 입력해주세요.'); bad = true;
    } else if (username.includes('@') && !EMAIL_RE.test(username)) {
      setErr('err-username', EMAIL_MSG); bad = true;
    }
    if (!password) { setErr('err-password', '비밀번호를 입력해주세요.'); bad = true; }
    if (bad) return;

    const r = await api('/login', { method: 'POST', body: { username, password } });
    if (!r.ok) {
      if (showFieldErrors(r, { username: 'err-username', password: 'err-password' })) return;
      return routeLoginError(r);
    }
    saveAuth(r.data.accessToken, keep);
    location.href = '/chat';
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('login-btn').click(); });
}
