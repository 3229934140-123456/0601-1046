function productNameSimilarity(nameA, nameB) {
  if (!nameA || !nameB) return 0;
  const a = String(nameA).toLowerCase();
  const b = String(nameB).toLowerCase();
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  const setA = new Set(a.split(""));
  const setB = new Set(b.split(""));
  let common = 0;
  for (const ch of setA) if (setB.has(ch)) common++;
  const total = new Set([...setA, ...setB]).size || 1;
  return common / total;
}

function productSetSimilarity(prodsA, prodsB) {
  if (!prodsA || !prodsB || prodsA.length === 0 || prodsB.length === 0) return 0;
  let maxAvg = 0;
  const maxLen = Math.max(prodsA.length, prodsB.length);
  for (const pa of prodsA) {
    let bestMatch = 0;
    for (const pb of prodsB) {
      const sim = productNameSimilarity(pa.name, pb.name);
      if (sim > bestMatch) bestMatch = sim;
    }
    maxAvg += bestMatch;
  }
  return maxAvg / maxLen;
}

function buildMatchRecord(m, m2, strategy, score, evidence) {
  return {
    strategy,
    score,
    evidence,
    collide_with: {
      shop_id: m2.shop_id,
      shop_name: m2.shop_name,
      activity_id: m2.activity_id,
    },
    current: {
      shop_id: m.shop_id,
      shop_name: m.shop_name,
      activity_id: m.activity_id,
    },
  };
}

function findDuplicates(merchants, rules) {
  const issues = [];
  const dRules = rules.duplicate || {};
  const productSimilarityThreshold = dRules.product_similarity_threshold || 0.7;
  const allowDiff = dRules.allow_same_shop_different_activity !== false;

  const shopMatches = new Map();
  for (const m of merchants) {
    shopMatches.set(m.shop_id, []);
  }

  for (let i = 0; i < merchants.length; i++) {
    for (let j = 0; j < merchants.length; j++) {
      if (i === j) continue;
      const a = merchants[i];
      const b = merchants[j];

      const matches = shopMatches.get(a.shop_id) || [];

      const sameActivity = a.activity_id === b.activity_id;
      if (allowDiff && !sameActivity) continue;

      let matched = false;
      let strategy = "";
      let score = 0;
      let evidence = [];
      let level = "error";
      let code = "D001";
      let message = "";

      if (a.shop_id === b.shop_id && sameActivity) {
        matched = true;
        strategy = "shop_id_activity_id";
        score = 1.0;
        evidence = ["店铺ID完全一致", "活动ID完全一致"];
        level = "error";
        code = "D001";
        message = `确定重复: 店铺ID [${a.shop_id}] 在同一活动 [${a.activity_id}] 重复报名，与 [${b.shop_id}] ${b.shop_name} 冲突`;
      } else if (a.shop_name === b.shop_name && sameActivity) {
        matched = true;
        strategy = "shop_name_activity_id";
        score = 0.95;
        evidence = [`店铺名称完全一致: "${a.shop_name}"`, `活动ID完全一致: ${a.activity_id}`, `店铺ID不同: ${a.shop_id} vs ${b.shop_id}，可能是同一主体重复开店或录入重复`];
        level = "error";
        code = "D002";
        message = `高度疑似重复: 店铺名 [${a.shop_name}] 在同一活动重复报名，与 [${b.shop_id}] ${b.shop_name} 撞名，需要核实`;
      } else {
        const prodSim = productSetSimilarity(a.products, b.products);
        if (prodSim >= productSimilarityThreshold) {
          matched = true;
          strategy = "product_similarity";
          score = prodSim;
          evidence = [`商品名相似度: ${(prodSim * 100).toFixed(1)}% (阈值 ${(productSimilarityThreshold * 100).toFixed(0)}%)`];
          const nameSim = productNameSimilarity(a.shop_name, b.shop_name);
          if (nameSim > 0.5) evidence.push(`店铺名模糊匹配: ${(nameSim * 100).toFixed(1)}%`);
          if (sameActivity) evidence.push(`同活动报名: ${a.activity_id}`);
          level = "warn";
          code = "D003";
          message = `疑似重复: 商品高度相似(${ (prodSim * 100).toFixed(1)}%)，与 [${b.shop_id}] ${b.shop_name} 可能存在串货/盗图，建议人工复核`;
        } else if (a.shop_name === b.shop_name && !sameActivity) {
          matched = true;
          strategy = "shop_name_different_activity";
          score = 0.5;
          evidence = [`店铺名称相同: "${a.shop_name}"`, `活动不同: ${a.activity_id} vs ${b.activity_id}`];
          level = "warn";
          code = "D004";
          message = `店铺名相同但活动不同: [${a.shop_name}] 同时报 ${a.activity_id} 和 ${b.activity_id}，请确认是否允许`;
        }
      }

      if (matched) {
        const existing = matches.find(
          (m) => m.collide_with.shop_id === b.shop_id && m.strategy === strategy
        );
        if (existing) continue;

        const detail = buildMatchRecord(a, b, strategy, score, evidence);
        matches.push(detail);

        issues.push({
          code,
          level,
          message,
          detail,
        });
      }

      shopMatches.set(a.shop_id, matches);
    }
  }

  const shopIds = [...shopMatches.keys()];
  const results = shopIds.map((sid) => {
    const matches = shopMatches.get(sid) || [];
    const merchant = merchants.find((m) => m.shop_id === sid);
    const shopIssues = issues.filter(
      (i) => i.detail.current.shop_id === sid
    );

    const strongMatches = matches.filter((m) => m.score >= 0.9);
    const weakMatches = matches.filter((m) => m.score < 0.9);
    let passed = true;
    if (strongMatches.length > 0) passed = false;

    return {
      shop_id: sid,
      shop_name: merchant?.shop_name,
      check: "duplicate",
      passed,
      match_records: matches,
      strong_match_count: strongMatches.length,
      weak_match_count: weakMatches.length,
      issues: shopIssues,
    };
  });

  return { results, allIssues: issues, shopMatches: Object.fromEntries(shopMatches) };
}

module.exports = { findDuplicates, productNameSimilarity, productSetSimilarity };
