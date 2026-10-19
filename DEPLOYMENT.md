# 운영 배포 기록

- 공개 주소: https://xd-bridge-web.vercel.app
- Vercel 프로젝트: https://vercel.com/chanhyuks-projects-f6d049fa/xd-bridge-web
- 플랜: 개인 계정 Hobby. 유료 플랜/체험판/도메인 구매 없음.
- 최초 배포: Vercel 웹 화면의 Drop to Deploy로 소스 ZIP 업로드.
- 현재 배포: https://github.com/ChanHyuk-YOO/xd-bridge-web 의 codex/web-deployment 브랜치를 Vercel 운영 환경에 연결. 해당 저장소 한 개만 GitHub 배포 앱 접근 허용. 변경 push 시 자동 배포.
- 검색 준비: 공개 canonical, robots.txt, sitemap.xml 응답 확인.
- 인증 설정: Production 환경변수 GOOGLE_SITE_VERIFICATION. 인증 메타태그를 유지하기 위해 삭제하지 말 것.
- Google Search Console: HTML 태그로 소유권 인증 완료. sitemap.xml 제출 성공, 발견된 페이지 1개 확인.
- 수동 URL 색인 요청: Google 보안 확인(reCAPTCHA) 연결 오류로 접수 완료를 확인하지 못함. 현재 검색 색인은 아직 생성되지 않은 상태. 사이트맵은 성공적으로 접수되어 수집 대기 가능.
- 로컬 XD 원본, 변환 결과, QA 자료, node_modules는 배포하지 않음.
- 샘플 XD 미리보기와 .figcraft 다운로드 확인. XD 파일은 전송하지 않음. 새 문의 및 선택적 오류 알림만 `/api/notify`로 POST.
- 문의·오류 알림: 서버 전용 RESEND_API_KEY, ALERT_EMAIL, NOTIFICATIONS_ENABLED, SITE_URL 을 Production 비밀값으로 설정. 수신 주소/키는 공개 저장소와 브라우저에 넣지 않음.
- 공개 사이트에서 테스트 문의와 합성 XD 분석 오류를 발생시켜 Resend의 두 이메일 모두 Delivered 확인. 오류 요청 본문은 type, code, browser 세 필드뿐이며 파일명·파일 바이트 없음.
- 언어: 브라우저 선호 언어에 따라 ko/en/ja/zh 선택, 지원 언어가 없으면 영어. 수동 선택 가능. 디자인과 파일명은 번역하지 않음.

현재는 연결된 브랜치로 push하면 운영 배포가 갱신됩니다. 환경변수만 변경했다면 Vercel의 Redeploy가 필요합니다. Resend 무료 Transactional 한도는 일 100통/월 3,000통이며 유료 구독과 초과 과금을 활성화하지 않았습니다. 신규 발신 도메인 구매 없이 계정 소유자 본인에게 전달하는 시험 발신 주소를 사용합니다.
