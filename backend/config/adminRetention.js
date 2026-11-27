function daysFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isInteger(value) && value >= 1 && value <= 3650 ? value : fallback;
}

module.exports = Object.freeze({
  metricsDays: daysFromEnv('ADMIN_METRICS_RETENTION_DAYS', 30),
  errorsDays: daysFromEnv('ADMIN_ERROR_RETENTION_DAYS', 14),
  auditDays: daysFromEnv('ADMIN_AUDIT_RETENTION_DAYS', 365)
});
