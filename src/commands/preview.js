const { initEnvironment, loadFilteredMerchants } = require("../utils/environment");
const { runAllChecks, STATUS_PASS, STATUS_FAIL, STATUS_REVIEW } = require("../core/workflow");
const { generateSuggestions } = require("../core/suggestion");
const { fillRemarks } = require("../core/remark");
const { statusIcon, statusText, categoryLabel, pad } = require("./check");

function runPreview(options) {
  const { config, activityId, logger } = initEnvironment(options);
  const { filtered } = loadFilteredMerchants(options.data, activityId);
  const rules = config.rules || {};

  logger.info("开始预览（不写入文件）");
  const pipeline = runAllChecks(filtered, rules, null);
  const suggestions = generateSuggestions(pipeline.results);
  const { merchants: updatedMerchants, filledCount } = fillRemarks(filtered, pipeline.results);

  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║                    预览模式 - 不会写入文件                        ║");
  console.log("╠══════════════════════════════════════════════════════════════════╣");
  console.log(`║  活动: ${padEnd(config.activity?.name || "-", 40)} ID: ${padEnd(activityId || "-", 18)}║`);
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");

  const counts = { [STATUS_PASS]: 0, [STATUS_FAIL]: 0, [STATUS_REVIEW]: 0 };
  const sugByRecord = new Map();
  for (const s of suggestions) {
    const k = `${s.shop_id}::${s.shop_name}`;
    sugByRecord.set(k, (sugByRecord.get(k) || 0) + 1);
  }

  for (const rec of pipeline.recordStatuses) {
    counts[rec.status]++;
    const icon = statusIcon(rec.status);
    const sugKey = `${rec.shop_id}::${rec.shop_name}`;
    const sugCnt = sugByRecord.get(sugKey) || 0;

    console.log(`${icon} ${rec.record_id} [${rec.shop_id}] ${rec.shop_name} (${rec.activity_id}) — ${statusText(rec.status)}`);
    console.log(`   商品: ${rec.product_count}件  信用: ${rec.credit_score}  建议: ${sugCnt}条`);

    const issues = rec.issues || [];
    if (issues.length > 0) {
      for (const issue of issues.slice(0, 3)) {
        const t = issue.level === "error" ? "✖" : "⚠";
        console.log(`   ${t} [${issue.code}] ${issue.message}`);
      }
      if (issues.length > 3) console.log(`   ... +${issues.length - 3} 条`);
    }

    if (rec.review_categories && rec.review_categories.length > 0) {
      console.log(`   🏷️  复核: ${rec.review_categories.map(categoryLabel).join(", ")}`);
    }

    if (rec.collides_with && rec.collides_with.length > 0) {
      for (const c of rec.collides_with) {
        console.log(`   💥 撞 [${c.collide_with.shop_id}] ${c.collide_with.shop_name} (${c.strategy}/${(c.score * 100).toFixed(0)}%)`);
      }
    }

    const m = updatedMerchants.find((u) => u.shop_id === rec.shop_id);
    if (m && m.remark) console.log(`   备注: ${m.remark}`);
    console.log("");
  }

  const total = filtered.length;
  console.log("──────────────────────────────────────────────────────────────");
  console.log(`  汇总: ✅通过 ${counts[STATUS_PASS]}条  ❌未通 ${counts[STATUS_FAIL]}条  🔍复核 ${counts[STATUS_REVIEW]}条  / 共 ${total}条报名`);
  console.log(`  建议: ${suggestions.length}条  补全备注: ${filledCount}家`);
  console.log("──────────────────────────────────────────────────────────────\n");

  logger.info("预览完成", { counts, suggestions: suggestions.length, filled: filledCount });

  return { counts, suggestions, updatedMerchants, recordStatuses: pipeline.recordStatuses };
}

function padEnd(s, len) { return String(s).padEnd(len); }

module.exports = { runPreview };
