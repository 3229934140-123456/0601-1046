function findDuplicates(merchants, rules) {
  const issues = [];
  const dRules = rules.duplicate || {};
  const checkFields = dRules.check_fields || ["shop_id", "activity_id"];
  const allowDiff = dRules.allow_same_shop_different_activity !== false;

  const seen = new Map();

  for (const m of merchants) {
    const key = checkFields.map((f) => m[f]).join("|");

    if (seen.has(key)) {
      const prev = seen.get(key);

      if (allowDiff && m.activity_id !== prev.activity_id) {
        continue;
      }

      issues.push({
        code: "D001",
        level: "error",
        message: `重复报名: [${m.shop_name}] 与 [${prev.shop_name}] 重复 (key: ${key})`,
        detail: {
          current: { shop_id: m.shop_id, shop_name: m.shop_name, activity_id: m.activity_id },
          previous: { shop_id: prev.shop_id, shop_name: prev.shop_name, activity_id: prev.activity_id },
          match_key: key,
        },
      });
    } else {
      seen.set(key, { shop_id: m.shop_id, shop_name: m.shop_name, activity_id: m.activity_id });
    }
  }

  const affectedIds = new Set(issues.flatMap((i) => [i.detail.current.shop_id, i.detail.previous.shop_id]));

  const results = merchants.map((m) => ({
    shop_id: m.shop_id,
    shop_name: m.shop_name,
    check: "duplicate",
    passed: !affectedIds.has(m.shop_id),
    issues: issues.filter(
      (i) => i.detail.current.shop_id === m.shop_id || i.detail.previous.shop_id === m.shop_id
    ),
  }));

  return { results, allIssues: issues };
}

module.exports = { findDuplicates };
