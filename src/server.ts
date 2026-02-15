import { createApiHandler } from "./api/handlers";
import { config } from "./config";
import { createJobController, registerSchedules } from "./scheduler/jobs";

const jobController = createJobController();

Bun.serve({
  port: config.port,
  fetch: createApiHandler(jobController),
});

registerSchedules(jobController);

console.log(`Server running on port ${config.port}. Cron job scheduled.`);
