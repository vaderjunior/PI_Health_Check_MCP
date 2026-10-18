import os from "node:os";

function getPiStatus() {
  return {
    uptimeSeconds: os.uptime(),
    freeMemoryMiB: Math.round(os.freemem() / 1024 / 1024),
  };
}

console.log(getPiStatus());