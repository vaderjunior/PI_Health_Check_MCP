import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";

// execFile normally uses a callback. This version returns a Promise.
const runCommand = promisify(execFile);

async function readCpuSample(pid) {
  try {
    const text = await readFile(`/proc/${pid}/stat`, "utf8");
    // Remove PID and the parenthesized name before splitting the other fields.
    const fields = text.slice(text.lastIndexOf(")") + 2).trim().split(/\s+/);

    return {
      cpuTicks: Number(fields[11]) + Number(fields[12]),
      startedAt: fields[19],
      measuredAtMs: performance.now(),
    };
  } catch (error) {
    // Processes can exit, or their information may be inaccessible.
    // null means "no measurement"; it must not be treated as zero CPU.
    if (["ENOENT", "ESRCH", "EACCES", "EPERM"].includes(error.code)) {
      return null;
    }
    // Unexpected errors should remain visible rather than being hidden.
    throw error;
  }
}

export async function getCpuUsage(pids, sampleMs = 1000) {
  const command = await runCommand("getconf", ["CLK_TCK"], {
    encoding: "utf8",
    timeout: 5000,
  });
  const ticksPerSecond = Number(command.stdout);

  if (!Number.isFinite(ticksPerSecond) || ticksPerSecond <= 0) {
    throw new Error("Could not determine CPU accounting ticks per second.");
  }

  const before = new Map();

  // First pass: collect a starting measurement for every PID.
  for (const pid of pids) {
    before.set(pid, await readCpuSample(pid));
  }

  // Wait ONCE for the whole batch, not once per process.
  await delay(sampleMs);

  const usage = new Map();

  // Second pass: measure each PID again and calculate its interval CPU usage.
  for (const pid of pids) {
    const first = before.get(pid);
    const second = await readCpuSample(pid);

    if (first === null || second === null ||
        first.startedAt !== second.startedAt) {
      usage.set(pid, null);
      continue;
    }

    const cpuSeconds = (second.cpuTicks - first.cpuTicks) / ticksPerSecond;
    const elapsedSeconds = (second.measuredAtMs - first.measuredAtMs) / 1000;

    // A reset counter or invalid interval cannot produce a valid percentage.
    if (!Number.isFinite(cpuSeconds) || cpuSeconds < 0 ||
        !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
      usage.set(pid, null);
      continue;
    }

    // Keep full precision here. Round only after adding an app's processes.
    usage.set(pid, (cpuSeconds / elapsedSeconds) * 100);
  }

  return usage;
}
