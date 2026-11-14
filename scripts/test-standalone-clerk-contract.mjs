import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

const api = read("artifacts/api-server/src/app.ts");
assert.match(api, /CLERK_AUTH_MODE === "standalone"/);
assert.match(api, /standaloneClerk && \(!clerkSecretKey \|\| !clerkPublishableKey\)/);
assert.match(api, /if \(!standaloneClerk\)\s*\{\s*app\.use\(CLERK_PROXY_PATH/);
assert.match(api, /standaloneClerk\s*\?\s*clerkMiddleware\(\)/);
assert.match(api, /publishableKeyFromHost\(/);

for (const workflow of [
  ".github/workflows/build-android.yml",
  ".github/workflows/build-ios.yml",
]) {
  const source = read(workflow);
  assert.match(source, /EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: \$\{\{ vars\.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY \}\}/);
  assert.match(source, /Check standalone Clerk configuration/);
}

const mobile = read("artifacts/mobile/context/AccountContext.tsx");
assert.match(mobile, /process\.env\.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY/);
assert.match(mobile, /proxyUrl=\{process\.env\.EXPO_PUBLIC_CLERK_PROXY_URL \|\| undefined\}/);

console.log("Standalone Clerk configuration contract passed.");
