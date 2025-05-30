import { createClient } from "redis";

const redisClient = createClient({
  username: "default",
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_PUBLIC_ENDPOINT,
    port: process.env.REDIS_PORT,
  },
});

redisClient.on("error", (err) => console.log("Redis Client Error", err));

process.on("SIGINT", async () => {
  await redisClient.quit();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await redisClient.quit();
  process.exit(0);
});

await redisClient.connect();

await redisClient.set("foo", "bar");
const result = await redisClient.get("foo");
if (result === "bar") {
  console.log("Redis connection and set/get test successful");
}

export default redisClient;
