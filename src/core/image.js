function checkImage(merchant, rules) {
  const issues = [];
  const iRules = rules.image || {};
  const requiredImages = iRules.required_images || [];
  const products = merchant.products || [];

  for (const prod of products) {
    const images = prod.images || [];
    const missing = requiredImages.filter((req) => !images.includes(req));

    if (missing.length > 0) {
      issues.push({
        code: "IMG001",
        level: "error",
        message: `商品 [${prod.name}] 缺失图片: ${missing.join("、")}`,
        detail: { sku: prod.sku, required: requiredImages, actual: images, missing },
      });
    }

    if (images.length === 0) {
      issues.push({
        code: "IMG002",
        level: "error",
        message: `商品 [${prod.name}] 完全没有图片`,
        detail: { sku: prod.sku },
      });
    }
  }

  return {
    shop_id: merchant.shop_id,
    shop_name: merchant.shop_name,
    check: "image",
    passed: issues.length === 0,
    issues,
  };
}

module.exports = { checkImage };
