import { execSync } from "node:child_process";

// Freshness is emitted, not hand-maintained: revision and date derive
// from git at build time so they can never silently go stale.
function git(cmd, fallback) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return fallback;
  }
}

const commitDate = git("git log -1 --format=%cs", new Date().toISOString().slice(0, 10));
const [year, month] = commitDate.split("-");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default {
  rev: git("git rev-parse --short HEAD", "dev"),
  updated: `${MONTHS[Number(month) - 1]} ${year}`,
  updatedISO: commitDate,
  year,
};
