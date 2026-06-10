const { saveJson } = require("../utils/file");
const { initEnvironment, loadFilteredMerchants } = require("../utils/environment");
const { runAllChecks, STATUS_PASS, STATUS_FAIL, STATUS_REVIEW } = require("../core/workflow");
const { generateSuggestions } = require("../core/suggestion");
const { fillRemarks } = require("../core/remark");
const { statusIcon, statusText, pad } = require("./check");

function runFix(options) {
  const { config, reportDir, activityId, logger } = initEnvironment(options);
  const { filtered } = loadFilteredMerchants(options.data, activityId);
  const rules = config.rules || {};

  logger.info("开始修正流程", { activity_id: activityId });
  const pipeline = runAllChecks(filtered, rules, logger);
  const suggestions = generateSuggestions(pipeline.results);
  logger.info(`生成 ${suggestions.length} 条修改建议`);

  const { merchants: updatedMerchants, filledCount } = fillRemarks(filtered, pipeline.results);
  logger.info(`补全备注: ${filledCount} 个商家`);

  const fixedData = {
    activity: { ...(config.activity || {}), id: activityId },
    timestamp: new Date().toISOString(),
    audit_statistics: {
      total: filtered.length,
      pass: pipeline.shopStatuses.filter((s) => s.status === STATUS_PASS).length,
      fail: pipeline.shopStatuses.filter((s) => s.status === STATUS_FAIL).length,
      review: pipeline.shopStatuses.filter((s) => s.status === STATUS_REVIEW).length,
    },
    suggestions,
    remark_filled: filledCount,
    merchants: updatedMerchants,
  };

  const suggestionsPath = `${reportDir}/suggestions.json`;
  saveJson(suggestionsPath, suggestions);
  logger.info(`修改建议已保存: ${suggestionsPath}`);

  if (options.saveData) {
    const dataPath = `${reportDir}/merchants-fixed.json`;
    saveJson(dataPath, updatedMerchants);
    logger.info(`修正后商家数据已保存: ${dataPath}`);
  }

  printFixSummary(fixedData);
  return fixedData;
}

function printFixSummary(data) {
  const s = data.audit_statistics;
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                  修正结果摘要                             ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  建议:${pad(data.suggestions.length, 4)}条  备注:${pad(data.remark_filled, 3)}家  通过:${pad(s.pass,3)}  未通:${pad(s.fail,3)}  复核:${pad(s.review,3)}    ║`);
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const byShop = new Map();
  for (const sug of data.suggestions) {
    if (!byShop.has(sug.shop_id)) byShop.set(sug.shop_id, { name: sug.shop_name, items: [] });
    byShop.get(sug.shop_id).items.push(sug);
  }

  for (const [shopId, info] of byShop) {
    console.log(`🔧 [${shopId}] ${info.name}`);
    for (const item of info.items) {
      const tag = item.auto_fixable ? "🤖" : "👤";
      console.log(`  ${tag} [${item.code}] ${item.suggestion}`);
    }
    console.log("");
  }

  const remarkShops = data.merchants.filter((m) => m.remark && /[❌⚠]/.test(m.remark));
  if (remarkShops.length > 0) {
    console.log("📝 备注补全结果:");
    for (const m of remarkShops) {
      console.log(`  [${m.shop_id}] ${m.shop_name} → ${m.remark}`);
    }
    console.log("");
  }
}

module.exports = { runFix };
