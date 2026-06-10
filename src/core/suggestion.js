const SUGGESTION_MAP = {
  Q001: (issue) => `请尽快上传缺失的资质文件: ${issue.detail.missing.join("、")}，否则无法通过审核`,
  Q002: (issue) => `信用分当前 ${issue.detail.actual}，需提升至 ${issue.detail.required} 以上，建议改善店铺经营数据`,
  Q003: () => "请尽快完成实名认证，这是活动报名的硬性要求",
  P001: (issue) => `当前商品数 ${issue.detail.actual}，需至少上架 ${issue.detail.required_min} 件商品参与活动`,
  P002: (issue) => `当前商品数 ${issue.detail.actual}，超出上限 ${issue.detail.required_max}，请精简商品`,
  PR001: (issue) => `商品价格 ${issue.detail.actual} 低于最低限价 ${issue.detail.min}，请调整价格或确认是否填写正确`,
  PR002: (issue) => `商品价格 ${issue.detail.actual} 高于最高限价 ${issue.detail.max}，该商品可能不适合本活动`,
  PR003: (issue) => `折扣力度仅 ${issue.detail.discount}%，低于要求的 ${issue.detail.required_min}%，请加大优惠力度`,
  PR004: (issue) => `活动价高于原价，请核实价格是否填写反了（活动价: ${issue.detail.price}, 原价: ${issue.detail.original_price}）`,
  IMG001: (issue) => `请补充缺失图片: ${issue.detail.missing.join("、")}，确保商品展示完整`,
  IMG002: (issue) => `商品没有任何图片，请上传至少主图和详情图`,
  D001: (issue) => `同一店铺ID [${issue.detail.current.shop_id}] 重复报名同一活动，与 [${issue.detail.collide_with.shop_id}] ${issue.detail.collide_with.shop_name} 冲突，请移除重复条目`,
  D002: (issue) => `店铺名 [${issue.detail.current.shop_name}] 与 [${issue.detail.collide_with.shop_id}] ${issue.detail.collide_with.shop_name} 撞名，高度疑似重复报名，请人工核实是否为同一主体`,
  D003: (issue) => `商品与 [${issue.detail.collide_with.shop_id}] ${issue.detail.collide_with.shop_name} 高度相似，可能存在串货/盗图，建议人工复核商品来源`,
  D004: (issue) => `店铺 [${issue.detail.current.shop_name}] 同时报名多个活动，请确认是否允许跨活动同时报名`,
  R001: (issue) => `${issue.detail.category} 为高风险类目，需提交额外资质证明（如特殊行业许可证），并接受人工复核`,
  R002: (issue) => `${issue.detail.category} 为关注类目，建议准备相关合规证明以备查验`,
};

function generateSuggestions(checkResults) {
  const suggestions = [];

  for (const result of checkResults) {
    for (const issue of result.issues || []) {
      const generator = SUGGESTION_MAP[issue.code];
      if (generator) {
        suggestions.push({
          shop_id: result.shop_id,
          shop_name: result.shop_name,
          check: result.check,
          code: issue.code,
          level: issue.level,
          issue_message: issue.message,
          suggestion: generator(issue),
          auto_fixable: ["IMG001", "PR004"].includes(issue.code),
        });
      }
    }
  }

  return suggestions;
}

module.exports = { generateSuggestions, SUGGESTION_MAP };
