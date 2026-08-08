#!/bin/sh
# 기본 에뮬레이터 실행 검증 (AFA-052 — MVP-1 범위: 설치·실행·크래시 확인)
# 사용: emulator-smoke.sh <APK 경로> <패키지명> [출력 디렉터리]
# 출력: <출력 디렉터리>/result.json + screenshot.png (+ logcat-fatal.txt)
#   result.json: { "status": "ok|crash|blocked", "detail": "..." }
# 디바이스가 없으면 status=blocked (skip 아님 — 게이트가 BLOCKED 처리).
# mobile-mcp가 설치된 환경에서는 그쪽을 우선 사용한다 (이 스크립트는 adb 폴백).

set -u
APK="${1:?APK 경로 필요}"
PKG="${2:?패키지명 필요}"
OUT="${3:-./.app-factory/evidence-tmp}"
mkdir -p "$OUT"

emit() {
  printf '{ "status": "%s", "detail": "%s" }\n' "$1" "$2" | tee "$OUT/result.json"
}

find_adb() {
  if command -v adb >/dev/null 2>&1; then
    command -v adb
    return 0
  fi
  for sdk in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Android/Sdk"; do
    [ -n "$sdk" ] || continue
    if [ -x "$sdk/platform-tools/adb" ]; then
      printf '%s\n' "$sdk/platform-tools/adb"
      return 0
    fi
  done
  return 1
}

ADB="$(find_adb)" || { emit blocked "adb 없음 — Android SDK platform-tools 필요"; exit 3; }

DEVICE=$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1; exit}')
[ -n "${DEVICE:-}" ] || { emit blocked "연결된 디바이스/에뮬레이터 없음"; exit 3; }

"$ADB" -s "$DEVICE" install -r "$APK" >/dev/null 2>&1 || { emit crash "APK 설치 실패"; exit 1; }
"$ADB" -s "$DEVICE" shell pm clear "$PKG" >/dev/null 2>&1   # 앱 데이터 초기화
"$ADB" -s "$DEVICE" logcat -c
"$ADB" -s "$DEVICE" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 \
  || { emit crash "앱 실행 실패"; exit 1; }

sleep 10   # 초기 크래시 관찰 구간

# 프로세스 생존 확인
if ! "$ADB" -s "$DEVICE" shell pidof "$PKG" >/dev/null 2>&1; then
  "$ADB" -s "$DEVICE" logcat -d -b crash > "$OUT/logcat-fatal.txt" 2>/dev/null
  emit crash "실행 10초 내 프로세스 종료 — logcat-fatal.txt 확인"
  exit 1
fi

# FATAL 로그 스캔
"$ADB" -s "$DEVICE" logcat -d | grep -E "FATAL EXCEPTION|ANR in $PKG" > "$OUT/logcat-fatal.txt" 2>/dev/null
if [ -s "$OUT/logcat-fatal.txt" ]; then
  emit crash "FATAL/ANR 로그 감지 — logcat-fatal.txt 확인"
  exit 1
fi

"$ADB" -s "$DEVICE" exec-out screencap -p > "$OUT/screenshot.png" 2>/dev/null
emit ok "설치·실행·10초 생존·FATAL 없음 (screenshot.png 저장)"
exit 0
