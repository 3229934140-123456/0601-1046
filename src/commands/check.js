const { saveJson } = require("../utils/file");
const { initEnvironment, loadFilteredMerchants } = require("../utils/environment");
const { runAllChecks, STATUS_PASS, STATUS_FAIL, STATUS_REVIEW } = require("../core/workflow");

function runCheck(options) {
  const { config, reportDir, activityId, activityName, logger } = initEnvironment(options);
  const { merchants, filtered } = loadFilteredMerchants(options.data, activityId);
  const rules = config.rules || {};

  if (activityId) {
    logger.info(`按活动ID过滤商家`, {
      activity_id: activityId,
      total: merchants.length,
      matched: filtered.length,
    });
  }

  logger.info("开始商家资料检查", { total: filtered.length, activity_id: activityId });
  const pipeline = runAllChecks(filtered, rules, logger);

  const counts = {
    [STATUS_PASS]: 0,
    [STATUS_FAIL]: 0,
    [STATUS_REVIEW]: 0,
  };
  for (const s of pipeline.shopStatuses) counts[s.status]++;

  logger.info("检查完成", {
    activity_id: activityId,
    pass: counts[STATUS_PASS],
    fail: counts[STATUS_FAIL],
    review: counts[STATUS_REVIEW],
  });

  const summary = {
    activity: { ...(config.activity || {}), id: activityId, name: activityName },
    timestamp: new Date().toISOString(),
    check_statistics: pipeline.checkStatistics,
    audit_statistics: {
      total: filtered.length,
      pass: counts[STATUS_PASS],
      fail: counts[STATUS_FAIL],
      review: counts[STATUS_REVIEW],
    },
    results: pipeline.results,
    shopStatuses: pipeline.shopStatuses,
  };

  if (options.output) {
    saveJson(options.output, summary);
    logger.info(`检查结果已保存: ${options.output}`);
  } else {
    const defaultPath = require("path").join(reportDir, "check-result.json");
    saveJson(defaultPath, summary);
    logger.info(`检查结果已保存: ${defaultPath}`);
  }

  printCheckSummary(summary);
  return summary;
}

function statusIcon(status) {
  return status === STATUS_PASS ? "✅" : status === STATUS_FAIL ? "❌" : "🔍";
}
function statusText(status) {
  return status === STATUS_PASS ? "通过" : status === STATUS_FAIL ? "未通过" : "待复核";
}

function printCheckSummary(summary) {
  const s = summary.audit_statistics;
  const cs = summary.check_statistics;

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                  商家资料检查结果摘要                        ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  活动: ${padEnd(summary.activity?.name || "-", 35)}${padEnd("ID: " + (summary.activity?.id || "-"), 23)}║`);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  细项检查: 总${pad(cs.total, 4)}  过${pad(cs.passed, 4)}  没${pad(cs.failed, 4)}  审核: 通过${pad(s.pass,3)}  未通${pad(s.fail,3)}  复核${pad(s.review,3)}   ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  for (const shop of summary.shopStatuses) {
    const icon = statusIcon(shop.status);
    console.log(`${icon} [${shop.shop_id}] ${shop.shop_name} — ${statusText(shop.status)}`);

    for (const [checkName, passed] of Object.entries(shop.checks || {})) {
      const m = passed ? "  ✅" : "  ❌";
      console.log(`${m} ${checkName}`);
      const related = shop.issues.filter((i) => i.code && relatedToCheck(i.code, checkName));
      for (const issue of related) {
        const t = issue.level === "error" ? "    ✖" : "    ⚠";
        console.log(`${t} [${issue.code}] ${issue.message}`);
      }
    }

    if (shop.collides_with && shop.collides_with.length > 0) {
      for (const c of shop.collides_with) {
        console.log(`    💥 与 [${c.collide_with.shop_id}] ${c.collide_with.shop_name} 碰撞 (${c.strategy} / 分数 ${(c.score * 100).toFixed(0)}%)`);
        for (const e of c.evidence) {
          console.log(`       · 证据: ${e}`);
        }
      }
    }
    console.log("");
  }
}

function relatedToCheck(code, check) {
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

function pad(n, len) { return String(n).padStart(len, " "); }
function padEnd(s, len) { return String(s).padEnd(len); }

module.exports = { runCheck, statusIcon, statusText, pad, padEnd, relatedToCheck };
