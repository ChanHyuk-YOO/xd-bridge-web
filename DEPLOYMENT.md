# 운영 배포 기록

## Netlify 이전 준비 (아직 전환 전)

- 사용자가 상업용 운영이 가능한 Netlify Free로 이전 요청. 현재 Vercel 주소는 새 사이트 검증 전까지 유지.
- `netlify.toml`: Node 22, `npm run build`, `dist`, 기존 보안 헤더 유지.
- `netlify/functions/notify.mjs`: 기존 수신자 고정·동의·크기 제한·오류 정보 최소화 규칙을 재사용하며 `/api/notify` 제공. 클라이언트 IP는 Netlify context.ip만 신뢰.
- 새 프로젝트 환경변수에 SITE_URL(새 운영 주소), RESEND_API_KEY, ALERT_EMAIL, NOTIFICATIONS_ENABLED 설정 필요. 키·수신 주소는 저장소/클라이언트에 넣지 않음. GOOGLE_SITE_VERIFICATION은 새 주소의 소유권 확인 때 적용.
- Netlify의 URL 환경변수로 canonical·사이트맵 생성 가능. 운영 SITE_URL을 명시하는 것을 권장.
- 계정 약관 동의와 GitHub 앱 저장소 권한 확인, 새 사이트 실제 배포 및 이메일 전달, Google 새 속성/사이트맵, 기존 URL 리디렉션은 아직 완료되지 않음.
- Free 사용량 한도 내 운영. 유료 플랜, 도메인 구매, 자동 충전은 활성화하지 않음.

- 공개 주소: https://xd-bridge-web.vercel.app
- Vercel 프로젝트: https://vercel.com/chanhyuks-projects-f6d049fa/xd-bridge-web
- 플랜: 개인 계정 Hobby. 유료 플랜/체험판/도메인 구매 없음.
- 최초 배포: Vercel 웹 화면의 Drop to Deploy로 소스 ZIP 업로드.
- 현재 배포: https://github.com/ChanHyuk-YOO/xd-bridge-web 의 codex/web-deployment 브랜치를 Vercel 운영 환경에 연결. 해당 저장소 한 개만 GitHub 배포 앱 접근 허용. 변경 push 시 자동 배포.
- 검색 준비: 공개 canonical, robots.txt, sitemap.xml 응답 확인.
- 인증 설정: Production 환경변수 GOOGLE_SITE_VERIFICATION. 인증 메타태그를 유지하기 위해 삭제하지 말 것.
- Google Search Console: HTML 태그로 소유권 인증 완료. sitemap.xml 제출 성공, 발견된 페이지 1개 확인.
- Google URL 검사에서 'URL이 Google에 등록되어 있음' 및 '페이지 색인이 생성됨' 확인. `site:xd-bridge-web.vercel.app` Google 검색 결과에도 표시됨. 일반 검색어 상위 노출은 확인되지 않았으며 순위 보장은 없음.
- 최신 URL 재수집 요청은 Google 일일 할당량 초과로 접수되지 않았고 reCAPTCHA 연결 안내도 표시됨. 같은 날 반복 요청하지 않음.
- 로컬 XD 원본, 변환 결과, QA 자료, node_modules는 배포하지 않음.
- 샘플 XD 미리보기와 .figcraft 다운로드 확인. XD 파일은 전송하지 않음. 새 문의 및 선택적 오류 알림만 `/api/notify`로 POST.
- 문의·오류 알림: 서버 전용 RESEND_API_KEY, ALERT_EMAIL, NOTIFICATIONS_ENABLED, SITE_URL 을 Production 비밀값으로 설정. 수신 주소/키는 공개 저장소와 브라우저에 넣지 않음.
- 공개 사이트에서 테스트 문의와 합성 XD 분석 오류를 발생시켜 Resend의 두 이메일 모두 Delivered 확인. 오류 요청 본문은 type, code, browser 세 필드뿐이며 파일명·파일 바이트 없음.
- 언어: 브라우저 선호 언어에 따라 ko/en/ja/zh 선택, 지원 언어가 없으면 영어. 수동 선택 가능. 디자인과 파일명은 번역하지 않음.
- 검색 설명 개선: 제목·H1·설명을 실제 변환 용도에 맞추고 SVG/FigCraft 형식 선택 및 텍스트 보정 안내 추가. WebSite/WebApplication 구조화 데이터와 공개 README의 사이트 링크 제공. 자동 번역만으로 별도 언어 URL이나 hreflang이 생기는 것은 아님.

현재는 연결된 브랜치로 push하면 운영 배포가 갱신됩니다. 환경변수만 변경했다면 Vercel의 Redeploy가 필요합니다. Resend 무료 Transactional 한도는 일 100통/월 3,000통이며 유료 구독과 초과 과금을 활성화하지 않았습니다. 신규 발신 도메인 구매 없이 계정 소유자 본인에게 전달하는 시험 발신 주소를 사용합니다.
