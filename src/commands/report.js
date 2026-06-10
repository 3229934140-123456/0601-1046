const { saveJson } = require("../utils/file");
const { initEnvironment, loadFilteredMerchants } = require("../utils/environment");
const { runAllChecks, STATUS_PASS, STATUS_FAIL, STATUS_REVIEW } = require("../core/workflow");
const { generateSuggestions } = require("../core/suggestion");
const { fillRemarks } = require("../core/remark");
const { statusIcon, statusText, pad, padEnd } = require("./check");

function shopBase(shop) {
  return {
    shop_id: shop.shop_id,
    shop_name: shop.shop_name,
    category: shop.category,
    shop_type: shop.shop_type,
    credit_score: shop.credit_score,
    product_count: shop.product_count,
  };
}

function buildCollisions(shop) {
  if (!shop.collides_with || shop.collides_with.length === 0) return [];
  return shop.collides_with.map((c) => ({
    code: c.code,
    strategy: c.strategy,
    score: c.score,
    collide_with: c.collide_with,
    evidence: c.evidence,
  }));
}

function runReport(options) {
  const { config, reportDir, activityId, activityName, logger } = initEnvironment(options);
  const { merchants, filtered } = loadFilteredMerchants(options.data, activityId);
  const rules = config.rules || {};
  const total = filtered.length;

  logger.info("开始生成完整报告", { total, activity_id: activityId });
  const pipeline = runAllChecks(filtered, rules, logger);
  const suggestions = generateSuggestions(pipeline.results);
  const { merchants: updatedMerchants, filledCount } = fillRemarks(filtered, pipeline.results);

  const passList = [];
  const failList = [];
  const reviewList = [];

  for (const shop of pipeline.shopStatuses) {
    const base = shopBase(shop);
    const issues = (shop.issues || []).map((i) => ({
      code: i.code,
      level: i.level,
      message: i.message,
      detail: i.detail ? cleanDetail(i.detail) : undefined,
    }));
    const snippets = suggestions.filter((s) => s.shop_id === shop.shop_id).map((s) => s.suggestion);
    const collisions = buildCollisions(shop);

    if (shop.status === STATUS_PASS) {
      passList.push({ ...base, verified_at: new Date().toISOString() });
    } else if (shop.status === STATUS_FAIL) {
      failList.push({
        ...base,
        issues,
        collisions,
        suggestions: snippets,
        fail_reasons: shop.fail_reasons || [],
      });
    } else {
      reviewList.push({
        ...base,
        issues,
        collisions,
        suggestions: snippets,
        review_reasons: shop.review_reasons || [],
      });
    }
  }

  const report = {
    activity: { ...(config.activity || {}), id: activityId, name: activityName },
    generated_at: new Date().toISOString(),
    summary: {
      total,
      passed: passList.length,
      failed: failList.length,
      review: reviewList.length,
      pass_rate: ((passList.length / Math.max(1, total)) * 100).toFixed(1) + "%",
    },
    pass_list: passList,
    fail_list: failList,
    review_list: reviewList,
    all_suggestions: suggestions,
    remark_filled_count: filledCount,
  };

  saveJson(`${reportDir}/full-report.json`, report);
  logger.info("完整报告已保存");

  saveJson(`${reportDir}/pass-list.json`, buildExport("pass", activityId, activityName, passList));
  logger.info(`通过名单已保存: ${passList.length} 家`);

  saveJson(`${reportDir}/fail-reasons.json`, buildExport("fail", activityId, activityName, failList));
  logger.info(`失败原因已保存: ${failList.length} 家`);

  saveJson(`${reportDir}/review-list.json`, buildExport("review", activityId, activityName, reviewList));
  logger.info(`待复核名单已保存: ${reviewList.length} 家`);

  saveJson(`${reportDir}/merchants-updated.json`, updatedMerchants);
  logger.info("更新后商家数据已保存");

  const sugPath = `${reportDir}/suggestions.json`;
  saveJson(sugPath, suggestions);
  logger.info(`修改建议已保存: ${suggestions.length} 条`);

  const logPath = logger.exportLog(`${reportDir}/operation-log.json`);
  logger.info(`操作日志已保存: ${logPath}`);

  printReportSummary(report);
  return report;
}

