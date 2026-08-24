import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const PUBLIC_SCHEMA = "@zkortam/wingman-schema";
const PUBLIC_SDK = "@zkortam/wingman-sdk";

const readPackage = (file) => JSON.parse(readFileSync(file, "utf8"));

const writePackage = (file, pkg) => {
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
};

const applyPublicManifest = (file, mutate) => {
  const original = readFileSync(file, "utf8");
  const pkg = JSON.parse(original);
  mutate(pkg);
  const published = pkg.publishConfig ?? {};
  if (published.exports) pkg.exports = published.exports;
  if (published.main) pkg.main = published.main;
  if (published.types) pkg.types = published.types;
  pkg.exports = {
    ...(pkg.exports && typeof pkg.exports === "object" ? pkg.exports : {}),
    "./package.json": "./package.json",
  };
  pkg.publishConfig = { access: "public" };
  writePackage(file, pkg);
  return original;
};

const schemaOriginal = applyPublicManifest("packages/schema/package.json", (pkg) => {
  pkg.name = PUBLIC_SCHEMA;
});

const sdkOriginal = applyPublicManifest("packages/sdk/package.json", (pkg) => {
  pkg.name = PUBLIC_SDK;
  const current = pkg.dependencies["@wingman/schema"];
  delete pkg.dependencies["@wingman/schema"];
  pkg.dependencies[PUBLIC_SCHEMA] = String(current).startsWith("workspace:")
    ? pkg.version
    : current;
});

const args = ["publish", "--access", "public", "--ignore-scripts"];
if (process.env.GITHUB_ACTIONS) args.push("--provenance");

try {
  execFileSync("npm", args, {
    cwd: "packages/schema",
    stdio: "inherit",
    env: process.env,
  });
  execFileSync("npm", args, {
    cwd: "packages/sdk",
    stdio: "inherit",
    env: process.env,
  });
} finally {
  writeFileSync("packages/schema/package.json", schemaOriginal);
  writeFileSync("packages/sdk/package.json", sdkOriginal);
}
