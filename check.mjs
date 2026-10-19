import { getPiStatus } from "./status.mjs";
import { getAppUsage } from "./processes.mjs";

console.log(getPiStatus());

// getAppUsage now returns a Promise because it waits for CPU measurements.
const applications = await getAppUsage();
console.table(applications);
