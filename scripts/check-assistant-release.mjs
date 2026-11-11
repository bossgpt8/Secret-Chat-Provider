// Automated source checks only. This cannot certify microphone/audio hardware.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("..", import.meta.url));
function run(command, args) { execFileSync(command, args, { cwd, stdio: "inherit" }); }
run("pnpm", ["run", "typecheck:libs"]);
for (const pkg of ["api-server", "mobile"]) run("pnpm", ["--filter", `@workspace/${pkg}`, "run", "typecheck"]);
const routerTests = ["test-chat-router.mjs", "test-live-api.mjs", "test-private-access.mjs", "test-memory-router.mjs"];
const tests = readdirSync(new URL(".", import.meta.url)).filter(name => /^test-.*\.mjs$/.test(name) && !routerTests.includes(name));
run(process.execPath, ["--test", ...tests.map(name => `scripts/${name}`)]);
const tsx = fileURLToPath(new URL("node_modules/.bin/tsx", import.meta.url));
if (!existsSync(tsx)) throw new Error("Install the full workspace dependencies before running router checks.");
run(tsx, ["--test", ...routerTests.map(name => `scripts/${name}`)]);
run("pnpm", ["--filter", "@workspace/api-server", "run", "build"]);
console.log("\nAutomated checks passed. NOT VERIFIED HERE: physical wake accuracy, native speech quality, Bluetooth/call interruptions or repeated APK launches. Complete deploy/oracle/QUALITY_UPGRADE.md before release.");
