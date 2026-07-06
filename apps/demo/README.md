# cesium-drawing demo

`cesium-drawing` / `cesium-drawing-react` 를 소비하는 데모. OpenStreetMap 타일 위에서
점·선·면 작도, 거리·면적 측정, 정점 편집을 마우스로 실행한다. Cesium Ion 토큰은 쓰지 않는다.

## 로컬 실행

레포 루트에서 의존성을 설치한 뒤:

```bash
pnpm install
pnpm --filter cesium-drawing-demo dev
```

## 빌드

```bash
pnpm --filter cesium-drawing-demo build   # apps/demo/dist 생성
```

정적 파일만 나오므로 서버 로직은 필요 없다.

## EC2 배포 (nginx)

빌드 산출물을 서버에 올리고 nginx 로 정적 서빙한다.

```bash
# 로컬에서 빌드 후 업로드
pnpm --filter cesium-drawing-demo build
rsync -avz --delete apps/demo/dist/ <user>@<ec2-host>:/var/www/cesium-drawing-demo/
```

서버:

```bash
sudo cp deploy/nginx.conf /etc/nginx/conf.d/cesium-drawing-demo.conf
sudo nginx -t && sudo systemctl reload nginx
```
