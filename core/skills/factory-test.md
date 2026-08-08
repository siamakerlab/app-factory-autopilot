---
name: factory-test
description: 에뮬레이터 기반 사용자 시나리오 전수검사 — 모든 기능·버튼·화면·출력의 스크린샷 리뷰
kind: entry
uses_agents: [completion-verifier, implementation-worker]
uses_skills: [capability-audit, completion-verify, final-gate]
---

# factory test

`factory review`와 다릅니다. `factory test`는 에뮬레이터 사용을 전제로 하며,
명령 실행 자체를 에뮬레이터 사용 승인으로 간주합니다.

## 목적

실제 사용자가 앱을 쓰는 관점에서 모든 기능 시나리오, 모든 버튼, 모든 주요
화면 상태, 모든 기능 출력이 예상대로 동작하는지 에뮬레이터 스크린샷과 실행
결과로 전수검사합니다.

## 절차

1. `capability-audit` 프리플라이트:
   - mobile-mcp가 설치되어 있으면 우선 사용한다.
   - mobile-mcp가 없으면 adb 기반 `scripts/emulator-smoke.sh`와 Android SDK
     도구를 폴백으로 사용한다.
   - 실행 환경 점검 결과를 사용자에게 표시한다. 실행 가능한 AVD/디바이스,
     adb, APK 경로, 패키지명이 부족하면 어떤 항목이 필요한지와 조치 방법을
     안내하고 test run을 blocked로 기록한다.
2. 에뮬레이터 사용 승인 기록:
   - `factory_test_prepare`를 호출해 `automation.emulator=true`,
     `automation.defer_emulator_prompt_until_final=false`를 저장한다.
3. 사용자 시나리오 작성:
   - 핵심 기능, 보조 기능, 설정, 온보딩, 빈 상태, 오류 상태, 권한 거부,
     데이터 저장/복원, 인앱리뷰, 인앱업데이트 등 앱에 존재하는 모든 사용 흐름을
     사용자 관점의 시나리오로 작성한다.
   - 명시 시나리오가 없으면 APP_FACTORY의 `core_features`,
     `supporting_features`, `optional_features`를 기준으로 기능별 시나리오를
     자동 생성한다. 기능 목록도 없으면 첫 실행, 핵심 작업, 상태 보존 기본
     시나리오를 생성한다.
   - 각 시나리오마다 단계, 눌러야 할 버튼, 관련 기능, 예상 화면, 예상 출력,
     실패 시 기대 동작을 체크리스트로 문서화한다.
4. 디바이스 매트릭스 전수:
   - 기본: phone portrait/landscape, foldable inner display, tablet 10-inch.
   - 필요하면 특정 크기, 해상도, 폰트 배율, 다크 모드, locale, 폴더블/태블릿
     프로필로 에뮬레이터 이미지를 바꿔 반복한다.
5. 실행·관찰:
   - 모든 시나리오 × 모든 디바이스 프로필 조합에 대해 앱을 실행한다.
   - 각 단계에서 스크린샷, logcat, 실제 출력, 버튼 반응을 기록한다.
   - `factory_test_record_result`로 통과/실패를 증거로 저장한다.
6. 실패 처리:
   - 실패는 즉시 finding으로 등록한다.
   - 자동 수정 가능한 항목은 P0 fix 작업으로 즉시 큐에 넣고 수정한다.
   - 수정 후 같은 시나리오와 관련 회귀 시나리오를 재실행한다.
   - 모든 실패가 해결될 때까지 완료로 보고하지 않는다.
7. 종료:
   - `factory_test_summary`로 계획 시나리오 수, 디바이스 프로필 수, 결과 수,
     실패 수, 미해결 finding 수를 보고한다.
   - 모든 조합이 통과하고 emulator gate가 통과해야 test 완료로 본다.

## 금지

- 스크린샷 또는 실행 증거 없이 “정상 동작”으로 판단하지 않는다.
- 한 디바이스에서만 통과했다고 폴더블/태블릿/가로모드 검증을 생략하지 않는다.
- 실패를 문서화만 하고 수정하지 않은 상태로 완료 보고하지 않는다.
