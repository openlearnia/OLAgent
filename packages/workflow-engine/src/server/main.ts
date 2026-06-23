import { createWorkflowServer } from "./server.ts";

const { port, hostname } = createWorkflowServer({
  port: Number(process.env.PORT ?? 3100),
  hostname: process.env.HOST ?? "127.0.0.1",
});

console.log(`workflow-engine listening on http://${hostname}:${port}`);
