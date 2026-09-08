// 의존성 없는 정적 파일 서버. back2(Spring, 8080)의 CORS_ALLOWED_ORIGINS 기본값과
// 맞추기 위해 기본 포트를 3000으로 둔다: `node server.js`
import http from 'http';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

// Keep implementation files private from the address bar. These aliases also
// make direct navigation and refresh work on clean URLs during local development.
const ROUTES = {
  '/': 'index.html',
  '/chat': 'pages/chat.html',
  '/login': 'pages/login.html',
  '/register': 'pages/register.html',
  '/forgot-password': 'pages/forgot.html',
  '/mypage': 'pages/mypage.html',
  '/settings': 'pages/settings.html',
};
const LEGACY_ROUTES = {
  '/pages/chat.html': '/chat',
  '/pages/login.html': '/login',
  '/pages/register.html': '/register',
  '/pages/forgot.html': '/forgot-password',
  '/pages/mypage.html': '/mypage',
  '/pages/settings.html': '/settings',
};

http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const urlPath = decodeURIComponent(requestUrl.pathname);

  if (LEGACY_ROUTES[urlPath]) {
    const target = LEGACY_ROUTES[urlPath] + requestUrl.search;
    res.writeHead(301, { Location: target });
    return res.end();
  }

  const relativePath = ROUTES[urlPath] || urlPath.replace(/^\/+/, '');
  const filePath = path.resolve(__dirname, relativePath);
  const rootPath = path.resolve(__dirname);
  if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${path.sep}`)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}).listen(PORT, () => console.log(`[front] http://localhost:${PORT}`));
