const fs = require("fs");

function escapeCSV(val) {
  const s = val == null ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function generateCSV(recordStatuses, suggestions, activityId) {
  const sugMap = new Map();
  for (const s of suggestions || []) {
    const k = `${s.shop_id}::${s.shop_name}`;
    if (!sugMap.has(k)) sugMap.set(k, []);
    sugMap.get(k).push(s.suggestion);
  }

  const headers = [
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

    rows.push([
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

function saveCSV(filePath, recordStatuses, suggestions, activityId) {
  const content = generateCSV(recordStatuses, suggestions, activityId);
  const bom = "\uFEFF";
  fs.writeFileSync(filePath, bom + content, "utf-8");
  return filePath;
}

module.exports = { generateCSV, saveCSV, escapeCSV };
