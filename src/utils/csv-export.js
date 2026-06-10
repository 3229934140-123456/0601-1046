const fs = require("fs");

function escapeCSV(val) {
  const s = val == null ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function generateCSV(recordStatuses, suggestions, activityId, reviewTracker) {
  const sugMap = new Map();
  for (const s of suggestions || []) {
    const k = `${s.shop_id}::${s.shop_name}`;
    if (!sugMap.has(k)) sugMap.set(k, []);
    sugMap.get(k).push(s.suggestion);
  }

  const reviewMap = new Map();
  for (const r of reviewTracker || []) {
    const rid = r.record_id;
    if (rid) reviewMap.set(rid, r);
  }

  const headers = [
    "record_id",
    "activity_id",
    "shop_id",
    "shop_name",
    "category",
    "shop_type",
    "credit_score",
    "product_count",
    "final_status",
    "main_reason",
    "review_categories",
    "collision_target",
    "collision_strategy",
    "collision_score",
    "suggestions",
    "review_status",
    "reviewed_by",
    "review_note",
  ];

  const rows = [headers.map(escapeCSV).join(",")];

  for (const rec of recordStatuses) {
    const mainReason = buildMainReason(rec);
    const collisionTarget = (rec.collides_with || [])
      .map((c) => `${c.collide_with.shop_id}:${c.collide_with.shop_name}`)
      .join("; ");
    const collisionStrategy = (rec.collides_with || [])
      .map((c) => c.strategy)
      .join("; ");
    const collisionScore = (rec.collides_with || [])
      .map((c) => (c.score * 100).toFixed(0) + "%")
      .join("; ");

    const sugKey = `${rec.shop_id}::${rec.shop_name}`;
    const sugList = sugMap.get(sugKey) || [];
    const sugText = sugList.slice(0, 3).join("; ") + (sugList.length > 3 ? `...(+${sugList.length - 3})` : "");

    const rv = reviewMap.get(rec.record_id) || {};
    const reviewStatus = rv.review_status || (rec.status === "review" ? "pending_claim" : "");
    const reviewedBy = rv.reviewed_by || "";
    const reviewNote = rv.review_note || "";

    rows.push([
      escapeCSV(rec.record_id || ""),
      escapeCSV(activityId || rec.activity_id || ""),
      escapeCSV(rec.shop_id),
      escapeCSV(rec.shop_name),
      escapeCSV(rec.category),
      escapeCSV(rec.shop_type),
      escapeCSV(rec.credit_score),
      escapeCSV(rec.product_count),
      escapeCSV(rec.status),
      escapeCSV(mainReason),
      escapeCSV((rec.review_categories || []).join("; ")),
      escapeCSV(collisionTarget),
      escapeCSV(collisionStrategy),
      escapeCSV(collisionScore),
      escapeCSV(sugText),
      escapeCSV(reviewStatus),
      escapeCSV(reviewedBy),
      escapeCSV(reviewNote),
    ].join(","));
  }

  return rows.join("\n");
}

function buildMainReason(rec) {
  const parts = [];
  if (rec.fail_reasons && rec.fail_reasons.length) {
    parts.push(...rec.fail_reasons.map((f) => `[${f.check}] ${f.message}`));
  }
  if (rec.review_reasons && rec.review_reasons.length) {
    parts.push(...rec.review_reasons.map((r) => `[${r.category}] ${r.message}`));
  }
  return parts.join("; ") || "全部通过";
}

function saveCSV(filePath, recordStatuses, suggestions, activityId, reviewTracker) {
  const content = generateCSV(recordStatuses, suggestions, activityId, reviewTracker);
  const bom = "\uFEFF";
  fs.writeFileSync(filePath, bom + content, "utf-8");
  return filePath;
}

function generateCategoryCSV(trackerItems, category, activityId) {
  const headers = [
    "record_id",
    "activity_id",
    "shop_id",
    "shop_name",
    "category",
    "review_categories",
    "review_status",
    "reviewed_by",
    "reviewed_at",
    "review_note",
    "collision_target",
    "collision_evidence",
  ];

  const rows = [headers.map(escapeCSV).join(",")];

  for (const item of trackerItems) {
    const collisionTarget = (item.collides_with || [])
      .map((c) => `${c.collide_with.shop_id}:${c.collide_with.shop_name}`)
      .join("; ");
    const collisionEvidence = (item.collides_with || [])
      .flatMap((c) => c.evidence || [])
      .join("; ");

    rows.push([
      escapeCSV(item.record_id || ""),
      escapeCSV(item.activity_id || activityId || ""),
      escapeCSV(item.shop_id),
      escapeCSV(item.shop_name),
      escapeCSV(item.category),
      escapeCSV((item.review_categories || []).join("; ")),
      escapeCSV(item.review_status),
      escapeCSV(item.reviewed_by || ""),
      escapeCSV(item.reviewed_at || ""),
      escapeCSV(item.review_note || ""),
      escapeCSV(collisionTarget),
      escapeCSV(collisionEvidence),
    ].join(","));
  }

  return rows.join("\n");
}

function saveCategoryCSV(filePath, trackerItems, category, activityId) {
  const content = generateCategoryCSV(trackerItems, category, activityId);
  const bom = "\uFEFF";
  fs.writeFileSync(filePath, bom + content, "utf-8");
  return filePath;
}

module.exports = { generateCSV, saveCSV, escapeCSV, generateCategoryCSV, saveCategoryCSV };
