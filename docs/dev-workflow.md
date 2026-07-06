# 개발 워크플로

`@alz/cesium-drawing` 은 사내용 모듈로 npm 레지스트리에 publish 하지 않는다. 대신 **빌드 후 `.tgz` 로 패킹**한 결과물을 소비처 (`xitecloud-fe`) 가 `file:` dep 으로 설치한다.

## 디렉토리 가정

```
D:\workspace\XiteCloud_Renewall\
├── cesium-drawing/                     ← 본 모노레포
│   └── packages/
│       ├── cesium-drawing/dist/        ← tsup 빌드 산출물
│       └── cesium-drawing-react/dist/
└── xitecloud-fe/
    └── vendor/                         ← .tgz 보관 (git 커밋 대상)
        ├── alz-cesium-drawing-0.0.0.tgz
        └── alz-cesium-drawing-react-0.0.0.tgz
```

## 모듈 메인테이너 워크플로

### 일회성 — 처음 셋업

```bash
cd cesium-drawing
pnpm install            # 의존성 (cesium 포함) 설치
```

### 코드 변경 후 → xitecloud-fe 에 반영

```bash
cd cesium-drawing
pnpm ship               # typecheck → build → pack(core) → pack(react)
                        # vendor/ 에 새 .tgz 가 생성됨
```

이후 xitecloud-fe 측에서:

```bash
cd xitecloud-fe
npm install --legacy-peer-deps    # 새 .tgz 를 node_modules 에 풀어 넣음
```

> `--legacy-peer-deps` 는 xitecloud-fe 의 기존 react 16 peer 충돌 (react-sticky-mouse-tooltip) 회피용. 우리 모듈과 무관.

### 빠른 반복 (dev iteration)

코드 한 줄 고치고 매번 `pnpm ship + npm install` 하는 게 답답하면 두 옵션:

1. **Watch 모드 + 수동 ship**

   ```bash
   # 터미널 A
   cd cesium-drawing
   pnpm -F @alz/cesium-drawing build:watch    # tsup --watch
   ```
   변경 감지되어 dist/ 가 자동 갱신. 그래도 .tgz 갱신은 수동:
   ```bash
   pnpm pack:core
   cd ../xitecloud-fe && npm install --legacy-peer-deps
   ```

2. **임시로 tsconfig paths 사용 (가장 빠름)**

   xitecloud-fe `tsconfig.json` 의 paths 에 일시적으로:
   ```json
   "@alz/cesium-drawing": ["../cesium-drawing/packages/cesium-drawing/src"]
   ```
   추가하면 vite 가 src 를 직접 읽어 HMR 동작. 작업 끝나면 paths 제거하고 정식 .tgz 로 회귀.

## 팀원 (소비처만 사용) 워크플로

본 모노레포를 클론할 필요 없음. xitecloud-fe 의 `vendor/*.tgz` 를 git pull 받고:

```bash
cd xitecloud-fe
npm install --legacy-peer-deps
```

새 버전이 vendor/ 에 들어오면 npm install 다시.

## CI

CI 도 동일 — `vendor/*.tgz` 가 repo 에 있으니 `npm ci` (또는 `npm install --legacy-peer-deps`) 만 실행.

## .tgz 호스팅 위치 — 선택지

`vendor/` 를 git 에 넣는 게 기본이지만 (수십 KB 라 부담 없음), 다음 대안 가능:

- **사내 파일 서버 (CIFS/SMB)** — `file://server/cesium-drawing/...` 절대 경로 사용 가능 (npm 지원).
- **GitHub Release Assets** — release tag 의 첨부 파일로 업로드 → URL 로 참조 (`https://...`). npm install 시 다운로드.
- **사내 npm 레지스트리 (Verdaccio 등)** — 정식 publish/install. 셋업 비용은 있지만 다수 프로젝트 공유 시 가장 깨끗함.

현재는 `vendor/` 커밋 방식이 단순하고 충분.

## 버전 관리

`packages/cesium-drawing/package.json` 의 `version` 을 올리면 `.tgz` 파일명도 바뀐다 (예: `alz-cesium-drawing-0.1.0.tgz`). xitecloud-fe `package.json` 에서 dep 경로도 같이 갱신해야 함.

```jsonc
// xitecloud-fe/package.json
{
  "dependencies": {
    "@alz/cesium-drawing": "file:./vendor/alz-cesium-drawing-0.1.0.tgz"  // ← 버전 갱신
  }
}
```

## 알려진 제약

- React peer 의 `*` 매처는 npm 의 strict 모드에서 경고 발생 가능. xitecloud-fe 는 `--legacy-peer-deps` 로 해결 중. 해소가 필요하면 peer 를 `>=18` 로 좁히기.
- `.tgz` 안의 dist/ 만 ship 됨 (package.json `files: ["dist", "README.md"]`). 소스맵은 포함됨 (디버그용).
