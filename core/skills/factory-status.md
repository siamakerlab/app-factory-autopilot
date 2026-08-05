---
name: factory-status
description: 현재 상태 요약 — 진행 보고 4요소와 미결 항목 표시 (읽기 전용)
kind: entry
---

# factory status

읽기 전용으로 현재 상태를 표시합니다. 상태를 변경하지 않습니다.

## 절차

1. `factory_get_status` + `factory_progress_report` 호출.
2. 3.15와 동일한 4요소 형식으로 출력:
   진행 상황 / 앞으로의 목표 / 다음 턴 예정 / 전체 진행도 %.
3. 추가 표시: 로드맵 상태 분포, open finding(blocker 강조), 승인 대기
   목록, 릴리스 차단 Placeholder, 최근 run의 종료 사유.
4. `.app-factory`가 없으면 "factory plan(신규) 또는 factory init(기존
   프로젝트)부터 시작하십시오"를 안내한다.
