function markRisk(merchant, rules) {
  const issues = [];
  const rRules = rules.risk || {};
  const highRisk = rRules.high_risk_categories || [];
  const watch = rRules.watch_categories || [];
  const category = merchant.category || "";

  if (highRisk.includes(category)) {
    issues.push({
      code: "R001",
      level: "error",
      message: `高风险类目: ${category}，需要额外审核和资质证明`,
      detail: { category, risk_level: "high" },
    });
  } else if (watch.includes(category)) {
    issues.push({
      code: "R002",
      level: "warn",
      message: `关注类目: ${category}，需要加强关注`,
      detail: { category, risk_level: "watch" },
    });
  }

  return {
    shop_id: merchant.shop_id,
    shop_name: merchant.shop_name,
    check: "risk",
    passed: issues.filter((i) => i.level === "error").length === 0,
    issues,
  };
}

module.exports = { markRisk };
