import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const PUBLIC_SCHEMA = "@zkortam/wingman-schema";
const PUBLIC_SDK = "@zkortam/wingman-sdk";
const restorations = [];

const readPackage = (file) => JSON.parse(readFileSync(file, "utf8"));

const writePackage = (file, pkg) => {
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
};

const remember = (file) => {
  restorations.push([file, readFileSync(file)]);
};

const applyPublicManifest = (file, mutate) => {
  remember(file);
  const pkg = readPackage(file);
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
};

const rewriteSchemaImports = (directory) => {
  for (const file of readdirSync(directory)) {
    if (!/\.(?:js|d\.ts|map)$/.test(file)) continue;
    const path = join(directory, file);
    const original = readFileSync(path, "utf8");
    const next = original.replaceAll("@wingman/schema", PUBLIC_SCHEMA);
    if (next === original) continue;
    remember(path);
    writeFileSync(path, next);
  }
};

applyPublicManifest("packages/schema/package.json", (pkg) => {
  pkg.name = PUBLIC_SCHEMA;
});

applyPublicManifest("packages/sdk/package.json", (pkg) => {
  pkg.name = PUBLIC_SDK;
  const current = pkg.dependencies["@wingman/schema"];
  delete pkg.dependencies["@wingman/schema"];
  pkg.dependencies[PUBLIC_SCHEMA] = String(current).startsWith("workspace:")
    ? pkg.version
    : current;
});
rewriteSchemaImports("packages/sdk/dist");

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
  for (const [file, contents] of restorations) writeFileSync(file, contents);
}
