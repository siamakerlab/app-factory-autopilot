// 명령 실행 래퍼 (AFA-050) — 타임아웃·출력 캡처·종료 코드 해석·오류 라인 추출.

import { spawn } from "node:child_process";

export interface ExecResult {
  exit_code: number | null;
  timed_out: boolean;
  duration_ms: number;
  tail: string;
  error_lines: string[];
}

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const TAIL_LINES = 200;
const ERROR_PATTERNS = [/error:/i, /FAILURE:/, /FAILED/, /Exception/];

export function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("/bin/sh", ["-c", command], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => chunks.push(d));

    child.on("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString("utf-8");
      const lines = output.split("\n");
      const tail = lines.slice(-TAIL_LINES).join("\n");
      const errorLines = lines.filter((l) => ERROR_PATTERNS.some((p) => p.test(l))).slice(0, 50);
      resolve({
        exit_code: code,
        timed_out: timedOut,
        duration_ms: Date.now() - started,
        tail,
        error_lines: errorLines,
      });
    });
  });
}
