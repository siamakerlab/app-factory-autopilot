# project-template

빈 폴더 초기화 시 대상 앱 프로젝트에 생성되는 파일 템플릿입니다.

- `docs/` — factory plan 산출물 17종 템플릿
- `android/` — Android 프로젝트 스캐폴드 (factory auto의 프로젝트 생성 단계)

## 변수 문법

`{{mustache}}` 단일 문법을 사용합니다. 값 출처는 APP_FACTORY.yaml
(인터뷰 결과 + defaults.yaml 병합)입니다.

- `{{project.name}}`, `{{project.package_name}}` 등 — 설정 경로 그대로
- `{{today}}` — 생성일 (YYYY-MM-DD)
- 미확정 값은 `${PLACEHOLDER_*}` 문자열이 그대로 들어간다 (렌더링 후에도
  Placeholder가 보이는 것이 정상 — placeholder-audit가 추적한다)

## 라이브러리 버전 정책

Android 스캐폴드의 라이브러리 버전은 템플릿에 박지 않는다.
`{{versions.*}}` 변수는 생성 시점에 Dependency Version Manager가 공식
문서에서 확인한 최신 안정화 버전으로 채운다 (템플릿 구식화 방지).
Gradle wrapper도 예외가 아니다. `{{versions.gradle}}`와
`{{versions.gradleDistributionSha256}}`는 `scripts/resolve-gradle-version.mjs`가
공식 Gradle current 메타데이터에서 확인한 안정 릴리스 값으로 채운다.
