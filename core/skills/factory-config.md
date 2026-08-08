---
name: factory-config
description: 자동화 실행 옵션을 체크박스로 설정 — 기본은 에뮬레이터 제외 모두 활성
kind: entry
uses_skills: [capability-audit]
---

# factory config

`factory plan/init/auto` 전에 실행해 자동화 범위를 설정합니다. 플랫폼이 체크박스
UI를 지원하면 체크박스로 표시하고, 지원하지 않으면 동일 항목을 목록으로 보여 준
뒤 선택 값을 저장합니다.

## 기본값

- 기본적으로 모든 프로덕션 품질 검토 기능을 활성화한다.
- 예외: `automation.emulator=false`, `automation.ads=false`,
  `automation.billing=false`가 기본값이다. 광고와 인앱결제는 plan/config에서
  사용자가 명시적으로 켠 경우에만 탑재한다.
- `automation.defer_emulator_prompt_until_final=true`가 기본값이다. 에뮬레이터를
  사용하지 않는 경우 중간 공정에서는 묻지 않고, 코드로 구현 가능한 모든 기능을
  최대한 구현·검증한 뒤 마지막 보고에서 에뮬레이터 검증 사용을 권유한다.

## 체크박스 항목

| 설정 | 기본값 | 의미 |
|------|--------|------|
| `market_research` | true | 경쟁 앱·커뮤니티·사용자 리뷰 조사 |
| `modern_ui` | true | Material 3/Adaptive UI 현대화 |
| `ux_intuitiveness_review` | true | 주요 기능 UX 직관성 검토·수정 |
| `accessibility_review` | true | 접근성 검토·수정 |
| `in_app_review` | true | Google Play 인앱리뷰 기능 탑재 |
| `in_app_update` | true | Google Play 인앱업데이트 기능 탑재 |
| `ads` | false | 광고·동의 흐름 탑재 |
| `billing` | false | 인앱결제·구매 복원 탑재 |
| `store_readiness` | true | 스토어 등록 준비 점검 |
| `observability` | true | 크래시/분석 이벤트 등 관측성 탑재 |
| `performance_review` | true | 성능·메모리·시작 시간 검토 |
| `security_privacy_review` | true | 보안·개인정보 검토 |
| `license_review` | true | 라이선스·고지·SBOM 검토 |
| `emulator` | false | 에뮬레이터 실행 검증 |

## 적용 규칙

1. 선택 값은 APP_FACTORY 설정의 `automation.*`에 저장한다.
2. 관련 설정도 동기화한다:
   - `automation.in_app_review=false` → `in_app_review.enabled=false`
   - `automation.in_app_update=false` → `in_app_update.enabled=false`
   - `automation.ads=false` → `ads.enabled=false`
   - `automation.billing=false` → `billing.enabled=false`
   - `automation.market_research=false` → `market_research.enabled=false`
   - `automation.accessibility_review=false` → `ux_quality.accessibility_required=false`
3. 비활성화한 기능은 로드맵·review-scoring에서 `n_a`로 처리한다. 단 보안,
   라이선스, 개인정보처럼 출시 위험과 직접 연결되는 항목은 사용자가 끄더라도
   최소 정적 검사는 유지한다.
4. `automation.emulator=false`이면 `factory auto`는 에뮬레이터 게이트를
   중간 강제 중단 사유로 삼지 않는다. 마지막 완료 보고에서만 에뮬레이터 실행을
   권유하고, 에뮬레이터 미검증 상태를 release-readiness 경고로 남긴다.

## 출력

- 현재 설정 요약
- 변경된 항목 목록
- 비활성화로 인해 `n_a` 처리될 review 영역 목록
- 에뮬레이터 비활성 시 마지막 권유 메시지 예약 여부
