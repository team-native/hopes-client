// API 주소.
// 배포(같은 도메인에서 /api를 백엔드로 프록시)에서는 상대경로를 써서
// CORS와 mixed content 문제를 아예 없앤다.
// 로컬 개발(localhost)에서는 백엔드 서버를 직접 호출한다. (서버 CORS에 localhost:3000 허용됨)
const DEV_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const isDev = DEV_HOSTS.includes(location.hostname);

export const API_BASE = isDev ? 'http://ssh.gsmsv.site:25105/api' : '/api';
