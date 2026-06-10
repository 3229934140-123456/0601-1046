function checkPrice(merchant, rules) {
  const issues = [];
  const pRules = rules.price || {};
  const minPrice = pRules.min_price || 0;
  const maxPrice = pRules.max_price || Infinity;
  const discountMin = pRules.discount_min_percent || 0;
  const maxRatio = pRules.max_price_ratio || Infinity;
  const products = merchant.products || [];

  for (const prod of products) {
    if (prod.price < minPrice) {
      issues.push({
        code: "PR001",
        level: "error",
        message: `商品 [${prod.name}] 价格低于最低限价: ${prod.price} < ${minPrice}`,
        detail: { sku: prod.sku, actual: prod.price, min: minPrice },
      });
    }

    if (prod.price > maxPrice) {
      issues.push({
        code: "PR002",
        level: "error",
        message: `商品 [${prod.name}] 价格高于最高限价: ${prod.price} > ${maxPrice}`,
        detail: { sku: prod.sku, actual: prod.price, max: maxPrice },
      });
    }

    if (prod.original_price && prod.original_price > 0) {
      const discount = ((prod.original_price - prod.price) / prod.original_price) * 100;
      if (discount < discountMin) {
        issues.push({
          code: "PR003",
          level: "warn",
          message: `商品 [${prod.name}] 折扣力度不足: ${discount.toFixed(1)}% < ${discountMin}%`,
          detail: { sku: prod.sku, discount: discount.toFixed(1), required_min: discountMin },
        });
      }

      const ratio = prod.price / prod.original_price;
      if (ratio > maxRatio) {
        issues.push({
          code: "PR004",
          level: "error",
          message: `商品 [${prod.name}] 活动价高于原价`,
          detail: { sku: prod.sku, price: prod.price, original_price: prod.original_price, ratio },
        });
      }
    }
  }

  return {
    shop_id: merchant.shop_id,
    shop_name: merchant.shop_name,
    check: "price",
    passed: issues.filter((i) => i.level === "error").length === 0,
    issues,
  };
}

module.exports = { checkPrice };
