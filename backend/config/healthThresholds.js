module.exports = Object.freeze({
  dbLatencyMs: { degraded: 250, down: 1000 },
  eventLoopLagMs: { degraded: 100, down: 500 },
  heapUsedPercent: { degraded: 80, down: 95 },
  poolWaiting: { degraded: 1, down: 10 },
  memoryRssMb: { degraded: 1024, down: 2048 }
});
