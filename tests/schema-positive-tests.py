#!/usr/bin/env python3
"""스키마 양성 케이스 테스트 — 예시 인스턴스가 실제로 허용되는지 확인한다."""
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_DIR = ROOT / "core" / "schemas"


def load(name):
    return json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8"))


def example(name):
    return json.loads((SCHEMA_DIR / "examples" / name).read_text(encoding="utf-8"))


def validate(schema_name, example_name):
    schema = load(schema_name)
    instance = example(example_name)
    errors = sorted(Draft202012Validator(schema).iter_errors(instance), key=lambda e: list(e.path))
    if errors:
        print(f"[문제] {example_name}가 {schema_name}을 통과하지 못함")
        for error in errors:
            path = ".".join(str(p) for p in error.path) or "(root)"
            print(f"- {path}: {error.message}")
        return 1
    print(f"[통과 OK] {example_name}")
    return 0


def main() -> int:
    failures = 0
    failures += validate("app-factory-config.schema.json", "app-factory-config.example.json")
    failures += validate("finding.schema.json", "finding.example.json")
    failures += validate("roadmap-item.schema.json", "roadmap-item.example.json")
    failures += validate("task.schema.json", "task.example.json")
    failures += validate("run.schema.json", "run.example.json")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
