# 배포 절차

정적 파일만 있는 프론트다. 빌드 단계 없음. 서버에 파일 올리고 웹서버가 `/api`를 백엔드로 프록시하면 끝.

## 왜 같은 도메인에 올리나

- 백엔드 CORS 허용 origin이 `http://localhost:3000` 하나뿐 → 다른 도메인에 올리면 403
- 백엔드가 `http://` → 프론트를 https에 올리면 브라우저가 mixed content로 전부 차단

같은 도메인에서 `/api`를 백엔드로 프록시하면 둘 다 사라진다. 그래서 [js/config.js](js/config.js)는
localhost에서만 백엔드를 직접 부르고, 배포 환경에서는 상대경로 `/api`를 쓴다.

## 현재 서버 상태 (실측)

| 포트 | 정체 | 상태 |
|---|---|---|
| 80 | Caddy | `https://ssh.gsmsv.site/`로 308 리다이렉트 |
| 443 | Caddy | 포트는 열렸는데 **인증서 없음** — TLS 핸드셰이크 실패 |
| 25105 | nginx | 스프링으로 프록시. 정상 동작 |

Caddy에 `ssh.gsmsv.site` 사이트는 등록돼 있으나 ACME 인증서 발급이 실패한 상태다.
Caddy를 쓰면 인증서가 자동 발급되므로 https까지 같이 해결된다.

## 1) 파일 올리기

로컬(Windows Git Bash)에 rsync가 없으므로 tar를 ssh로 흘려보낸다.

```bash
cd "/c/Users/master/Documents/MYH hopes/front"
tar czf - --exclude=.git --exclude=server.js --exclude=DEPLOY.md . \
  | ssh <계정>@ssh.gsmsv.site "mkdir -p ~/hopes-front-upload && tar xzf - -C ~/hopes-front-upload"
```

서버에서 웹 루트로 옮긴다.

```bash
sudo mkdir -p /var/www/hopes-front
sudo cp -r ~/hopes-front-upload/. /var/www/hopes-front/
sudo chmod -R a+rX /var/www/hopes-front
```

git으로 관리하려면 서버에서 `git clone` 후 배포 때마다 `git pull`도 된다.

## 2) Caddy 설정 (권장)

`/etc/caddy/Caddyfile`:

```caddy
ssh.gsmsv.site {
	encode gzip

	# API는 스프링으로. <스프링포트>는 nginx가 25105에서 프록시하는 그 포트.
	handle /api/* {
		reverse_proxy 127.0.0.1:<스프링포트>
	}

	# 나머지는 정적 파일
	handle {
		root * /var/www/hopes-front
		try_files {path} {path}/ /index.html
		file_server
	}

	# HTML은 캐시 금지(배포 즉시 반영), 정적 자산은 짧게
	@html path *.html /
	header @html Cache-Control "no-cache"
	@asset path *.js *.css
	header @asset Cache-Control "public, max-age=300"
}
```

적용:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo journalctl -u caddy -n 50 --no-pager   # 인증서 발급 로그 확인
```

인증서가 계속 실패하면 80포트가 밖에서 열려 있는지(ACME HTTP-01 챌린지에 필요), DNS A레코드가
이 서버를 가리키는지 확인. Let's Encrypt 실패 횟수 제한에 걸렸으면 몇 시간 뒤 재시도된다.

## 3) nginx로 할 경우 (Caddy 대신)

`/etc/nginx/sites-available/hopes-front`:

```nginx
server {
    listen 8090;
    server_name ssh.gsmsv.site;
    root /var/www/hopes-front;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:<스프링포트>/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.html$ { add_header Cache-Control "no-cache"; }
    location ~* \.(js|css)$ { add_header Cache-Control "public, max-age=300"; }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/hopes-front /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

이 경우 https가 없으므로 브라우저 주소도 `http://`로 접속해야 한다. (같은 http끼리라 동작은 함)

## 4) 백엔드 CORS

같은 도메인에서 서비스하면 CORS 자체가 안 걸린다. 로컬 개발용 `http://localhost:3000`만 남겨두면 된다.
프론트를 다른 도메인에 올리는 경우에만 스프링의 `CORS_ALLOWED_ORIGINS`에 그 도메인을 추가한다.

## 5) 배포 후 확인

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://ssh.gsmsv.site/            # 200
curl -s -o /dev/null -w "%{http_code}\n" https://ssh.gsmsv.site/pages/login.html   # 200
curl -s -w "\n%{http_code}\n" https://ssh.gsmsv.site/api/main               # 401 {"message":"로그인이 필요합니다"}
```

브라우저에서:
- 로그인 → 채팅 화면 진입
- DevTools Network에서 요청 주소가 `https://ssh.gsmsv.site/api/...` 인지 (`:25105` 아님)
- Console에 mixed content 경고 없는지
