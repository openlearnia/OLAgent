import { createWorkflowServer } from "./server.ts";

const instance = createWorkflowServer({
  port: Number(process.env.PORT ?? 3100),
  hostname: process.env.HOST ?? "127.0.0.1",
});

const { port, hostname } = instance;

console.log(`workflow-engine listening on http://${hostname}:${port}`);

process.on("SIGINT", () => {
  instance.stop();
  process.exit(0);
});
