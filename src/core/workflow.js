const { checkQualification } = require("./qualification");
const { checkProductCount } = require("./product");
const { checkPrice } = require("./price");
const { checkImage } = require("./image");
const { findDuplicates } = require("./duplicate");
const { markRisk } = require("./risk");

const STATUS_PASS = "pass";
const STATUS_FAIL = "fail";
const STATUS_REVIEW = "review";

const FAIL_CHECKS = ["qualification", "product_count", "price", "image"];

function runAllChecks(merchants, rules, logger) {
  const allResults = [];

  const checkFunctions = [
    { fn: checkQualification, name: "资质校验" },
    { fn: checkProductCount, name: "商品数量" },
    { fn: checkPrice, name: "价格区间" },
    { fn: checkImage, name: "图片检查" },
    { fn: markRisk, name: "风险标记" },
  ];

  for (const merchant of merchants) {
    for (const { fn, name } of checkFunctions) {
      const result = fn(merchant, rules);
      allResults.push(result);
      if (logger) {
        if (result.passed) {
          logger.success(`[${merchant.shop_name}] ${name} 通过`);
        } else {
          for (const issue of result.issues) {
            logger.warn(`[${merchant.shop_name}] ${name} - ${issue.message}`);
          }
        }
      }
    }
  }

  const dupResult = findDuplicates(merchants, rules);
  for (const r of dupResult.results) {
    allResults.push(r);
    if (logger && !r.passed) {
      for (const issue of r.issues) {
        logger.warn(`[${r.shop_name}] 重复报名 - ${issue.message}`);
      }
    }
  }
  if (logger) {
    for (const issue of dupResult.allIssues) {
      logger.error("重复报名检测", { message: issue.message });
    }
  }

  const shopStatuses = classifyAll(merchants, allResults, dupResult);

  const checkStats = {
    total: allResults.length,
    passed: allResults.filter((r) => r.passed).length,
    failed: allResults.filter((r) => !r.passed).length,
  };

  return {
    results: allResults,
    duplicate: dupResult,
    checkStatistics: checkStats,
    shopStatuses,
  };
}

function classifyAll(merchants, allResults, dupResult) {
  const byShop = new Map();

  for (const r of allResults) {
    if (!byShop.has(r.shop_id)) {
      const m = merchants.find((mm) => mm.shop_id === r.shop_id);
      byShop.set(r.shop_id, {
        shop_id: r.shop_id,
        shop_name: r.shop_name || m?.shop_name,
        category: m?.category,
        shop_type: m?.shop_type,
        credit_score: m?.credit_score,
        product_count: m?.products?.length || 0,
        checks: {},
        issues: [],
        match_records: [],
        review_reasons: [],
        fail_reasons: [],
      });
    }
    const entry = byShop.get(r.shop_id);
    entry.checks[r.check] = r.passed;
    if (r.issues && r.issues.length) entry.issues.push(...r.issues);
    if (r.match_records && r.match_records.length) entry.match_records.push(...r.match_records);
  }

  const statuses = [];
  for (const [, shop] of byShop) {
    const s = classifyOne(shop);
    statuses.push({ ...shop, ...s });
  }

  return statuses;
}

function classifyOne(shop) {
  let hasHardFail = false;
  let needsReview = false;
  const failReasons = [];
  const reviewReasons = [];
  const collidesWith = [];

  for (const check of FAIL_CHECKS) {
    const passed = shop.checks[check];
    if (passed === false) {
      hasHardFail = true;
      const relatedIssues = shop.issues.filter(
        (i) =>
          (i.check === check) ||
          (FAIL_CHECKS.includes(check) && i.detail && relatedToCheck(i, check))
      );
      const issueCodes = relatedIssues.map((i) => i.code).filter(Boolean);
      failReasons.push({
        check,
        codes: [...new Set(issueCodes)],
        message: relatedIssues[0]?.message || `[${check}] 检查未通过`,
      });
    }
  }

  const dupIssues = shop.issues.filter((i) => i.code && i.code.startsWith("D"));
  for (const issue of dupIssues) {
    const code = issue.code;
    if (code === "D001" || code === "D002") {
      hasHardFail = true;
      failReasons.push({
        check: "duplicate",
        codes: [code],
        message: issue.message,
      });
      if (issue.detail?.collide_with) {
        collidesWith.push({
          code,
          score: issue.detail.score,
          strategy: issue.detail.strategy,
          collide_with: issue.detail.collide_with,
          evidence: issue.detail.evidence || [],
        });
      }
    } else if (code === "D003" || code === "D004") {
      needsReview = true;
      reviewReasons.push({
        check: "duplicate",
        codes: [code],
        message: issue.message,
      });
      if (issue.detail?.collide_with) {
        collidesWith.push({
          code,
          score: issue.detail.score,
          strategy: issue.detail.strategy,
          collide_with: issue.detail.collide_with,
          evidence: issue.detail.evidence || [],
        });
      }
    }
  }

  const riskIssues = shop.issues.filter((i) => i.code && i.code.startsWith("R"));
  for (const issue of riskIssues) {
    needsReview = true;
    reviewReasons.push({
      check: "risk",
      codes: [issue.code],
      message: issue.message,
      risk_level: issue.detail?.risk_level,
    });
  }

  if (!hasHardFail && needsReview) {
    return {
      status: STATUS_REVIEW,
      fail_reasons: failReasons,
      review_reasons: reviewReasons,
      collides_with: collidesWith,
    };
  }
  if (hasHardFail) {
    return {
      status: STATUS_FAIL,
      fail_reasons: failReasons,
      review_reasons: reviewReasons,
      collides_with: collidesWith,
    };
  }
  return {
    status: STATUS_PASS,
    fail_reasons: [],
    review_reasons: [],
    collides_with: collidesWith,
  };
}

function relatedToCheck(issue, check) {
  if (!issue.code) return false;
  const map = {
    Q: "qualification",
    P: "product_count",
    PR: "price",
    IMG: "image",
    D: "duplicate",
    R: "risk",
  };
  const prefix = issue.code.replace(/\d.*/, "");
  return map[prefix] === check;
}

module.exports = {
  runAllChecks,
  classifyAll,
  classifyOne,
  STATUS_PASS,
  STATUS_FAIL,
  STATUS_REVIEW,
};
