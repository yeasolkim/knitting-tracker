# R2 버킷 CORS 설정 (PDF 오프라인 캐시용)

## 왜 필요한가

도안 파일(이미지·PDF)은 Cloudflare R2 공개 버킷에서 `kis.marihoworld.com`과 다른 출처(origin)로 제공됩니다.
R2 버킷에 CORS 헤더가 없으면 브라우저는 교차 출처 응답을 **불투명(opaque) 응답**으로만 받을 수 있습니다.

- `<img>` 태그는 불투명 응답도 표시할 수 있어서 이미지는 지금도 서비스 워커(Workbox `CacheFirst`, `mode: 'no-cors'`)로 캐시하고 있습니다.
- 하지만 PDF는 `pdf.js`가 응답 본문을 **직접 읽어서** 파싱해야 합니다. 불투명 응답(status 0)은 본문을 읽을 수 없으므로, 캐시된 불투명 PDF를 다시 서빙하면 브라우저에서 `ERR_FAILED`가 납니다.
- 그래서 현재 `vite.config.ts`의 PDF 규칙은 `NetworkOnly`입니다 → **PDF 도안은 오프라인에서 열리지 않습니다.**

버킷에 아래 CORS 규칙을 넣으면 R2가 `Access-Control-Allow-Origin` 헤더를 돌려주므로, 서비스 워커가 PDF를 **읽을 수 있는(non-opaque) 응답**으로 받아 캐시할 수 있습니다.
적용 후에는 `vite.config.ts`의 PDF 규칙을 `NetworkOnly` → `CacheFirst`로 바꾸면 PDF도 이미지처럼 오프라인에서 열립니다.

## 넣어야 할 CORS JSON

```json
[
  {
    "AllowedOrigins": [
      "https://kis.marihoworld.com",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Type", "ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

- `AllowedOrigins`: 운영 도메인과 로컬 개발 서버(Vite 기본 포트 5173). 다른 미리보기 도메인을 쓰면 여기에 추가합니다.
- `AllowedMethods`: 읽기만 필요하므로 `GET`, `HEAD`면 충분합니다. (업로드는 presigned URL로 별도 처리)
- `AllowedHeaders`: `*` — pdf.js가 Range 요청 헤더를 보낼 수 있으므로 열어 둡니다.
- `MaxAgeSeconds`: 86400(24시간) 동안 preflight 결과를 브라우저가 캐시합니다.

## Cloudflare 대시보드에서 설정하는 위치

1. Cloudflare 대시보드 로그인 → 왼쪽 메뉴 **R2 Object Storage**
2. 도안 파일이 들어 있는 **버킷** 클릭
3. 상단 탭 **Settings(설정)**
4. **CORS Policy** 섹션 → **Add CORS policy** (이미 있으면 **Edit CORS policy**)
5. JSON 편집기에 위 JSON을 붙여 넣고 **Save**

Wrangler CLI를 쓰는 경우에는 위 JSON을 `cors.json`으로 저장한 뒤:

```bash
npx wrangler r2 bucket cors put <버킷이름> --file cors.json
```

## 적용 확인

```bash
curl -I -H "Origin: https://kis.marihoworld.com" "https://<R2 공개 도메인>/<아무 pdf 경로>"
```

응답 헤더에 `access-control-allow-origin: https://kis.marihoworld.com` 이 보이면 성공입니다.

## 적용 후 코드 변경 (후속 작업)

`vite.config.ts`의 PDF runtimeCaching 항목을 다음처럼 바꿉니다.

```ts
{
  urlPattern: ({ url }) => /\.pdf$/i.test(url.pathname),
  handler: 'CacheFirst',
  options: {
    cacheName: 'pattern-pdfs-v1',
    // no-cors 를 쓰지 않는다 — CORS 가 켜졌으므로 읽을 수 있는 응답이 온다.
    expiration: { maxEntries: 40, maxAgeSeconds: 30 * 24 * 60 * 60 },
    cacheableResponse: { statuses: [200] },
  },
},
```

주의: `fetchOptions: { mode: 'no-cors' }`를 PDF 규칙에 넣으면 다시 불투명 응답이 캐시되어 같은 문제가 재발합니다.
