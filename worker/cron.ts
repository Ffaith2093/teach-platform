import { autoSubmitExpiredAttempts } from "@/lib/exams/auto-submit";
import { prisma } from "@/lib/prisma";

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const result = await autoSubmitExpiredAttempts();
    if (result.processed || result.errors) {
      console.log("[auto-submit]", result);
    }
  } catch (error) {
    console.error("[auto-submit] scan failed:", error);
  } finally {
    running = false;
  }
}

void tick();
const interval = setInterval(() => void tick(), 60_000);

async function shutdown() {
  clearInterval(interval);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
