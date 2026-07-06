# 개발 워크플로

## 셋업

```bash
pnpm install    # 의존성 (cesium 포함) 설치
```

## 빌드 · 검사

```bash
pnpm build       # 전체 패키지 tsup 빌드 (dist/ 생성)
pnpm typecheck   # 전체 패키지 타입 체크
```

## 빠른 반복

한 패키지만 watch 빌드:

```bash
pnpm -F cesium-drawing build:watch    # tsup --watch, 변경 시 dist/ 자동 갱신
```

## 버전 관리

각 패키지의 `package.json` `version` 을 올린 뒤 빌드한다. 빌드 산출물은 `files` 필드(`dist`, `README.md`)만 포함된다.
