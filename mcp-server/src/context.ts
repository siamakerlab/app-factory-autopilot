// 도구 핸들러 공유 컨텍스트 — 서버 기동 시 1회 구성.
// projectRoot는 서버 실행 인자로 고정한다 (세션 중 변경 금지 — AFA-010 지침).

import { StateStore } from "./store.js";
import { TransitionTable } from "./transitions.js";
import { loadLicensePolicy, type LicensePolicy } from "./license-policy.js";

export interface Ctx {
  store: StateStore;
  transitions: TransitionTable;
  licensePolicy: LicensePolicy;
  coreDir: string;
  projectRoot: string;
}

export function createContext(projectRoot: string, coreDir: string): Ctx {
  return {
    store: new StateStore(projectRoot),
    transitions: TransitionTable.loadFromCoreDir(coreDir),
    licensePolicy: loadLicensePolicy(coreDir),
    coreDir,
    projectRoot,
  };
}
