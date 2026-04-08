const userAgent = process.env.npm_config_user_agent ?? "";

const isUnsupportedClient = userAgent.startsWith("yarn/") || userAgent.startsWith("pnpm/");

if (isUnsupportedClient) {
  const packageManager = userAgent.split(" ")[0];

  console.error("");
  console.error(`This repository is installed with npm, not ${packageManager}.`);
  console.error("The project is locked with package-lock.json and CI runs npm ci.");
  console.error("Using Yarn 1 can fail while linking Vitest/Vite dependencies.");
  console.error("");
  console.error("Use:");
  console.error("  npm install");
  console.error("");
  console.error("If a previous Yarn install left a partial node_modules tree behind, remove it first.");
  process.exit(1);
}
