import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";

const PORT = 3000;

const bootstrapServer = async () => {
  const { httpServer } = await createApp();

  await connectDatabase();

  httpServer.listen(PORT, "127.0.0.1", () => {
    console.log(`Running server at ${PORT}`);
  });
};

bootstrapServer().catch((error) => {
  console.error("Failed to start the server:", error);
  process.exit(1);
});
