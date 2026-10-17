import { execSync } from "node:child_process";

export interface ProcessResourceSnapshot {
  pid: number;
  maxRssKb: number;
  maxRssMb: number;
  currentRssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
  userCpuMs: number;
  systemCpuMs: number;
  totalCpuMs: number;
  minorPageFaults: number;
  majorPageFaults: number;
  voluntaryContextSwitches: number;
  involuntaryContextSwitches: number;
  osProcessSnapshot?: string;
}

/**
 * Returns a comprehensive snapshot of resource usage for the current process ID.
 */
export function getProcessResourceUsage(): ProcessResourceSnapshot {
  const pid = process.pid;
  const mem = process.memoryUsage();
  let rusage: NodeJS.ResourceUsage | undefined;

  try {
    rusage = process.resourceUsage();
  } catch {
    // Fallback if process.resourceUsage is not supported
  }

  // On macOS and Linux, maxRSS from getrusage is normalized to KB in Node.js
  const maxRssKb = rusage?.maxRSS ?? Math.round(mem.rss / 1024);
  const maxRssMb = Number((maxRssKb / 1024).toFixed(2));
  const currentRssMb = Number((mem.rss / (1024 * 1024)).toFixed(2));
  const heapUsedMb = Number((mem.heapUsed / (1024 * 1024)).toFixed(2));
  const heapTotalMb = Number((mem.heapTotal / (1024 * 1024)).toFixed(2));
  const externalMb = Number((mem.external / (1024 * 1024)).toFixed(2));

  const userCpuMs = Number(((rusage?.userCPUTime ?? 0) / 1000).toFixed(2));
  const systemCpuMs = Number(((rusage?.systemCPUTime ?? 0) / 1000).toFixed(2));
  const totalCpuMs = Number((userCpuMs + systemCpuMs).toFixed(2));

  let osProcessSnapshot: string | undefined;
  try {
    const rawPs = execSync(`ps -p ${pid} -o pid,%cpu,%mem,rss,vsz`, {
      encoding: "utf8",
      timeout: 1000,
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    osProcessSnapshot = rawPs;
  } catch {
    // Ignore ps error if not permitted
  }

  return {
    pid,
    maxRssKb,
    maxRssMb,
    currentRssMb,
    heapUsedMb,
    heapTotalMb,
    externalMb,
    userCpuMs,
    systemCpuMs,
    totalCpuMs,
    minorPageFaults: rusage?.minorPageFault ?? 0,
    majorPageFaults: rusage?.majorPageFault ?? 0,
    voluntaryContextSwitches: rusage?.voluntaryContextSwitches ?? 0,
    involuntaryContextSwitches: rusage?.involuntaryContextSwitches ?? 0,
    osProcessSnapshot,
  };
}

/**
 * Logs a message prefixed with [PID: <pid>].
 */
export function logWithPid(message: string): void {
  console.log(`[PID: ${process.pid}] ${message}`);
}

/**
 * Formats a message with [PID: <pid>].
 */
export function formatWithPid(message: string): string {
  return `[PID: ${process.pid}] ${message}`;
}

/**
 * Prints a banner header with the command name, PID, and environment details.
 */
export function printProcessHeader(commandTitle: string): void {
  const pid = process.pid;
  console.log(`[PID: ${pid}] ================================================================================`);
  console.log(`[PID: ${pid}]    ${commandTitle.toUpperCase()}`);
  console.log(`[PID: ${pid}]    Node.js: ${process.version} | OS: ${process.platform} (${process.arch})`);
  console.log(`[PID: ${pid}] ================================================================================\n`);
}

/**
 * Prints a formatted Peak Resource Usage summary for the process ID at the end of execution.
 */
export function printPeakResourceUsage(contextLabel = "FINAL EXECUTION SUMMARY"): void {
  const snapshot = getProcessResourceUsage();
  const pid = snapshot.pid;

  console.log(`\n[PID: ${pid}] ================================================================================`);
  console.log(`[PID: ${pid}]    PEAK RESOURCE USAGE [PID: ${pid}] — ${contextLabel.toUpperCase()}`);
  console.log(`[PID: ${pid}] ================================================================================`);
  console.log(`[PID: ${pid}]   • Process ID (PID):              ${pid}`);
  console.log(`[PID: ${pid}]   • Peak Resident Memory (maxRSS): ${snapshot.maxRssMb} MB (${snapshot.maxRssKb.toLocaleString()} KB)`);
  console.log(`[PID: ${pid}]   • Final Resident Memory (RSS):   ${snapshot.currentRssMb} MB`);
  console.log(`[PID: ${pid}]   • V8 Heap Used / Total:          ${snapshot.heapUsedMb} MB / ${snapshot.heapTotalMb} MB`);
  console.log(`[PID: ${pid}]   • External Memory Buffer:        ${snapshot.externalMb} MB`);
  console.log(`[PID: ${pid}]   • Total CPU Time (Kernel+User):  ${snapshot.totalCpuMs.toLocaleString()} ms (User: ${snapshot.userCpuMs.toLocaleString()} ms, System: ${snapshot.systemCpuMs.toLocaleString()} ms)`);
  console.log(`[PID: ${pid}]   • Page Faults (Minor / Major):   ${snapshot.minorPageFaults.toLocaleString()} / ${snapshot.majorPageFaults.toLocaleString()}`);
  console.log(`[PID: ${pid}]   • Context Switches (Vol / Invol):${snapshot.voluntaryContextSwitches.toLocaleString()} / ${snapshot.involuntaryContextSwitches.toLocaleString()}`);

  if (snapshot.osProcessSnapshot) {
    console.log(`[PID: ${pid}]   • OS Process Snapshot:`);
    const lines = snapshot.osProcessSnapshot.split("\n");
    for (const line of lines) {
      console.log(`[PID: ${pid}]       ${line}`);
    }
  }
  console.log(`[PID: ${pid}] ================================================================================\n`);
}

