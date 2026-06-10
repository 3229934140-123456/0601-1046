const { checkQualification } = require("./qualification");
const { checkProductCount } = require("./product");
const { checkPrice } = require("./price");
const { checkImage } = require("./image");
const { findDuplicates } = require("./duplicate");
const { markRisk } = require("./risk");

const STATUS_PASS = "pass";
const STATUS_FAIL = "fail";
const STATUS_REVIEW = "review";

const REVIEW_CATEGORY_HIGH_RISK = "high_risk";
const REVIEW_CATEGORY_WATCH = "watch";
const REVIEW_CATEGORY_WEAK_DUPLICATE = "weak_duplicate";

const FAIL_CHECKS = ["qualification", "product_count", "price", "image"];

function generateRecordId(activityId, index) {
  const safeAct = (activityId || "UNK").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16);
  return `${safeAct}-REC-${String(index + 1).padStart(3, "0")}`;
}

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

  const activityId = merchants[0]?.activity_id;
  const recordStatuses = classifyByRecord(merchants, allResults, activityId);

  const checkStats = {
    total: allResults.length,
    passed: allResults.filter((r) => r.passed).length,
    failed: allResults.filter((r) => !r.passed).length,
  };

  return {
    results: allResults,
    duplicate: dupResult,
    checkStatistics: checkStats,
    recordStatuses,
  };
}

function classifyByRecord(merchants, allResults, activityId) {
  const byRecord = new Map();

  for (let idx = 0; idx < merchants.length; idx++) {
    const m = merchants[idx];
    byRecord.set(idx, {
      _idx: idx,
      record_id: generateRecordId(activityId, idx),
      shop_id: m.shop_id,
      shop_name: m.shop_name,
      activity_id: m.activity_id,
      category: m.category,
      shop_type: m.shop_type,
      credit_score: m.credit_score,
      product_count: m.products?.length || 0,
      checks: {},
      issues: [],
      match_records: [],
    });
  }

  for (const r of allResults) {
    for (const [idx, rec] of byRecord) {
      if (r.shop_id === rec.shop_id && r.shop_name === rec.shop_name) {
        rec.checks[r.check] = r.passed;
        if (r.issues && r.issues.length) rec.issues.push(...r.issues);
        if (r.match_records && r.match_records.length) rec.match_records.push(...r.match_records);
        break;
      }
    }
  }

  const statuses = [];
  for (const [, rec] of byRecord) {
    const classified = classifyOneRecord(rec);
    statuses.push({ ...rec, ...classified });
  }

  return statuses;
}

function classifyOneRecord(rec) {
  let hasHardFail = false;
  let needsReview = false;
  const failReasons = [];
  const reviewReasons = [];
  const reviewCategories = [];
  const collidesWith = [];

  for (const check of FAIL_CHECKS) {
    const passed = rec.checks[check];
    if (passed === false) {
      hasHardFail = true;
      const related = rec.issues.filter((i) => i.code && codeBelongsTo(i.code, check));
      failReasons.push({
        check,
        codes: [...new Set(related.map((i) => i.code).filter(Boolean))],
        message: related[0]?.message || `[${check}] 检查未通过`,
      });
    }
  }

  const dupIssues = rec.issues.filter((i) => i.code && i.code.startsWith("D"));
  for (const issue of dupIssues) {
    const code = issue.code;
    if (code === "D001" || code === "D002") {
      hasHardFail = true;
      failReasons.push({ check: "duplicate", codes: [code], message: issue.message });
    } else if (code === "D003" || code === "D004") {
      needsReview = true;
      reviewCategories.push(REVIEW_CATEGORY_WEAK_DUPLICATE);
      reviewReasons.push({
        category: REVIEW_CATEGORY_WEAK_DUPLICATE,
        check: "duplicate",
        codes: [code],
        message: issue.message,
      });
    }
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

  const riskIssues = rec.issues.filter((i) => i.code && i.code.startsWith("R"));
  for (const issue of riskIssues) {
    needsReview = true;
    const riskLvl = issue.detail?.risk_level;
    const cat = riskLvl === "high" ? REVIEW_CATEGORY_HIGH_RISK : REVIEW_CATEGORY_WATCH;
    reviewCategories.push(cat);
    reviewReasons.push({
      category: cat,
      check: "risk",
      codes: [issue.code],
      message: issue.message,
      risk_level: riskLvl,
    });
  }

  let status;
  if (hasHardFail) {
    status = STATUS_FAIL;
  } else if (needsReview) {
    status = STATUS_REVIEW;
  } else {
    status = STATUS_PASS;
  }

  return {
    status,
    fail_reasons: failReasons,
    review_reasons: reviewReasons,
    review_categories: [...new Set(reviewCategories)],
    collides_with: collidesWith,
  };
}

function codeBelongsTo(code, check) {
  const map = {
    Q: "qualification",
    P: "product_count",
    PR: "price",
    IMG: "image",
    D: "duplicate",
    R: "risk",
  };
  const prefix = code.replace(/\d.*/, "");
  return map[prefix] === check;
}

module.exports = {
  runAllChecks,
  classifyByRecord,
  classifyOneRecord,
  generateRecordId,
  STATUS_PASS,
  STATUS_FAIL,
  STATUS_REVIEW,
  REVIEW_CATEGORY_HIGH_RISK,
  REVIEW_CATEGORY_WATCH,
  REVIEW_CATEGORY_WEAK_DUPLICATE,
};
