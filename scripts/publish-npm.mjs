import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const PUBLIC_SCHEMA = "@zkortam/wingman-schema";
const PUBLIC_SDK = "@zkortam/wingman-sdk";

const remap = (file, mutate) => {
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  mutate(pkg);
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
};

remap("packages/schema/package.json", (pkg) => {
  pkg.name = PUBLIC_SCHEMA;
});

remap("packages/sdk/package.json", (pkg) => {
  pkg.name = PUBLIC_SDK;
  const current = pkg.dependencies["@wingman/schema"];
  delete pkg.dependencies["@wingman/schema"];
  pkg.dependencies[PUBLIC_SCHEMA] = String(current).startsWith("workspace:")
    ? pkg.version
    : current;
});

const npmPublish = (cwd) => {
  execFileSync(
    "npm",
    ["publish", "--access", "public", "--ignore-scripts", "--provenance"],
    { cwd, stdio: "inherit", env: process.env },
  );
};

npmPublish("packages/schema");
npmPublish("packages/sdk");