function cleanDetail(detail) {
  if (!detail) return undefined;
  try {
    return JSON.parse(JSON.stringify(detail));
  } catch {
    return undefined;
  }
}

function buildExport(kind, activityId, activityName, list) {
  return {
    activity: { id: activityId, name: activityName },
    generated_at: new Date().toISOString(),
    kind,
    count: list.length,
    list,
  };
}

function printReportSummary(report) {
  const s = report.summary;
  const act = report.activity;

  console.log("\n╔══════════════════════════════════════════════════════════════════╗");
  console.log("║                  审核报告 - 最终结果                              ║");
  console.log("╠══════════════════════════════════════════════════════════════════╣");
  console.log(`║  活动名称: ${padEnd(act?.name || "-", 55)}║`);
  console.log(`║  活动编号: ${padEnd(act?.id || "-", 55)}║`);
  console.log(`║  总商家数: ${pad(s.total, 4)}  ✅通过: ${pad(s.passed, 3)}  ❌未通: ${pad(s.failed, 3)}  🔍复核: ${pad(s.review, 3)}  通过率: ${padEnd(s.pass_rate, 6)}║`);
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");

  printList("✅ 通过商家名单", report.pass_list, (p) => {
    console.log(`  ✅ [${p.shop_id}] ${p.shop_name} (${p.category}) - 信用${p.credit_score} | ${p.product_count}件商品`);
  });

  printList("❌ 未通过商家及原因", report.fail_list, (f) => {
    console.log(`  ❌ [${f.shop_id}] ${f.shop_name} (${f.category})`);
    for (const issue of f.issues) {
      const tag = issue.level === "error" ? "✖" : "⚠";
      console.log(`     ${tag} [${issue.code}] ${issue.message}`);
    }
    printCollisions(f.collisions);
    printSuggestions(f.suggestions);
  });

  printList("🔍 待人工复核商家", report.review_list, (r) => {
    console.log(`  🔍 [${r.shop_id}] ${r.shop_name} (${r.category})`);
    for (const rr of r.review_reasons) {
      console.log(`     📋 原因: ${rr.message}`);
    }
    for (const issue of r.issues) {
      const tag = issue.level === "error" ? "✖" : "⚠";
      console.log(`     ${tag} [${issue.code}] ${issue.message}`);
    }
    printCollisions(r.collisions);
    printSuggestions(r.suggestions);
  });

  console.log("\n📄 已导出文件 (活动目录):");
  console.log("  ├── full-report.json       (完整报告)");
  console.log("  ├── pass-list.json         (通过名单)");
  console.log("  ├── fail-reasons.json      (失败原因)");
  console.log("  ├── review-list.json       (待复核名单)");
  console.log("  ├── merchants-updated.json (更新后商家数据)");
  console.log("  ├── suggestions.json       (修改建议)");
  console.log("  ├── check-result.json      (检查明细)");
  console.log("  └── operation-log.json     (操作日志)");
  console.log("");
}

function printList(title, list, render) {
  console.log(`${title}:`);
  if (list.length === 0) {
    console.log("  (无)");
  } else {
    for (const item of list) {
      render(item);
    }
  }
  console.log("");
}

function printCollisions(collisions) {
  if (!collisions || collisions.length === 0) return;
  console.log("     💥 碰撞记录:");
  for (const c of collisions) {
    console.log(`        · 与 [${c.collide_with.shop_id}] ${c.collide_with.shop_name} 相撞 (${c.strategy} / ${(c.score * 100).toFixed(0)}%)`);
    for (const e of c.evidence || []) {
      console.log(`          证据: ${e}`);
    }
  }
}

function printSuggestions(suggestions) {
  if (!suggestions || suggestions.length === 0) return;
  console.log("     💡 修改建议:");
  for (const s of suggestions.slice(0, 3)) {
    console.log(`        → ${s}`);
  }
  if (suggestions.length > 3) {
    console.log(`        → ... 还有 ${suggestions.length - 3} 条，详见 suggestions.json`);
  }
}

module.exports = { runReport };
