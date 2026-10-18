import { execFileSync } from "node:child_process";

const output = execFileSync(
  "ps",
  ["-eo", "pid,comm,rss", "--sort=-rss"],
  { encoding: "utf8", timeout: 5000 }
);

const thresholdMiB = 150;
const lines = output.trim().split("\n").slice(1);
const bigProcesses = [];

for (const line of lines) {
  const columns = line.trim().split(/\s+/);
  const pid = Number(columns.shift());
  const memoryMiB = Number(columns.pop()) / 1024;
  const name = columns.join(" ");

  if (memoryMiB >= thresholdMiB) {
    bigProcesses.push({
      pid: pid,
      name: name,
      memoryMiB: memoryMiB,
    });
  }
}

console.table(bigProcesses);