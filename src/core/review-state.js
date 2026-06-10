const fs = require("fs");
const path = require("path");

const REVIEW_STATUS_PENDING = "pending_claim";
const REVIEW_STATUS_CONFIRMED_PASS = "confirmed_pass";
const REVIEW_STATUS_REJECTED = "rejected";

function createReviewTracker(recordStatuses, previousState) {
  const prevState = loadPreviousState(previousState);
  const items = [];

  for (const rec of recordStatuses) {
    if (rec.status !== "review") continue;

    const recordId = rec.record_id;
    const existing = prevState.get(recordId);

    items.push({
      record_id: recordId,
      shop_id: rec.shop_id,
      shop_name: rec.shop_name,
      activity_id: rec.activity_id,
      category: rec.category,
      shop_type: rec.shop_type,
      credit_score: rec.credit_score,
      product_count: rec.product_count,
      review_categories: rec.review_categories || [],
      review_reasons: rec.review_reasons || [],
      collides_with: rec.collides_with || [],
      issues: (rec.issues || []).map((i) => ({
        code: i.code,
        level: i.level,
        message: i.message,
      })),
      review_status: existing ? existing.review_status : REVIEW_STATUS_PENDING,
      reviewed_by: existing ? existing.reviewed_by : null,
      reviewed_at: existing ? existing.reviewed_at : null,
      review_note: existing ? existing.review_note : null,
    });
  }

  return items;
}

function loadPreviousState(previousPath) {
  const map = new Map();
  if (!previousPath) return map;

  const resolved = path.resolve(previousPath);
  if (!fs.existsSync(resolved)) return map;

  try {
    const data = JSON.parse(fs.readFileSync(resolved, "utf-8"));
    const list = data.list || data.items || data;
    if (!Array.isArray(list)) return map;
    for (const item of list) {
      const key = item.record_id || item.key;
      if (key) map.set(key, item);
    }
  } catch {
    return map;
  }

  return map;
}

function updateReviewStatus(tracker, identifier, newStatus, reviewedBy, note) {
  let item = tracker.find((i) => i.record_id === identifier);
  if (!item) {
    item = tracker.find((i) => i.shop_id === identifier && i.activity_id);
  }
  if (!item) return null;

  item.review_status = newStatus;
  item.reviewed_by = reviewedBy || "system";
  item.reviewed_at = new Date().toISOString();
  item.review_note = note || null;
  return item;
}

function getReviewStats(tracker) {
  const stats = {
    total: tracker.length,
    [REVIEW_STATUS_PENDING]: 0,
    [REVIEW_STATUS_CONFIRMED_PASS]: 0,
    [REVIEW_STATUS_REJECTED]: 0,
  };
  for (const item of tracker) {
    if (stats[item.review_status] !== undefined) stats[item.review_status]++;
  }
  return stats;
}

function filterByCategory(tracker, category) {
  return tracker.filter((i) => i.review_categories.includes(category));
}

function filterByStatus(tracker, status) {
  return tracker.filter((i) => i.review_status === status);
}

function loadTrackerFromPath(trackerPath) {
  const resolved = path.resolve(trackerPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`复核追踪文件不存在: ${resolved}`);
  }
  const data = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  const list = data.list || data.items || data;
  if (!Array.isArray(list)) throw new Error("复核追踪文件格式无效");
  return list;
}

function saveTrackerToPath(trackerPath, tracker, activityId, activityName) {
  const output = {
    activity: { id: activityId, name: activityName },
    updated_at: new Date().toISOString(),
    kind: "review_tracker",
    count: tracker.length,
    list: tracker,
  };
  fs.writeFileSync(trackerPath, JSON.stringify(output, null, 2), "utf-8");
  return trackerPath;
}

module.exports = {
  createReviewTracker,
  updateReviewStatus,
  getReviewStats,
  filterByCategory,
  filterByStatus,
  loadPreviousState,
  loadTrackerFromPath,
  saveTrackerToPath,
  REVIEW_STATUS_PENDING,
  REVIEW_STATUS_CONFIRMED_PASS,
  REVIEW_STATUS_REJECTED,
};
