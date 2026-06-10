function checkProductCount(merchant, rules) {
  const issues = [];
  const pRules = rules.product || {};
  const minCount = pRules.min_count || 1;
  const maxCount = pRules.max_count || Infinity;
  const products = merchant.products || [];
  const count = products.length;

  if (count < minCount) {
    issues.push({
      code: "P001",
      level: "error",
      message: `商品数量不足: ${count} < ${minCount}`,
      detail: { actual: count, required_min: minCount },
    });
  }

  if (count > maxCount) {
    issues.push({
      code: "P002",
      level: "warn",
      message: `商品数量超限: ${count} > ${maxCount}`,
      detail: { actual: count, required_max: maxCount },
    });
  }

  return {
    shop_id: merchant.shop_id,
    shop_name: merchant.shop_name,
    check: "product_count",
    passed: issues.length === 0,
    issues,
  };
}

module.exports = { checkProductCount };
