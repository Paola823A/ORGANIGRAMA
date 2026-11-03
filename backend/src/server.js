import { createApp } from "./app.js";
import { openDatabase } from "./db/index.js";
import { config } from "./config/index.js";
const db = openDatabase(),
  server = createApp(db).listen(config.port, config.host, () =>
    console.log(`Organigrama: http://${config.host}:${config.port}`),
  );
function stop() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
