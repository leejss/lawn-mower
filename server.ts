import { createApiHandler } from "./src/api/handlers";
import { config } from "./src/config";
import { createJobController, registerSchedules } from "./src/scheduler/jobs";

const jobController = createJobController();

Bun.serve({
  port: config.port,
  fetch: createApiHandler(jobController),
});

registerSchedules(jobController);

console.log(`Server running on port ${config.port}. Cron job scheduled.`);
