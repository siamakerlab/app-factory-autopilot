---
name: capability-audit
description: 공정 프리플라이트 역량 점검 — required 부재 시 설치 제안 (진행은 차단하지 않음)
kind: process
---

# capability-audit (프리플라이트)

plan/init/auto 시작 시 자동 수행되는 경량 점검입니다. factory doctor의
전체 절차 중 점검·제안만 수행합니다.

1. 어댑터가 설치 목록을 탐지해 `capability_scan`에 전달한다.
2. 어댑터가 Android SDK, adb, emulator, Gradle/Wrapper, AVD/연결 디바이스,
   mobile-mcp 같은 실행 환경을 점검해 `capability_record_environment`에
   전달한다. 점검은 현재 사용자 환경 기준이며, 개발 당시 머신의 상태를
   완료 근거로 삼지 않는다.
3. missing_required가 있으면 설치 제안을 표시한다 (factory-doctor 3~6단계
   흐름으로 위임 가능). 사용자가 아무것도 선택하지 않아도 **공정은 계속
   진행한다** — 경고와 품질 영향(어떤 단계에서 어떤 역량이 아쉬운지)만
   기록한다.
4. 환경 부족분은 사용자 조치 안내로 표시하고, 해당 기능 실행 시점에만
   차단한다.
5. 거절 항목은 `capability_mark_declined` — 같은 세션 반복 제안 금지.
6. 결과는 `.app-factory/config/capabilities.yaml`에 기록되어 이후 공정에서
   Agent가 사용 가능 역량을 판단하는 근거가 된다.
