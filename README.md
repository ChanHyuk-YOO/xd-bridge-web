# XD Bridge Web

비상업용 무료 XD → SVG / 실험적 FigCraft 변환 도구. 모든 파일 처리는 브라우저의 Web Worker + 자체 호스팅 Pyodide에서 수행합니다. 변환 API, 데이터베이스, 업로드 저장소, 외부 추적 스크립트가 없습니다.

문의와 선택적 오류 알림은 별도 Vercel 함수와 Resend로 처리합니다. 디자인 파일은 보내지 않습니다. 설정과 제한은 [NOTIFICATIONS.md](NOTIFICATIONS.md)를 참고하세요. 서버 연결 전에는 문의 접수를 비활성화합니다.

화면 언어는 브라우저 선호 언어로 한국어·영어·일본어·중국어 중 자동 선택합니다. 지원 언어가 없으면 영어로 표시하며 상단에서 직접 선택할 수 있습니다. 선택은 이 기기의 브라우저에만 저장되고 디자인 텍스트·파일명은 번역하지 않습니다. 중국어 지역 설정은 현재 간체 번역으로 표시합니다.

## 로컬 실행

```
npm ci
npm run build
npm run dev
```

http://127.0.0.1:4173 에 접속합니다. Python 엔진과 Pyodide WASM을 처음 내려받는 데 시간이 걸립니다. 변환하는 동안 페이지가 멈추지 않도록 Web Worker에서 실행합니다. 파일 지우기/취소는 워커를 종료합니다.

## Vercel Hobby 배포

이 폴더만 배포하세요. 상위 작업 폴더, 로컬 개인 XD, QA 캡처, 기존 변환 결과는 포함하지 마세요.

- Framework Preset: Other
- Build Command: npm run build
- Output Directory: dist
- Install Command: npm ci
- 개인·비상업용 Hobby 프로젝트로 등록하고 유료 플랜을 선택하지 않습니다.
- `SITE_URL`은 최종 공개 주소로 지정합니다. 없으면 Vercel의 `VERCEL_PROJECT_PRODUCTION_URL`을 사용해 canonical/robots/sitemap을 만듭니다.
- Search Console 인증 코드가 생기면 `GOOGLE_SITE_VERIFICATION` 환경변수에 등록한 뒤 재배포합니다.
- 배포 후 HTTPS 주소, sitemap.xml, robots.txt와 공개 접근을 확인하고 Search Console에서 소유권 인증·사이트맵 제출·색인 요청을 진행합니다. 색인과 검색 순위는 보장되지 않습니다.

## 출력과 제한

- SVG: 기존 엔진의 글꼴 굵기, 정렬, 줄 구간 좌표 수정 반영.
- .figcraft: 서버/Windows CLI 없이 생성하는 실험적 네이티브 ZIP. 기본 도형, 벡터 네트워크, 텍스트, 내장 이미지 포함. 텍스트 메트릭·이미지 크롭을 근사하고, 선형 그라디언트는 첫 색으로 대체합니다. 호환성 문제 시 SVG를 사용하세요.
- 프로토타입, 연결된 컴포넌트/상태, 마스크, 일부 효과 미지원. 보고서 확인과 원본 비교 필요.
- 예제 개인 디자인은 코드나 배포에 포함되지 않습니다.

기존 데스크톱의 CLI 기반 네이티브 출력과 웹 직접 네이티브 출력은 별도 경로입니다. 동일한 충실도를 보장하지 않습니다.

## 라이선스

변환기 MIT. Pyodide MPL-2.0 및 CPython 등 각 구성요소 라이선스 준수. 런타임 수정 없이 배포합니다. Pyodide 소스: https://github.com/pyodide/pyodide/tree/0.29.5
