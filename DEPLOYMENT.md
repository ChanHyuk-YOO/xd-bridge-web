# 운영 배포 기록

- 공개 주소: https://xd-bridge-web.vercel.app
- Vercel 프로젝트: https://vercel.com/chanhyuks-projects-f6d049fa/xd-bridge-web
- 플랜: 개인 계정 Hobby. 유료 플랜/체험판/도메인 구매 없음.
- 배포 방식: Vercel 웹 화면의 Drop to Deploy로 소스 ZIP 업로드.
- 소스 백업: https://github.com/ChanHyuk-YOO/xd-bridge-web (codex/web-deployment 브랜치). Vercel Git 자동 배포는 연결하지 않은 상태.
- 검색 준비: 공개 canonical, robots.txt, sitemap.xml 응답 확인.
- 인증 설정: Production 환경변수 GOOGLE_SITE_VERIFICATION. 인증 메타태그를 유지하기 위해 삭제하지 말 것.
- Google Search Console: HTML 태그로 소유권 인증 완료. sitemap.xml 제출 성공, 발견된 페이지 1개 확인.
- 로컬 XD 원본, 변환 결과, QA 자료, node_modules는 배포하지 않음.
- 공개 주소에서 샘플 XD 미리보기와 .figcraft 다운로드를 확인. 업로드/POST 요청 없음.

수정 후에는 새 소스로 운영 배포를 갱신해야 합니다. 저장소에 push만 해서는 현재 웹사이트에 자동 반영되지 않습니다. 환경변수 변경은 Vercel의 Redeploy로 반영할 수 있습니다.
