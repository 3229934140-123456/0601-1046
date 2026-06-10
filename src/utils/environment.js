const path = require("path");
const { loadConfig, loadMerchants, ensureDir } = require("./file");
const Logger = require("./logger");

function resolveActivityConfig(options) {
  const config = loadConfig(options.config);

  if (options.activityId) {
    if (!config.activity) config.activity = {};
    config.activity.id = options.activityId;
    if (!config.activity.name) config.activity.name = options.activityId;
  }

  const activitySafe = (config.activity?.id || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  const rootDir = path.resolve(options.outputDir || "./");
  const reportDir = path.join(rootDir, config.output?.report_dir || "reports", activitySafe);
  const logDir = path.join(rootDir, config.output?.log_dir || "logs", activitySafe);

  ensureDir(reportDir);
  ensureDir(logDir);

  config.output = { ...(config.output || {}), report_dir: reportDir, log_dir: logDir };

  return {
    config,
    reportDir,
    logDir,
    activityId: config.activity?.id,
    activityName: config.activity?.name,
    activitySafe,
  };
}

function loadFilteredMerchants(dataPath, activityId) {
  const all = loadMerchants(dataPath);
  if (!activityId) return { merchants: all, filtered: all };
  const filtered = all.filter((m) => m.activity_id === activityId);
  return { merchants: all, filtered };
}

function initEnvironment(options) {
  const { config, reportDir, logDir, activityId, activityName, activitySafe } =
    resolveActivityConfig(options);
  const logger = new Logger(logDir);
  logger.info(`初始化环境`, {
    activity_id: activityId,
    activity_name: activityName,
    report_dir: reportDir,
    log_dir: logDir,
  });
  return { config, reportDir, logDir, activityId, activityName, activitySafe, logger };
}

module.exports = {
  resolveActivityConfig,
  loadFilteredMerchants,
  initEnvironment,
};
