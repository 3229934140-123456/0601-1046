const { initEnvironment, loadFilteredMerchants } = require("../utils/environment");
const { runAllChecks, STATUS_PASS, STATUS_FAIL, STATUS_REVIEW } = require("../core/workflow");
const { generateSuggestions } = require("../core/suggestion");
const { fillRemarks } = require("../core/remark");
const { statusIcon, statusText, pad } = require("./check");

function runPreview(options) {
  const { config, activityId, logger } = initEnvironment(options);
  const { filtered } = loadFilteredMerchants(options.data, activityId);
  const rules = config.rules || {};

  logger.info("开始预览（不写入文件）");
  const pipeline = runAllChecks(filtered, rules, null);
  const suggestions = generateSuggestions(pipeline.results);
  const { merchants: updatedMerchants, filledCount } = fillRemarks(filtered, pipeline.results);

  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║                   预览模式 - 不会写入文件                        ║");
  console.log("╠══════════════════════════════════════════════════════════════════╣");
  console.log(`║  活动: ${padEnd(config.activity?.name || "-", 40)}ID: ${padEnd(activityId || "-", 18)}║`);
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");

  const counts = { [STATUS_PASS]: 0, [STATUS_FAIL]: 0, [STATUS_REVIEW]: 0 };
  const sugByShop = new Map();
  for (const s of suggestions) {
    sugByShop.set(s.shop_id, (sugByShop.get(s.shop_id) || 0) + 1);
  }

  for (const shop of pipeline.shopStatuses) {
    counts[shop.status]++;
    const icon = statusIcon(shop.status);
    const sugCnt = sugByShop.get(shop.shop_id) || 0;

    console.log(`${icon} [${shop.shop_id}] ${shop.shop_name} (${shop.category}) — ${statusText(shop.status)}`);
    console.log(`   商品数: ${shop.product_count}  信用分: ${shop.credit_score}  建议数: ${sugCnt}条`);

    const issues = shop.issues || [];
    if (issues.length > 0) {
      for (const issue of issues.slice(0, 3)) {
        const t = issue.level === "error" ? "✖" : "⚠";
        console.log(`   ${t} [${issue.code}] ${issue.message}`);
      }
      if (issues.length > 3) {
        console.log(`   ... 还有 ${issues.length - 3} 条问题`);
      }
    }

    if (shop.collides_with && shop.collides_with.length > 0) {
      for (const c of shop.collides_with) {
        console.log(`   💥 撞上: [${c.collide_with.shop_id}] ${c.collide_with.shop_name} (${c.strategy}/${(c.score*100).toFixed(0)}%)`);
      }
    }

    const m = updatedMerchants.find((u) => u.shop_id === shop.shop_id);
    if (m && m.remark) {
      console.log(`   备注: ${m.remark}`);
    }
    console.log("");
  }

  const total = filtered.length;
  console.log("──────────────────────────────────────────────────────────────");
  console.log(`  审核汇总: ✅通过 ${counts[STATUS_PASS]}家  ❌未通 ${counts[STATUS_FAIL]}家  🔍复核 ${counts[STATUS_REVIEW]}家  / 共 ${total}家`);
  console.log(`  修改建议: ${suggestions.length}条  |  补全备注: ${filledCount}家`);
  console.log("──────────────────────────────────────────────────────────────\n");
  console.log("提示: check    详细单项检查 + JSON结果");
  console.log("      fix      生成建议 + 备注补全 + 保存修正");
  console.log("      report   通过/失败/复核三份名单 + 完整报告\n");

  logger.info("预览完成", { counts, suggestions: suggestions.length, filled: filledCount });

  return {
    counts,
    suggestions,
    updatedMerchants,
    shopStatuses: pipeline.shopStatuses,
  };
}

function padEnd(s, len) { return String(s).padEnd(len); }

module.exports = { runPreview };
