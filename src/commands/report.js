const { saveJson } = require("../utils/file");
const { initEnvironment, loadFilteredMerchants } = require("../utils/environment");
const { runAllChecks, STATUS_PASS, STATUS_FAIL, STATUS_REVIEW, REVIEW_CATEGORY_HIGH_RISK, REVIEW_CATEGORY_WATCH, REVIEW_CATEGORY_WEAK_DUPLICATE } = require("../core/workflow");
const { generateSuggestions } = require("../core/suggestion");
const { fillRemarks } = require("../core/remark");
const { createReviewTracker, getReviewStats, filterByCategory, filterByStatus, REVIEW_STATUS_PENDING, REVIEW_STATUS_CONFIRMED_PASS, REVIEW_STATUS_REJECTED } = require("../core/review-state");
const { saveCSV, saveCategoryCSV } = require("../utils/csv-export");
const { statusIcon, statusText, categoryLabel, pad, padEnd } = require("./check");

function recordBase(rec) {
  return {
    record_id: rec.record_id,
    shop_id: rec.shop_id,
    shop_name: rec.shop_name,
    activity_id: rec.activity_id,
    category: rec.category,
    shop_type: rec.shop_type,
    credit_score: rec.credit_score,
    product_count: rec.product_count,
  };
}

function buildCollisions(rec) {
  return (rec.collides_with || []).map((c) => ({
    code: c.code,
    strategy: c.strategy,
    score: c.score,
    collide_with: c.collide_with,
    evidence: c.evidence,
  }));
}

const CATEGORY_FILE_MAP = {
  [REVIEW_CATEGORY_HIGH_RISK]: "review-high-risk",
  [REVIEW_CATEGORY_WATCH]: "review-watch",
  [REVIEW_CATEGORY_WEAK_DUPLICATE]: "review-weak-duplicate",
};

