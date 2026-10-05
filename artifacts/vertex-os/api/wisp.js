import { createServer } from "node:http";
import { handleWispUpgrade } from "../wisp-server.mjs";

const server = createServer((_request, response) => {
  response.writeHead(426, { "content-type": "text/plain; charset=utf-8" });
  response.end("This endpoint requires a WebSocket connection.");
});

server.on("upgrade", handleWispUpgrade);

export default server;
