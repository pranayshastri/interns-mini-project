// Explicit local launcher. Production uses start:prod and injected environment.
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { parseEnv } = require("node:util");
const { spawn } = require("node:child_process");

const serviceDir = resolve(__dirname, "..");
const env = { ...process.env };
const rootEnv = () => parseEnv(readFileSync(resolve(serviceDir, "../../.env"), "utf8"));

try {
  if (
    env.NODE_ENV === "production" ||
    (env.CI && !["false", "0"].includes(env.CI.toLowerCase()))
  ) {
    throw new Error("Use the normal dev/build/start:prod scripts in CI or production.");
  }

  if (!env.DATABASE_URL) {
    let local;
    try {
      local = parseEnv(readFileSync(resolve(serviceDir, "../../.env"), "utf8"));
    } catch {
      throw new Error("Cannot read root .env. Configure it or supply DATABASE_URL.");
    }

    const template = env.LOCAL_AUTH_DATABASE_URL ?? local.LOCAL_AUTH_DATABASE_URL;
    if (!template) {
      throw new Error("Set LOCAL_AUTH_DATABASE_URL in root .env or supply DATABASE_URL.");
    }

    // Expand only the selected URL's ${NAME} references, without shell execution.
    // Existing environment values take precedence. Never log credentials.
    env.DATABASE_URL = template.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
      const value = env[name] ?? local[name];
      if (value === undefined || value === "") {
        throw new Error(`Missing variable required by LOCAL_AUTH_DATABASE_URL: ${name}`);
      }
      return value;
    });
  }

  if (!env.JWT_SECRET) env.JWT_SECRET = rootEnv().JWT_SECRET;
  env.VALKEY_HOST ??= "127.0.0.1";
  env.VALKEY_PORT ??= "6379";
  // Do not import Docker hostnames, relative TLS paths, or other services' secrets.
  env.HOST ??= "127.0.0.1";
  const child = spawn(
    process.execPath,
    [require.resolve("@nestjs/cli/bin/nest.js"), "start", "--watch"],
    { cwd: serviceDir, env, stdio: "inherit" },
  );

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", () => {
    console.error("Could not start NestJS. Check Node 24+ and installed dependencies.");
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal === "SIGINT" ? 130 : 143);
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