function runReport(options) {
  const { config, reportDir, activityId, activityName, logger } = initEnvironment(options);
  const { merchants, filtered } = loadFilteredMerchants(options.data, activityId);
  const rules = config.rules || {};
  const total = filtered.length;

  logger.info("开始生成完整报告", { total, activity_id: activityId });
  const pipeline = runAllChecks(filtered, rules, logger);
  const suggestions = generateSuggestions(pipeline.results);
  const { merchants: updatedMerchants, filledCount } = fillRemarks(filtered, pipeline.results);

  const passList = [];
  const failList = [];
  const reviewList = [];

  for (const rec of pipeline.recordStatuses) {
    const base = recordBase(rec);
    const issues = (rec.issues || []).map((i) => ({
      code: i.code,
      level: i.level,
      message: i.message,
    }));
    const sugKey = `${rec.shop_id}::${rec.shop_name}`;
    const snippets = suggestions.filter((s) => `${s.shop_id}::${s.shop_name}` === sugKey).map((s) => s.suggestion);
    const collisions = buildCollisions(rec);

    if (rec.status === STATUS_PASS) {
      passList.push({ ...base, verified_at: new Date().toISOString() });
    } else if (rec.status === STATUS_FAIL) {
      failList.push({
        ...base,
        issues,
        collisions,
        suggestions: snippets,
        fail_reasons: rec.fail_reasons || [],
        review_categories: rec.review_categories || [],
      });
    } else {
      reviewList.push({
        ...base,
        issues,
        collisions,
        suggestions: snippets,
        review_reasons: rec.review_reasons || [],
        review_categories: rec.review_categories || [],
      });
    }
  }

  const reviewTracker = createReviewTracker(pipeline.recordStatuses, options.resume || null);
  const reviewStats = getReviewStats(reviewTracker);

  if (options.resume) {
    logger.info(`从上次复核结果恢复: ${options.resume}`, { resumed: reviewTracker.length });
  }

  const filterCategory = options.reviewCategory || null;

  const report = {
    activity: { ...(config.activity || {}), id: activityId, name: activityName },
    generated_at: new Date().toISOString(),
    summary: {
      total,
      passed: passList.length,
      failed: failList.length,
      review: reviewList.length,
      pass_rate: ((passList.length / Math.max(1, total)) * 100).toFixed(1) + "%",
    },
    review_tracker_stats: reviewStats,
    pass_list: passList,
    fail_list: failList,
    review_list: reviewList,
    review_tracker: reviewTracker,
    all_suggestions: suggestions,
    remark_filled_count: filledCount,
  };

  saveJson(`${reportDir}/full-report.json`, report);
  logger.info("完整报告已保存");

  saveJson(`${reportDir}/pass-list.json`, buildExport("pass", activityId, activityName, passList));
  logger.info(`通过名单已保存: ${passList.length} 条`);

  saveJson(`${reportDir}/fail-reasons.json`, buildExport("fail", activityId, activityName, failList));
  logger.info(`失败原因已保存: ${failList.length} 条`);

  saveJson(`${reportDir}/review-list.json`, buildExport("review", activityId, activityName, reviewList));
  logger.info(`待复核名单已保存: ${reviewList.length} 条`);

  saveJson(`${reportDir}/review-tracker.json`, buildExport("review_tracker", activityId, activityName, reviewTracker));
  logger.info(`复核追踪表已保存: ${reviewTracker.length} 条`);

  for (const [cat, filePrefix] of Object.entries(CATEGORY_FILE_MAP)) {
    const items = filterByCategory(reviewTracker, cat);
    if (items.length > 0) {
      saveJson(`${reportDir}/${filePrefix}.json`, buildExport(cat, activityId, activityName, items));
      saveCategoryCSV(`${reportDir}/${filePrefix}.csv`, items, cat, activityId);
      logger.info(`分组导出 [${categoryLabel(cat)}]: ${items.length} 条 → ${filePrefix}.json + .csv`);
    }
  }

  if (filterCategory) {
    const filtered = filterByCategory(reviewTracker, filterCategory);
    if (filtered.length === 0) {
      console.log(`\n⚠️  分类 [${filterCategory}] 下没有待复核记录\n`);
    } else {
      console.log(`\n🔍 按 ${categoryLabel(filterCategory)} 过滤的结果 (${filtered.length} 条):\n`);
      for (const item of filtered) {
        console.log(`  ${statusIcon("review")} ${item.record_id} [${item.shop_id}] ${item.shop_name} — ${item.review_status}`);
        for (const rr of item.review_reasons) {
          console.log(`     📋 [${rr.category}] ${rr.message}`);
        }
        console.log("");
      }
    }
  }

  saveJson(`${reportDir}/merchants-updated.json`, updatedMerchants);
  logger.info("更新后商家数据已保存");

  saveJson(`${reportDir}/suggestions.json`, suggestions);
  logger.info(`修改建议已保存: ${suggestions.length} 条`);

  const csvPath = `${reportDir}/audit-summary.csv`;
  saveCSV(csvPath, pipeline.recordStatuses, suggestions, activityId, reviewTracker);
  logger.info(`CSV汇总表已保存: ${csvPath}`);

  const logPath = logger.exportLog(`${reportDir}/operation-log.json`);
  logger.info(`操作日志已保存: ${logPath}`);

  printReportSummary(report, reviewTracker, reviewStats);
  return report;
}

function buildExport(kind, activityId, activityName, list) {
  return {
    activity: { id: activityId, name: activityName },
    generated_at: new Date().toISOString(),
    kind,
    count: list.length,
    list,
  };
}

