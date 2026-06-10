const path = require("path");
const { initEnvironment } = require("../utils/environment");
const {
  loadTrackerFromPath,
  saveTrackerToPath,
  updateReviewStatus,
  getReviewStats,
  filterByStatus,
  filterByCategory,
  REVIEW_STATUS_PENDING,
  REVIEW_STATUS_CONFIRMED_PASS,
  REVIEW_STATUS_REJECTED,
} = require("../core/review-state");
const { REVIEW_CATEGORY_HIGH_RISK, REVIEW_CATEGORY_WATCH, REVIEW_CATEGORY_WEAK_DUPLICATE } = require("../core/workflow");
const { categoryLabel, pad } = require("./check");

function runReview(options) {
  const action = options.action;

  if (action === "update") {
    return runUpdate(options);
  } else if (action === "list") {
    return runList(options);
  } else if (action === "show") {
    return runShow(options);
  } else {
    console.error("未知操作:", action);
    console.log("可用操作: update, list, show");
    process.exit(1);
  }
}

function resolveTrackerPath(options) {
  const { config, reportDir, activityId, activityName } = initEnvironment(options);
  const trackerPath = options.tracker || path.join(reportDir, "review-tracker.json");
  return { trackerPath, reportDir, activityId, activityName };
}

function runUpdate(options) {
  const { trackerPath, reportDir, activityId, activityName } = resolveTrackerPath(options);
  const identifier = options.identifier;
  const status = options.status;
  const reviewer = options.reviewer || "cli";
  const note = options.note || "";

  if (!identifier) {
    console.error("请指定 --identifier (record_id 或 shop_id)");
    process.exit(1);
  }

  const validStatuses = [REVIEW_STATUS_CONFIRMED_PASS, REVIEW_STATUS_REJECTED, REVIEW_STATUS_PENDING];
  if (!status || !validStatuses.includes(status)) {
    console.error(`请指定有效的 --status: ${validStatuses.join(", ")}`);
    process.exit(1);
  }

  const tracker = loadTrackerFromPath(trackerPath);
  const item = updateReviewStatus(tracker, identifier, status, reviewer, note);

  if (!item) {
    console.error(`未找到匹配的记录: ${identifier}`);
    console.log("提示: 使用 --identifier 指定 record_id (如 ACT-2026-0618-REC-004) 或 shop_id");
    process.exit(1);
  }

  saveTrackerToPath(trackerPath, tracker, activityId, activityName);

  const statusLabel = status === REVIEW_STATUS_CONFIRMED_PASS ? "✅ 已确认通过" :
                      status === REVIEW_STATUS_REJECTED ? "❌ 已驳回" : "📌 重置为待认领";

  console.log(`\n📝 复核状态已更新:`);
  console.log(`  记录编号: ${item.record_id}`);
  console.log(`  店铺: [${item.shop_id}] ${item.shop_name}`);
  console.log(`  活动: ${item.activity_id}`);
  console.log(`  处理结论: ${statusLabel}`);
  console.log(`  处理人: ${item.reviewed_by}`);
  console.log(`  处理时间: ${item.reviewed_at}`);
  if (item.review_note) console.log(`  备注: ${item.review_note}`);
  console.log(`\n  文件已更新: ${trackerPath}`);
  console.log(`  提示: 运行 report --resume ${trackerPath} 可带着此结论重新生成报告\n`);

  return item;
}

function runList(options) {
  const { trackerPath } = resolveTrackerPath(options);
  const tracker = loadTrackerFromPath(trackerPath);
  const stats = getReviewStats(tracker);

  const filterStatus = options.status || null;
  const filterCat = options.category || null;

  let items = tracker;
  if (filterStatus) items = filterByStatus(items, filterStatus);
  if (filterCat) items = filterByCategory(items, filterCat);

  console.log(`\n📋 复核追踪列表 (共 ${tracker.length} 条${filterStatus || filterCat ? `, 过滤后 ${items.length} 条` : ""})`);
  console.log(`  📌 待认领: ${stats[REVIEW_STATUS_PENDING]}  ✅已通过: ${stats[REVIEW_STATUS_CONFIRMED_PASS]}  ❌已驳回: ${stats[REVIEW_STATUS_REJECTED]}`);
  console.log("");

  for (const item of items) {
    const statusTag = item.review_status === REVIEW_STATUS_PENDING ? "📌" :
                      item.review_status === REVIEW_STATUS_CONFIRMED_PASS ? "✅" : "❌";
    console.log(`  ${statusTag} ${item.record_id} [${item.shop_id}] ${item.shop_name}`);
    console.log(`     分类: ${item.review_categories.map(categoryLabel).join(", ")}`);
    console.log(`     状态: ${item.review_status}${item.reviewed_by ? `  处理人: ${item.reviewed_by}` : ""}${item.review_note ? `  备注: ${item.review_note}` : ""}`);
    console.log("");
  }

  return items;
}

function runShow(options) {
  const { trackerPath } = resolveTrackerPath(options);
  const tracker = loadTrackerFromPath(trackerPath);
  const identifier = options.identifier;

  if (!identifier) {
    console.error("请指定 --identifier (record_id 或 shop_id)");
    process.exit(1);
  }

  const item = tracker.find((i) => i.record_id === identifier) ||
               tracker.find((i) => i.shop_id === identifier);

  if (!item) {
    console.error(`未找到匹配的记录: ${identifier}`);
    process.exit(1);
  }

  const statusLabel = item.review_status === REVIEW_STATUS_PENDING ? "📌 待认领" :
                      item.review_status === REVIEW_STATUS_CONFIRMED_PASS ? "✅ 已确认通过" : "❌ 已驳回";

  console.log(`\n📄 复核记录详情:`);
  console.log(`  记录编号: ${item.record_id}`);
  console.log(`  店铺ID: ${item.shop_id}`);
  console.log(`  店铺名: ${item.shop_name}`);
  console.log(`  活动ID: ${item.activity_id}`);
  console.log(`  经营类目: ${item.category}`);
  console.log(`  复核分类: ${item.review_categories.map(categoryLabel).join(", ")}`);
  console.log(`  处理状态: ${statusLabel}`);
  if (item.reviewed_by) console.log(`  处理人: ${item.reviewed_by}`);
  if (item.reviewed_at) console.log(`  处理时间: ${item.reviewed_at}`);
  if (item.review_note) console.log(`  备注: ${item.review_note}`);

  if (item.review_reasons && item.review_reasons.length > 0) {
    console.log(`  复核原因:`);
    for (const r of item.review_reasons) {
      console.log(`    📋 [${r.category}] ${r.message}`);
    }
  }

  if (item.collides_with && item.collides_with.length > 0) {
    console.log(`  碰撞记录:`);
    for (const c of item.collides_with) {
      console.log(`    💥 与 [${c.collide_with.shop_id}] ${c.collide_with.shop_name} (${c.strategy}/${(c.score * 100).toFixed(0)}%)`);
      for (const e of c.evidence || []) console.log(`       · ${e}`);
    }
  }
  console.log("");

  return item;
}

module.exports = { runReview };
