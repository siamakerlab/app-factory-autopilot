// .app-factory 상태 저장소 접근 계층 — core/schemas/state-store.md 규약 구현.
// 이 모듈만이 파일시스템을 만진다. 도구 핸들러는 이 계층을 통해서만 상태를 변경한다.

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  Approval,
  Counters,
  EvidenceMeta,
  Finding,
  Placeholder,
  RoadmapItem,
  Run,
  Task,
} from "./types.js";
import { ToolError } from "./errors.js";

const LOCK_STALE_MS = 10 * 60 * 1000;
const LOCK_WAIT_INTERVAL_MS = 250;
const LOCK_WAIT_MAX_MS = 30 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

export class StateStore {
  readonly root: string;

  constructor(projectRoot: string) {
    this.root = path.join(projectRoot, ".app-factory");
  }

  // ── 초기화 ────────────────────────────────────────────────────────────

  initialize(): void {
    const dirs = [
      "config",
      "config/interview",
      "state",
      "state/placeholders",
      "task-queue",
      "findings",
      "approvals",
      "budgets",
      "cycles",
      "runs",
      "evidence",
      "reports",
    ];
    for (const d of dirs) fs.mkdirSync(path.join(this.root, d), { recursive: true });
    const counterPath = this.counterPath();
    if (!fs.existsSync(counterPath)) {
      const counters: Counters = {
        version: 1,
        task: 0,
        finding: 0,
        evidence: 0,
        approval: 0,
        run_date: "",
        run_seq: 0,
      };
      this.writeJsonAtomic(counterPath, counters);
    }
    const roadmapPath = this.roadmapPath();
    if (!fs.existsSync(roadmapPath)) {
      this.writeJsonAtomic(roadmapPath, { version: 1, items: [] });
    }
  }

  exists(): boolean {
    return fs.existsSync(this.root);
  }

  // ── 원자적 쓰기 ───────────────────────────────────────────────────────

