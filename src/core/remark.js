function fillRemarks(merchants, checkResults) {
  const remarkMap = new Map();

  for (const result of checkResults) {
    if (!result.issues || result.issues.length === 0) continue;
    const tags = result.issues.map((i) => {
      const levelTag = i.level === "error" ? "❌" : "⚠️";
      return `${levelTag}${i.code}`;
    });
    const existing = remarkMap.get(result.shop_id) || [];
    remarkMap.set(result.shop_id, [...existing, ...tags]);
  }

  let filledCount = 0;
  const updated = merchants.map((m) => {
    const tags = remarkMap.get(m.shop_id);
    if (!tags) return { ...m, remark: m.remark || "✅ 资料完整，通过审核" };

    const tagStr = [...new Set(tags)].join(" ");
    const newRemark = m.remark ? `${m.remark} | ${tagStr}` : tagStr;
    if (newRemark !== m.remark) filledCount++;
    return { ...m, remark: newRemark };
  });

  return { merchants: updated, filledCount };
}

module.exports = { fillRemarks };
