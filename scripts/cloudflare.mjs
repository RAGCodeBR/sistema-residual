import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };
if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_ACCOUNT_ID !== config.account_id) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID não corresponde à conta definitiva do Residual.");
}
env.CLOUDFLARE_ACCOUNT_ID = config.account_id;
const profile = path.join(os.homedir(), ".config", "residual-cloudflare");
const args = process.argv.slice(2);
if (args[0] === "login") mkdirSync(profile, { recursive: true, mode: 0o700 });
if (!env.CLOUDFLARE_API_TOKEN && !env.XDG_CONFIG_HOME && existsSync(profile)) {
  env.XDG_CONFIG_HOME = profile;
}
const cli = path.resolve("node_modules/wrangler/bin/wrangler.js");
const result = spawnSync(process.execPath, [cli, ...args], { env, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
