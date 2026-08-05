#!/usr/bin/env python3
"""core/schemas의 모든 스키마와 예시 인스턴스를 검증한다.

- 각 *.schema.json이 JSON Schema draft 2020-12로 유효한지 확인
- examples/<이름>.example.json을 대응 스키마로 검증
- 하나라도 실패하면 종료 코드 1 (게이트에서 사용 가능)
"""
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator
from jsonschema.exceptions import SchemaError

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_DIR = ROOT / "core" / "schemas"
EXAMPLE_DIR = SCHEMA_DIR / "examples"


def main() -> int:
    failures = 0
    schemas = sorted(SCHEMA_DIR.glob("*.schema.json"))
    if not schemas:
        print("스키마 파일이 없습니다:", SCHEMA_DIR)
        return 1

    for schema_path in schemas:
        name = schema_path.name.replace(".schema.json", "")
        schema = json.loads(schema_path.read_text(encoding="utf-8"))

        try:
            Draft202012Validator.check_schema(schema)
            print(f"[스키마 OK] {schema_path.name}")
        except SchemaError as e:
            print(f"[스키마 오류] {schema_path.name}: {e.message}")
            failures += 1
            continue

        example_path = EXAMPLE_DIR / f"{name}.example.json"
        if not example_path.exists():
            print(f"[예시 없음] {example_path.name} — 예시 인스턴스가 필요합니다")
            failures += 1
            continue

        instance = json.loads(example_path.read_text(encoding="utf-8"))
        validator = Draft202012Validator(schema)
        errors = sorted(validator.iter_errors(instance), key=lambda e: list(e.path))
        if errors:
            for err in errors:
                path = "/".join(str(p) for p in err.path) or "(루트)"
                print(f"[검증 실패] {example_path.name} @ {path}: {err.message}")
            failures += 1
        else:
            print(f"[예시 OK] {example_path.name}")

    if failures:
        print(f"\n실패 {failures}건")
        return 1
    print("\n전체 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
