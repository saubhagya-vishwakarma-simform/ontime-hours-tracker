// Builds dist/ontime-hours-tracker-<version>.zip; manifest version always comes from package.json.
import { readFileSync, writeFileSync, cpSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/pkg", { recursive: true });
cpSync("src", "dist/pkg", { recursive: true });
const m = JSON.parse(readFileSync("src/manifest.json", "utf8"));
m.version = version;
writeFileSync("dist/pkg/manifest.json", JSON.stringify(m, null, 2));
const out = `ontime-hours-tracker-${version}.zip`;
execFileSync("zip", ["-r", `../${out}`, "."], { cwd: "dist/pkg", stdio: "inherit" });
console.log("built dist/" + out);
