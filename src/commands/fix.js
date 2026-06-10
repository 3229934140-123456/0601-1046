const { loadConfig, loadMerchants, saveJson, ensureDir } = require("../utils/file");
const { runCheck } = require("./check");
const { generateSuggestions } = require("../core/suggestion");
const { fillRemarks } = require("../core/remark");
const Logger = require("../utils/logger");

function runFix(options) {
  const config = loadConfig(options.config);
  const merchants = loadMerchants(options.data);
  const logger = new Logger(config.output?.log_dir);

  logger.info("开始修正流程");

  const checkResult = runCheck({ ...options, output: null });
  const suggestions = generateSuggestions(checkResult.results);

  logger.info(`生成 ${suggestions.length} 条修改建议`);

  const { merchants: updatedMerchants, filledCount } = fillRemarks(merchants, checkResult.results);
  logger.info(`补全备注: ${filledCount} 个商家`);

  const fixedData = {
    activity: config.activity,
    timestamp: new Date().toISOString(),
    suggestions,
    remark_filled: filledCount,
    merchants: updatedMerchants,
  };

  const reportDir = config.output?.report_dir || "./reports";
  ensureDir(reportDir);

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
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║           修正结果摘要                           ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║  修改建议: ${pad(data.suggestions.length, 3)} 条  补全备注: ${pad(data.remark_filled, 3)} 个商家       ║`);
  console.log("╚══════════════════════════════════════════════════╝\n");

  const byShop = new Map();
  for (const s of data.suggestions) {
    if (!byShop.has(s.shop_id)) byShop.set(s.shop_id, { name: s.shop_name, items: [] });
    byShop.get(s.shop_id).items.push(s);
  }

  for (const [shopId, info] of byShop) {
    console.log(`🔧 [${shopId}] ${info.name}`);
    for (const item of info.items) {
      const tag = item.auto_fixable ? "🤖" : "👤";
      console.log(`  ${tag} [${item.code}] ${item.suggestion}`);
    }
    console.log("");
  }

  const remarkShops = data.merchants.filter((m) => m.remark && m.remark.includes("❌"));
  if (remarkShops.length > 0) {
    console.log("📝 备注补全结果:");
    for (const m of remarkShops) {
      console.log(`  [${m.shop_id}] ${m.shop_name} → ${m.remark}`);
    }
  }
}

function pad(n, len) {
  return String(n).padStart(len, " ");
}

module.exports = { runFix };
