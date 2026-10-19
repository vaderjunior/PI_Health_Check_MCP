import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { getCpuUsage } from "./cpu.mjs";

const runCommand = promisify(execFile);

export async function getAppUsage(
  otherThresholdMiB = 200,
  otherCpuThresholdPercent = 20
) {
  // Await the command without blocking Node while ps is running.
  const command = await runCommand(
    "ps",
    ["-ww", "-eo", "pid=,rss=,args="],
    { encoding: "utf8", timeout: 5000 }
  );
  // The Promise version of execFile returns stdout and stderr in an object.
  const output = command.stdout;

  const vscodeDirectory = homedir() + "/.vscode-server/";
  const groups = new Map();
  const pids = [];
  const lines = output.trim().split("\n");

  for (const line of lines) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 3) continue;

    const pid = Number(columns.shift());
    const memoryMiB = Number(columns.shift()) / 1024;
    const executable = columns.shift();
    const processName = executable.split("/").pop();

    pids.push(pid);
    let appName = processName + " (PID " + pid + ")";

    if (executable.startsWith(vscodeDirectory)) {
      appName = "VS Code";
    } else if (processName === "pihole-FTL") {
      appName = "Pi-hole";
    }

    if (!groups.has(appName)) {
      groups.set(appName, {
        app: appName,
        pids: [],
        memoryMiB: 0,
      });
    }

    const group = groups.get(appName);
    // Retain membership so we can add the CPU readings for this application.
    group.pids.push(pid);
    group.memoryMiB += memoryMiB;
  }

  // One CPU sampling operation covers ALL groups.
  const cpuByPid = await getCpuUsage(pids);
  const monitoredApps = ["VS Code", "Pi-hole"];
  const results = [];

  for (const group of groups.values()) {
    let knownCpuPercent = 0;
    let cpuComplete = true;

    for (const pid of group.pids) {
      const value = cpuByPid.get(pid);

      if (Number.isFinite(value)) {
        knownCpuPercent += value;
      } else {
        cpuComplete = false;
      }
    }

    const isMonitored = monitoredApps.includes(group.app);
    const highMemory = group.memoryMiB >= otherThresholdMiB;
    const highCpu = knownCpuPercent >= otherCpuThresholdPercent;

    if (isMonitored || highMemory || highCpu) {
      // A partial CPU sum must not be presented as the complete app total.
      // The known part can still trigger the configured CPU threshold.
      let cpuPercent = null;
      if (cpuComplete) {
        cpuPercent = Math.round(knownCpuPercent * 10) / 10;
      }

      results.push({
        app: group.app,
        processCount: group.pids.length,
        memoryMiB: group.memoryMiB,
        cpuPercent: cpuPercent,
      });
    }
  }

  // Sort unrounded RAM totals, then round the displayed values.
  results.sort((a, b) => b.memoryMiB - a.memoryMiB);
  for (const group of results) {
    group.memoryMiB = Math.round(group.memoryMiB * 10) / 10;
  }

  return results;
}