function printReportSummary(report, reviewTracker, reviewStats) {
  const s = report.summary;
  const act = report.activity;

  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║                     审核报告 - 最终结果                           ║");
  console.log("╠══════════════════════════════════════════════════════════════════╣");
  console.log(`║  活动: ${padEnd(act?.name || "-", 40)} ID: ${padEnd(act?.id || "-", 18)}║`);
  console.log(`║  报名: ${pad(s.total, 3)}条  ✅通过: ${pad(s.passed, 3)}  ❌未通: ${pad(s.failed, 3)}  🔍复核: ${pad(s.review, 3)}  通过率: ${padEnd(s.pass_rate, 6)}║`);
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");

  printListSection("✅ 通过名单", report.pass_list, (p) => {
    console.log(`  ✅ ${p.record_id} [${p.shop_id}] ${p.shop_name} (${p.category})`);
  });

  printListSection("❌ 未通过名单及原因", report.fail_list, (f) => {
    console.log(`  ❌ ${f.record_id} [${f.shop_id}] ${f.shop_name} (${f.activity_id})`);
    for (const issue of f.issues) {
      const tag = issue.level === "error" ? "✖" : "⚠";
      console.log(`     ${tag} [${issue.code}] ${issue.message}`);
    }
    if (f.review_categories && f.review_categories.length > 0) {
      console.log(`     🏷️  附加复核标签: ${f.review_categories.map(categoryLabel).join(", ")}`);
    }
    printCollisions(f.collisions);
    printSuggestions(f.suggestions);
  });

  printListSection("🔍 待人工复核名单 (可派单处理)", report.review_list, (r) => {
    console.log(`  🔍 ${r.record_id} [${r.shop_id}] ${r.shop_name} (${r.activity_id})`);
    console.log(`     🏷️  复核分类: ${(r.review_categories || []).map(categoryLabel).join(", ")}`);
    for (const rr of r.review_reasons || []) {
      console.log(`     📋 [${rr.category}] ${rr.message}`);
    }
    for (const issue of r.issues) {
      const tag = issue.level === "error" ? "✖" : "⚠";
      console.log(`     ${tag} [${issue.code}] ${issue.message}`);
    }
    printCollisions(r.collisions);
    printSuggestions(r.suggestions);
  });

  console.log("📋 复核处理状态:");
  console.log(`  📌 待认领: ${reviewStats[REVIEW_STATUS_PENDING]}  ✅已确认通过: ${reviewStats[REVIEW_STATUS_CONFIRMED_PASS]}  ❌已驳回: ${reviewStats[REVIEW_STATUS_REJECTED]}`);

  const byCategory = {};
  for (const cat of [REVIEW_CATEGORY_HIGH_RISK, REVIEW_CATEGORY_WATCH, REVIEW_CATEGORY_WEAK_DUPLICATE]) {
    const items = filterByCategory(reviewTracker, cat);
    byCategory[cat] = items.length;
    const pending = items.filter((i) => i.review_status === REVIEW_STATUS_PENDING).length;
    console.log(`  ${categoryLabel(cat)}: ${items.length}条 (待认领: ${pending})`);
  }

  if (reviewTracker.length > 0) {
    const pending = filterByStatus(reviewTracker, REVIEW_STATUS_PENDING);
    if (pending.length > 0) {
      console.log(`\n  待认领取单:`);
      for (const item of pending) {
        const cats = item.review_categories.map(categoryLabel).join(",");
        console.log(`    📌 ${item.record_id} [${item.shop_id}] ${item.shop_name} — ${cats}`);
      }
    }
  }
  console.log("");

  console.log("📄 已导出文件:");
  console.log("  ├── full-report.json         (完整报告)");
  console.log("  ├── pass-list.json           (通过名单)");
  console.log("  ├── fail-reasons.json        (失败原因)");
  console.log("  ├── review-list.json         (待复核名单)");
  console.log("  ├── review-tracker.json      (复核追踪表)");
  console.log("  ├── review-high-risk.json    (高风险类目分组)");
  console.log("  ├── review-high-risk.csv     (高风险类目CSV)");
  console.log("  ├── review-watch.json        (关注类目分组)");
  console.log("  ├── review-watch.csv         (关注类目CSV)");
  console.log("  ├── review-weak-duplicate.json (弱重复证据分组)");
  console.log("  ├── review-weak-duplicate.csv  (弱重复证据CSV)");
  console.log("  ├── audit-summary.csv        (全量CSV汇总)");
  console.log("  ├── merchants-updated.json   (更新后商家数据)");
  console.log("  ├── suggestions.json         (修改建议)");
  console.log("  ├── check-result.json        (检查明细)");
  console.log("  └── operation-log.json       (操作日志)");
  console.log("");
}

function printListSection(title, list, render) {
  console.log(`${title}:`);
  if (list.length === 0) { console.log("  (无)"); }
  else { for (const item of list) render(item); }
  console.log("");
}

function printCollisions(collisions) {
  if (!collisions || collisions.length === 0) return;
  console.log("     💥 碰撞记录:");
  for (const c of collisions) {
    console.log(`        · 与 [${c.collide_with.shop_id}] ${c.collide_with.shop_name} 相撞 (${c.strategy}/${(c.score * 100).toFixed(0)}%)`);
    for (const e of c.evidence || []) console.log(`          证据: ${e}`);
  }
}

function printSuggestions(suggestions) {
  if (!suggestions || suggestions.length === 0) return;
  console.log("     💡 建议:");
  for (const s of suggestions.slice(0, 2)) console.log(`        → ${s}`);
  if (suggestions.length > 2) console.log(`        → ... +${suggestions.length - 2} 条`);
}

module.exports = { runReport };
