#!/usr/bin/env python3
"""스키마 부정 케이스 테스트 — 잘못된 인스턴스가 실제로 거부되는지 확인한다.

MVP-1 핵심 원칙의 스키마 수준 강제를 회귀 방지한다:
- VERIFIED에는 증거 필수 (ROADMAP.md 2장 5항)
- worker는 VERIFIED를 요청할 수 없다 (2장 1항)
- finding resolve에는 증거 필수 (ROADMAP AFA-013)
"""
import copy
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


FAILS = 0


def expect_invalid(schema, instance, label):
    global FAILS
    errors = list(Draft202012Validator(schema).iter_errors(instance))
    if errors:
        print(f"[거부 OK] {label}")
    else:
        print(f"[문제] {label} — 거부되어야 하는데 통과함")
        FAILS += 1


def main() -> int:
    item = example("roadmap-item.example.json")
    item_schema = load("roadmap-item.schema.json")

    bad = copy.deepcopy(item)
    bad["evidence_ids"] = []
    expect_invalid(item_schema, bad, "VERIFIED + 증거 없음")

    bad = copy.deepcopy(item)
    bad["status"] = "DONE"
    expect_invalid(item_schema, bad, "미정의 상태 DONE")

    task = example("task.example.json")
    task_schema = load("task.schema.json")

    bad = copy.deepcopy(task)
    bad["result"]["requested_status"] = "VERIFIED"
    expect_invalid(task_schema, bad, "worker의 requested_status=VERIFIED")

    bad = copy.deepcopy(task)
    bad["status"] = "claimed"
    del bad["claim"]
    expect_invalid(task_schema, bad, "claimed + claim 누락")

    finding = example("finding.example.json")
    finding_schema = load("finding.schema.json")

    bad = copy.deepcopy(finding)
    del bad["resolution"]
    expect_invalid(finding_schema, bad, "resolved + resolution 누락")

    bad = copy.deepcopy(finding)
    bad["resolution"]["evidence_ids"] = []
    expect_invalid(finding_schema, bad, "resolution 증거 0건")

    run = example("run.example.json")
    run_schema = load("run.schema.json")

    bad = copy.deepcopy(run)
    del bad["exit_reason"]
    expect_invalid(run_schema, bad, "finished + exit_reason 누락")

    if FAILS:
        print(f"\n실패 {FAILS}건")
        return 1
    print("\n전체 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