  writeJsonAtomic(filePath: string, data: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp-${process.pid}`;
    const fd = fs.openSync(tmp, "w");
    try {
      fs.writeFileSync(fd, JSON.stringify(data, null, 2) + "\n", "utf-8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, filePath);
  }

  readJson<T>(filePath: string): T {
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, "utf-8");
    } catch {
      throw new ToolError("NOT_FOUND", `파일이 없습니다: ${filePath}`);
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new ToolError("STORE_CORRUPTED", `JSON 파싱 실패: ${filePath}`);
    }
  }

  // ── 잠금 (state-store.md 4절) ─────────────────────────────────────────

  private lockPath(): string {
    return path.join(this.root, "state", ".lock");
  }

  async acquireLock(owner: string): Promise<void> {
    const deadline = Date.now() + LOCK_WAIT_MAX_MS;
    for (;;) {
      try {
        const fd = fs.openSync(this.lockPath(), "wx"); // O_CREAT|O_EXCL
        fs.writeFileSync(
          fd,
          JSON.stringify({ pid: process.pid, owner, acquired_at: nowIso() }),
          "utf-8",
        );
        fs.closeSync(fd);
        return;
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        if (this.tryRecoverStaleLock()) continue;
        if (Date.now() > deadline) {
          throw new ToolError("LOCK_TIMEOUT", "상태 저장소 잠금 획득 시간 초과", true);
        }
        await new Promise((r) => setTimeout(r, LOCK_WAIT_INTERVAL_MS));
      }
    }
  }

  releaseLock(): void {
    try {
      fs.unlinkSync(this.lockPath());
    } catch {
      /* 이미 해제됨 */
    }
  }

  /** stale lock이면 회수하고 true. PID 생존 시 회수하지 않는다. */
  tryRecoverStaleLock(): boolean {
    let info: { pid: number; acquired_at: string };
    try {
      info = JSON.parse(fs.readFileSync(this.lockPath(), "utf-8"));
    } catch {
      return false; // 방금 해제되었거나 손상 — 손상 시 대기 후 타임아웃 경로
    }
    const age = Date.now() - Date.parse(info.acquired_at);
    if (age < LOCK_STALE_MS) return false;
    if (this.pidAlive(info.pid)) return false;
    try {
      fs.unlinkSync(this.lockPath());
      return true;
    } catch {
      return false;
    }
  }

  private pidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /** 잠금 하에서 fn 실행 (모든 쓰기 도구가 사용) */
  async withLock<T>(owner: string, fn: () => T | Promise<T>): Promise<T> {
    await this.acquireLock(owner);
    try {
      return await fn();
    } finally {
      this.releaseLock();
    }
  }

  // ── ID 채번 (state-store.md 3절) ─────────────────────────────────────

  private counterPath(): string {
    return path.join(this.root, "task-queue", "counter.json");
  }

  private bumpCounter(kind: "task" | "finding" | "evidence" | "approval"): number {
    const counters = this.readJson<Counters>(this.counterPath());
    counters[kind] += 1;
    this.writeJsonAtomic(this.counterPath(), counters);
    return counters[kind];
  }

  nextTaskId(): string {
    return `T-${pad(this.bumpCounter("task"), 4)}`;
  }
  nextFindingId(): string {
    return `F-${pad(this.bumpCounter("finding"), 4)}`;
  }
  nextEvidenceId(): string {
    return `E-${pad(this.bumpCounter("evidence"), 4)}`;
  }
  nextApprovalId(): string {
    return `A-${pad(this.bumpCounter("approval"), 4)}`;
  }

  nextRunId(dateStr?: string): string {
    const today =
      dateStr ??
      new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const counters = this.readJson<Counters>(this.counterPath());
    if (counters.run_date !== today) {
      counters.run_date = today;
      counters.run_seq = 0;
    }
    counters.run_seq += 1;
    this.writeJsonAtomic(this.counterPath(), counters);
    return `R-${today}-${pad(counters.run_seq, 3)}`;
  }

  // ── 엔티티 CRUD ──────────────────────────────────────────────────────

  private roadmapPath(): string {
    return path.join(this.root, "state", "roadmap.json");
  }

  loadRoadmap(): { version: 1; items: RoadmapItem[] } {
    return this.readJson(this.roadmapPath());
  }

  saveRoadmap(doc: { version: 1; items: RoadmapItem[] }): void {
    this.writeJsonAtomic(this.roadmapPath(), doc);
  }

  taskPath(id: string): string {
    return path.join(this.root, "task-queue", `${id}.json`);
  }

  loadTask(id: string): Task {
    return this.readJson<Task>(this.taskPath(id));
  }

  saveTask(task: Task): void {
    task.updated_at = nowIso();
    this.writeJsonAtomic(this.taskPath(task.id), task);
  }

  listTasks(): Task[] {
    const dir = path.join(this.root, "task-queue");
    return fs
      .readdirSync(dir)
      .filter((f) => /^T-\d+\.json$/.test(f))
      .map((f) => this.readJson<Task>(path.join(dir, f)))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  findingPath(id: string): string {
    return path.join(this.root, "findings", `${id}.json`);
  }

  loadFinding(id: string): Finding {
    return this.readJson<Finding>(this.findingPath(id));
  }

  saveFinding(finding: Finding): void {
    finding.updated_at = nowIso();
    this.writeJsonAtomic(this.findingPath(finding.id), finding);
  }

  listFindings(): Finding[] {
    const dir = path.join(this.root, "findings");
    return fs
      .readdirSync(dir)
      .filter((f) => /^F-\d+\.json$/.test(f))
      .map((f) => this.readJson<Finding>(path.join(dir, f)))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  runPath(id: string): string {
    return path.join(this.root, "runs", `${id}.json`);
  }

  loadRun(id: string): Run {
    return this.readJson<Run>(this.runPath(id));
  }

  saveRun(run: Run): void {
    this.writeJsonAtomic(this.runPath(run.id), run);
  }

  listRuns(): Run[] {
    const dir = path.join(this.root, "runs");
    return fs
      .readdirSync(dir)
      .filter((f) => /^R-\d{8}-\d+\.json$/.test(f))
      .map((f) => this.readJson<Run>(path.join(dir, f)))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  latestRun(): Run | undefined {
    const runs = this.listRuns();
    return runs[runs.length - 1];
  }

  placeholderPath(name: string): string {
    // ${PLACEHOLDER_X} → PLACEHOLDER_X.json
    const safe = name.replace(/^\$\{/, "").replace(/\}$/, "");
    return path.join(this.root, "state", "placeholders", `${safe}.json`);
  }

  loadPlaceholder(name: string): Placeholder {
    return this.readJson<Placeholder>(this.placeholderPath(name));
  }

  savePlaceholder(ph: Placeholder): void {
    ph.updated_at = nowIso();
    this.writeJsonAtomic(this.placeholderPath(ph.name), ph);
  }

  listPlaceholders(): Placeholder[] {
    const dir = path.join(this.root, "state", "placeholders");
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => this.readJson<Placeholder>(path.join(dir, f)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  evidenceDir(id: string): string {
    return path.join(this.root, "evidence", id);
  }

  loadEvidence(id: string): EvidenceMeta {
    return this.readJson<EvidenceMeta>(path.join(this.evidenceDir(id), "meta.json"));
  }

  saveEvidence(meta: EvidenceMeta): void {
    this.writeJsonAtomic(path.join(this.evidenceDir(meta.id), "meta.json"), meta);
  }

  listEvidence(): EvidenceMeta[] {
    const dir = path.join(this.root, "evidence");
    return fs
      .readdirSync(dir)
      .filter((f) => /^E-\d+$/.test(f))
      .map((f) => this.loadEvidence(f))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  approvalPath(id: string): string {
    return path.join(this.root, "approvals", `${id}.json`);
  }

  loadApproval(id: string): Approval {
    return this.readJson<Approval>(this.approvalPath(id));
  }

  saveApproval(a: Approval): void {
    this.writeJsonAtomic(this.approvalPath(a.id), a);
  }

  listApprovals(): Approval[] {
    const dir = path.join(this.root, "approvals");
    return fs
      .readdirSync(dir)
      .filter((f) => /^A-\d+\.json$/.test(f))
      .map((f) => this.readJson<Approval>(path.join(dir, f)))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  configSnapshotPath(): string {
    return path.join(this.root, "config", "app-factory.snapshot.json");
  }

  loadConfigSnapshot<T = Record<string, unknown>>(): T {
    return this.readJson<T>(this.configSnapshotPath());
  }

  saveConfigSnapshot(config: unknown): void {
    this.writeJsonAtomic(this.configSnapshotPath(), config);
  }
}
