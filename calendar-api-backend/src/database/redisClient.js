import { createClient } from "redis";

const redisClient = createClient({
  username: "default",
  password: "5l0FrKHPa6p3JsbD63vzE5JajPGLzXJw",
  socket: {
    host: "redis-14283.c261.us-east-1-4.ec2.redns.redis-cloud.com",
    port: 14283,
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
