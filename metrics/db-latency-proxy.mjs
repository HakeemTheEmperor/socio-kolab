// TCP proxy that delays every chunk in each direction, to emulate a remote database.
// Usage: node metrics/db-latency-proxy.mjs <listenPort> <targetPort> <oneWayDelayMs>
// A delay of 40 ms each way = 80 ms round trip per query (a pooler in another region).
import net from "node:net";
const [listen, target, delay] = process.argv.slice(2).map(Number);
net.createServer((c) => {
  const up = net.connect(target, "127.0.0.1");
  const pipe = (from, to) => from.on("data", (d) => setTimeout(() => to.writable && to.write(d), delay)).on("end", () => setTimeout(() => to.end(), delay)).on("error", () => to.destroy());
  pipe(c, up); pipe(up, c);
}).listen(listen, () => console.log(`db latency proxy :${listen} -> :${target}, +${delay} ms each way`));
