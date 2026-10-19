# 운영 배포 기록

## 현재 운영: Netlify Free Legacy

- 공개 주소: https://xd-bridge-web.netlify.app/
- 프로젝트: https://app.netlify.com/projects/xd-bridge-web/overview
- 기존 AIVLE_SCHOOL 팀의 Free Legacy 플랜 사용. 카드 미등록, 무료 한도 화면은 대역폭 월 100GB / 빌드 300분. 신규 계정의 월 300크레딧 플랜으로 전환하지 않음.
- 사용자가 Netlify 약관 동의, GitHub 저장소 한 개 접근, Resend 발송 전용 키 생성·Netlify 비공개 저장 승인.
- `netlify.toml`: Node 22, `npm run build`, `dist`, 기존 보안 헤더 유지.
- `netlify/functions/notify.mjs`: 기존 수신자 고정·동의·크기 제한·오류 정보 최소화 규칙을 재사용하며 `/api/notify` 제공. 클라이언트 IP는 Netlify context.ip만 신뢰.
- SITE_URL, NOTIFICATIONS_ENABLED, GOOGLE_SITE_VERIFICATION 등록. RESEND_API_KEY와 ALERT_EMAIL은 Production에만 비밀값으로 저장. 로컬/프리뷰에는 발송 키를 제공하지 않음. 키·수신 주소는 저장소/클라이언트에 넣지 않음.
- Netlify의 URL 환경변수로 canonical·사이트맵 생성 가능. 운영 SITE_URL을 명시하는 것을 권장.
- codex/web-deployment 브랜치 자동 배포 확인(1aa100c 게시). 새 주소 HTTPS 200, canonical·구조화 데이터·Google 인증 태그 확인. 문의 UI 실제 전송과 합성 오류 API 전송 모두 Resend Delivered 확인. 기존 일별 오류 중복 방지 키는 운영 origin별로 분리해 이전 중 충돌 방지.
- Google 새 URL 접두어 속성의 HTML 파일 소유권 자동 인증 완료. 새 sitemap.xml 제출 성공. 새 주소의 색인/검색 순위는 아직 확인하지 않음. 기존 일일 요청 한도 초과를 우회하는 색인 요청은 하지 않음.
- vercel.json에 이전 주소의 모든 경로를 새 주소로 영구 리디렉션하도록 설정. 이전 Vercel 프로젝트는 주소 이동용으로 보관.
- Free 사용량 한도 내 운영. 유료 플랜, 도메인 구매, 자동 충전은 활성화하지 않음. 기존 개인 비상업용 문구는 무료 베타 안내로 정리. 광고·결제·추적 도구는 추가하지 않음.

## 이전 Vercel 운영 기록

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

아래 기록은 이전 Vercel 운영 당시의 검증입니다. 현재는 Netlify에서 연결된 브랜치로 push하면 운영 배포가 갱신됩니다. 환경변수만 변경했다면 Netlify에서 Deploy project를 실행합니다. Resend 무료 Transactional 한도는 일 100통/월 3,000통이며 유료 구독과 초과 과금을 활성화하지 않았습니다. 신규 발신 도메인 구매 없이 계정 소유자 본인에게 전달하는 시험 발신 주소를 사용합니다.
