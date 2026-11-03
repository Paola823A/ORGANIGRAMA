import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["--watch", "backend/src/server.js"], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development" },
  }),
  spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--config",
      "frontend/vite.config.js",
      "frontend",
    ],
    { stdio: "inherit" },
  ),
];
function stop() {
  children.forEach((child) => child.kill());
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((child) =>
  child.on("exit", (code) => {
    if (code) {
      stop();
      process.exitCode = code;
    }
  }),
);
