const { saveJson } = require("../utils/file");
const { initEnvironment, loadFilteredMerchants } = require("../utils/environment");
const {
  runAllChecks,
  STATUS_PASS,
  STATUS_FAIL,
  STATUS_REVIEW,
  REVIEW_CATEGORY_HIGH_RISK,
  REVIEW_CATEGORY_WATCH,
  REVIEW_CATEGORY_WEAK_DUPLICATE,
} = require("../core/workflow");

function runCheck(options) {
  const { config, reportDir, activityId, activityName, logger } = initEnvironment(options);
  const { merchants, filtered } = loadFilteredMerchants(options.data, activityId);
  const rules = config.rules || {};

  if (activityId) {
    logger.info(`按活动ID过滤商家`, { activity_id: activityId, total: merchants.length, matched: filtered.length });
  }

  logger.info("开始商家资料检查", { total: filtered.length, activity_id: activityId });
  const pipeline = runAllChecks(filtered, rules, logger);

  const counts = { [STATUS_PASS]: 0, [STATUS_FAIL]: 0, [STATUS_REVIEW]: 0 };
  for (const s of pipeline.recordStatuses) counts[s.status]++;

  logger.info("检查完成", { activity_id: activityId, ...counts });

  const summary = {
    activity: { ...(config.activity || {}), id: activityId, name: activityName },
    timestamp: new Date().toISOString(),
    check_statistics: pipeline.checkStatistics,
    audit_statistics: { total: filtered.length, ...counts },
    results: pipeline.results,
    recordStatuses: pipeline.recordStatuses,
  };

  const outPath = options.output || require("path").join(reportDir, "check-result.json");
  saveJson(outPath, summary);
  logger.info(`检查结果已保存: ${outPath}`);

  printCheckSummary(summary);
  return summary;
}

function statusIcon(status) {
  return status === STATUS_PASS ? "✅" : status === STATUS_FAIL ? "❌" : "🔍";
}

function statusText(status) {
  return status === STATUS_PASS ? "通过" : status === STATUS_FAIL ? "未通过" : "待复核";
}

function categoryLabel(cat) {
  const map = {
    [REVIEW_CATEGORY_HIGH_RISK]: "高风险类目",
    [REVIEW_CATEGORY_WATCH]: "关注类目",
    [REVIEW_CATEGORY_WEAK_DUPLICATE]: "弱重复证据",
  };
  return map[cat] || cat;
}

function printCheckSummary(summary) {
  const s = summary.audit_statistics;
  const cs = summary.check_statistics;

  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║                    商家资料检查结果摘要                        ║");
  console.log("╠════════════════════════════════════════════════════════════════╣");
  console.log(`║  活动: ${padEnd(summary.activity?.name || "-", 40)} ID: ${padEnd(summary.activity?.id || "-", 20)}║`);
  console.log(`║  报名记录数: ${pad(s.total, 3)}  ✅通过: ${pad(s[STATUS_PASS], 3)}  ❌未通: ${pad(s[STATUS_FAIL], 3)}  🔍复核: ${pad(s[STATUS_REVIEW], 3)}     ║`);
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  for (const rec of summary.recordStatuses) {
    const icon = statusIcon(rec.status);
    console.log(`${icon} ${rec.record_id} [${rec.shop_id}] ${rec.shop_name} (${rec.activity_id}) — ${statusText(rec.status)}`);

    for (const [checkName, passed] of Object.entries(rec.checks || {})) {
      const m = passed ? "  ✅" : "  ❌";
      console.log(`${m} ${checkName}`);
      const related = (rec.issues || []).filter((i) => i.code && codeBelongsTo(i.code, checkName));
      for (const issue of related) {
        const t = issue.level === "error" ? "    ✖" : "    ⚠";
        console.log(`${t} [${issue.code}] ${issue.message}`);
      }
    }

    if (rec.review_categories && rec.review_categories.length > 0) {
      const cats = rec.review_categories.map(categoryLabel).join(", ");
      console.log(`  🏷️  复核原因: ${cats}`);
    }

    if (rec.collides_with && rec.collides_with.length > 0) {
      for (const c of rec.collides_with) {
        console.log(`    💥 撞 [${c.collide_with.shop_id}] ${c.collide_with.shop_name} (${c.strategy}/${(c.score * 100).toFixed(0)}%)`);
        for (const e of c.evidence) {
          console.log(`       · ${e}`);
        }
      }
    }
    console.log("");
  }
}

function codeBelongsTo(code, check) {
  const map = { Q: "qualification", P: "product_count", PR: "price", IMG: "image", D: "duplicate", R: "risk" };
  return map[code.replace(/\d.*/, "")] === check;
}

function pad(n, len) { return String(n).padStart(len, " "); }
function padEnd(s, len) { return String(s).padEnd(len); }

module.exports = {
  runCheck,
  statusIcon,
  statusText,
  categoryLabel,
  pad,
  padEnd,
  codeBelongsTo,
};
