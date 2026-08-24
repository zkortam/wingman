import { signConfig, userHash, type AgentConfig } from "../packages/schema/dist/index.js";

const orgId = process.env.WINGMAN_ORG_ID ?? "5e8e68e1-a768-4342-b4f4-d9a1f8ceaa26";
const agentId = process.env.WINGMAN_AGENT_ID ?? "4ee0d899-d63d-4bc2-b47a-25aa25c6078b";
const orgSalt = process.env.WINGMAN_ORG_SALT ?? "replace-with-org-salt";
const signingKey = process.env.WINGMAN_SIGNING_KEY ?? "replace-with-signing-key";
const operatorUserId = process.env.WINGMAN_OPERATOR_USER_ID ?? "operator";

const config: AgentConfig = {
  systemPrompt: "You are a careful operations assistant.",
  tools: {
    export_records: {
      description: "Export records using the caller's active filters.",
    },
  },
  retrieval: {},
  rules: [],
};

const signature = signConfig(signingKey, agentId, 1, config);
const sql = [
  "begin;",
  `insert into orgs (id, name, user_salt, signing_key) values (`,
  `  '${orgId}',`,
  `  'Example org',`,
  `  convert_to('${escape(orgSalt)}', 'UTF8'),`,
  `  convert_to('${escape(signingKey)}', 'UTF8')`,
  `);`,
  `insert into agents (id, org_id, name, base_config, base_version, writable_paths, max_diff_bytes) values (`,
  `  '${agentId}',`,
  `  '${orgId}',`,
  `  'ops-copilot',`,
  `  '${escape(JSON.stringify(config))}'::jsonb,`,
  `  1,`,
  `  array['rules','tools.*.description'],`,
  `  4096`,
  `);`,
  `insert into config_versions (agent_id, version, config, incident_id, signature, created_by) values (`,
  `  '${agentId}',`,
  `  1,`,
  `  '${escape(JSON.stringify(config))}'::jsonb,`,
  `  null,`,
  `  '${signature}',`,
  `  'BASE'`,
  `);`,
  "commit;",
].join("\n");

const env = [
  `WINGMAN_ORG_ID=${orgId}`,
  `WINGMAN_AGENT_ID=${agentId}`,
  `WINGMAN_ORG_SALT=${orgSalt}`,
  `WINGMAN_SIGNING_KEY=${signingKey}`,
  `WINGMAN_OPERATOR_USER_HASH=${userHash(orgSalt, operatorUserId)}`,
].join("\n");

process.stdout.write(`${sql}\n\n${env}\n`);

function escape(value: string): string {
  return value.replaceAll("'", "''");
}
