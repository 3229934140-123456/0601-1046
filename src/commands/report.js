const { loadConfig, loadMerchants, saveJson, ensureDir } = require("../utils/file");
const { runCheck } = require("./check");
const { generateSuggestions } = require("../core/suggestion");
const { fillRemarks } = require("../core/remark");
const Logger = require("../utils/logger");

function runReport(options) {
  const config = loadConfig(options.config);
  const merchants = loadMerchants(options.data);
  const logger = new Logger(config.output?.log_dir);
  const reportDir = config.output?.report_dir || "./reports";
  ensureDir(reportDir);

  logger.info("开始生成完整报告");

  const checkResult = runCheck({ ...options, output: null });
  const suggestions = generateSuggestions(checkResult.results);
  const { merchants: updatedMerchants, filledCount } = fillRemarks(merchants, checkResult.results);

  const passList = [];
  const failList = [];

  const shopMap = new Map();
  for (const m of merchants) {
    shopMap.set(m.shop_id, {
      shop_id: m.shop_id,
      shop_name: m.shop_name,
      category: m.category,
      shop_type: m.shop_type,
      credit_score: m.credit_score,
      product_count: m.products?.length || 0,
      checks: {},
      issues: [],
      suggestions: [],
      passed_all: true,
    });
  }

  for (const r of checkResult.results) {
    const entry = shopMap.get(r.shop_id);
    if (!entry) continue;
    entry.checks[r.check] = r.passed;
    if (!r.passed) {
      entry.passed_all = false;
      entry.issues.push(
        ...(r.issues || []).map((i) => ({
          check: r.check,
          code: i.code,
          level: i.level,
          message: i.message,
        }))
      );
    }
  }

  for (const s of suggestions) {
    const entry = shopMap.get(s.shop_id);
    if (entry) entry.suggestions.push(s.suggestion);
  }

  for (const [, shop] of shopMap) {
    if (shop.passed_all) {
      passList.push({
        shop_id: shop.shop_id,
        shop_name: shop.shop_name,
        category: shop.category,
        shop_type: shop.shop_type,
        credit_score: shop.credit_score,
        product_count: shop.product_count,
      });
    } else {
      failList.push({
        shop_id: shop.shop_id,
        shop_name: shop.shop_name,
        category: shop.category,
        shop_type: shop.shop_type,
        credit_score: shop.credit_score,
        product_count: shop.product_count,
        issues: shop.issues,
        suggestions: shop.suggestions,
      });
    }
  }

  const report = {
    activity: config.activity,
    generated_at: new Date().toISOString(),
    summary: {
      total: merchants.length,
      passed: passList.length,
      failed: failList.length,
      pass_rate: ((passList.length / merchants.length) * 100).toFixed(1) + "%",
    },
    pass_list: passList,
    fail_list: failList,
    all_suggestions: suggestions,
    remark_filled_count: filledCount,
  };

  saveJson(`${reportDir}/full-report.json`, report);
  logger.info("完整报告已保存");

  saveJson(`${reportDir}/pass-list.json`, { activity: config.activity, generated_at: report.generated_at, count: passList.length, list: passList });
  logger.info(`通过名单已保存: ${passList.length} 家`);

  saveJson(`${reportDir}/fail-reasons.json`, { activity: config.activity, generated_at: report.generated_at, count: failList.length, list: failList });
  logger.info(`失败原因已保存: ${failList.length} 家`);

  saveJson(`${reportDir}/merchants-updated.json`, updatedMerchants);
  logger.info("更新后商家数据已保存");

  const logPath = logger.exportLog(`${reportDir}/operation-log.json`);
  logger.info(`操作日志已保存: ${logPath}`);

  printReportSummary(report);

  return report;
}

function printReportSummary(report) {
  const { summary, pass_list, fail_list } = report;
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                审核报告 - 最终结果                        ║");
  console.log("╠════════════════════════════════════════════════════════════╣");
  console.log(`║  活动名称: ${padEnd(report.activity?.name || "-", 46)}║`);
  console.log(`║  活动编号: ${padEnd(report.activity?.id || "-", 46)}║`);
  console.log(`║  总商家数: ${pad(String(summary.total), 4)}  通过: ${pad(String(summary.passed), 4)}  未通过: ${pad(String(summary.failed), 4)}  通过率: ${padEnd(summary.pass_rate, 6)}║`);
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  console.log("✅ 通过商家名单:");
  if (pass_list.length === 0) {
    console.log("  (无)");
  } else {
    for (const p of pass_list) {
      console.log(`  ✅ [${p.shop_id}] ${p.shop_name} (${p.category}) - 信用${p.credit_score} | ${p.product_count}件商品`);
    }
  }

  console.log("\n❌ 未通过商家名单及原因:");
  if (fail_list.length === 0) {
    console.log("  (无)");
  } else {
    for (const f of fail_list) {
      console.log(`  ❌ [${f.shop_id}] ${f.shop_name} (${f.category})`);
      for (const issue of f.issues) {
        const tag = issue.level === "error" ? "✖" : "⚠";
        console.log(`     ${tag} [${issue.code}] ${issue.message}`);
      }
      if (f.suggestions.length > 0) {
        console.log("     💡 修改建议:");
        for (const s of f.suggestions.slice(0, 3)) {
          console.log(`        → ${s}`);
        }
        if (f.suggestions.length > 3) {
          console.log(`        → ... 还有 ${f.suggestions.length - 3} 条`);
        }
      }
    }
  }

  console.log("\n📄 已导出文件:");
  console.log("  ├── full-report.json       (完整报告)");
  console.log("  ├── pass-list.json         (通过名单)");
  console.log("  ├── fail-reasons.json      (失败原因)");
  console.log("  ├── merchants-updated.json (更新后商家数据)");
  console.log("  ├── suggestions.json       (修改建议)");
  console.log("  └── operation-log.json     (操作日志)");
  console.log("");
}

function pad(n, len) {
  return String(n).padStart(len, " ");
}

function padEnd(s, len) {
  return String(s).padEnd(len);
}

module.exports = { runReport };
