const { loadConfig, loadMerchants, saveJson, ensureDir } = require("../utils/file");
const { checkQualification } = require("../core/qualification");
const { checkProductCount } = require("../core/product");
const { checkPrice } = require("../core/price");
const { checkImage } = require("../core/image");
const { findDuplicates } = require("../core/duplicate");
const { markRisk } = require("../core/risk");
const Logger = require("../utils/logger");

function runCheck(options) {
  const config = loadConfig(options.config);
  const merchants = loadMerchants(options.data);
  const logger = new Logger(config.output?.log_dir);
  const rules = config.rules || {};

  logger.info("开始商家资料检查", { total: merchants.length });

  const allResults = [];
  const checkFunctions = [
    { fn: checkQualification, name: "资质校验" },
    { fn: checkProductCount, name: "商品数量" },
    { fn: checkPrice, name: "价格区间" },
    { fn: checkImage, name: "图片检查" },
    { fn: markRisk, name: "风险标记" },
  ];

  for (const merchant of merchants) {
    for (const { fn, name } of checkFunctions) {
      const result = fn(merchant, rules);
      allResults.push(result);
      if (result.passed) {
        logger.success(`[${merchant.shop_name}] ${name} 通过`);
      } else {
        for (const issue of result.issues) {
          logger.warn(`[${merchant.shop_name}] ${name} - ${issue.message}`);
        }
      }
    }
  }

  const dupResult = findDuplicates(merchants, rules);
  for (const r of dupResult.results) {
    allResults.push(r);
    if (!r.passed) {
      for (const issue of r.issues) {
        logger.warn(`[${r.shop_name}] 重复报名 - ${issue.message}`);
      }
    }
  }
  for (const issue of dupResult.allIssues) {
    logger.error("重复报名检测", { message: issue.message });
  }

  const passed = allResults.filter((r) => r.passed).length;
  const failed = allResults.filter((r) => !r.passed).length;
  const total = allResults.length;

  logger.info("检查完成", { total, passed, failed });

  const summary = {
    activity: config.activity,
    timestamp: new Date().toISOString(),
    statistics: { total, passed, failed },
    results: allResults,
  };

  if (options.output) {
    ensureDir(config.output?.report_dir || "./reports");
    const outPath = options.output;
    saveJson(outPath, summary);
    logger.info(`检查结果已保存: ${outPath}`);
  }

  printCheckSummary(summary);

  return summary;
}

function printCheckSummary(summary) {
  const { statistics, results } = summary;
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║           商家资料检查结果摘要                   ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║  总检查项: ${pad(statistics.total, 4)}  通过: ${pad(statistics.passed, 4)}  未通过: ${pad(statistics.failed, 4)}  ║`);
  console.log("╚══════════════════════════════════════════════════╝\n");

  const grouped = new Map();
  for (const r of results) {
    if (!grouped.has(r.shop_id)) grouped.set(r.shop_id, { shop_name: r.shop_name, checks: [] });
    grouped.get(r.shop_id).checks.push(r);
  }

  for (const [shopId, data] of grouped) {
    const allPassed = data.checks.every((c) => c.passed);
    const icon = allPassed ? "✅" : "❌";
    console.log(`${icon} [${shopId}] ${data.shop_name}`);
    for (const c of data.checks) {
      const mark = c.passed ? "  ✅" : "  ❌";
      console.log(`${mark} ${c.check}`);
      for (const issue of c.issues || []) {
        const tag = issue.level === "error" ? "    ✖" : "    ⚠";
        console.log(`${tag} ${issue.message}`);
      }
    }
    console.log("");
  }
}

function pad(n, len) {
  return String(n).padStart(len, " ");
}

module.exports = { runCheck };
