const { loadConfig, loadMerchants } = require("../utils/file");
const { runCheck } = require("./check");
const { generateSuggestions } = require("../core/suggestion");
const { fillRemarks } = require("../core/remark");
const Logger = require("../utils/logger");

function runPreview(options) {
  const config = loadConfig(options.config);
  const merchants = loadMerchants(options.data);
  const logger = new Logger(config.output?.log_dir);

  logger.info("开始预览（不写入文件）");

  const checkResult = runCheck({ ...options, output: null });
  const suggestions = generateSuggestions(checkResult.results);
  const { merchants: updatedMerchants, filledCount } = fillRemarks(merchants, checkResult.results);

  const shopResults = new Map();
  for (const m of merchants) {
    shopResults.set(m.shop_id, {
      shop_id: m.shop_id,
      shop_name: m.shop_name,
      category: m.category,
      products: m.products?.length || 0,
      checks: { passed: 0, failed: 0 },
      issues: [],
      suggestion_count: 0,
      will_pass: true,
    });
  }

  for (const r of checkResult.results) {
    const entry = shopResults.get(r.shop_id);
    if (!entry) continue;
    if (r.passed) {
      entry.checks.passed++;
    } else {
      entry.checks.failed++;
      entry.will_pass = false;
      entry.issues.push(...(r.issues || []));
    }
  }

  for (const s of suggestions) {
    const entry = shopResults.get(s.shop_id);
    if (entry) entry.suggestion_count++;
  }

  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║                    预览模式 - 不会写入文件                    ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  let passCount = 0;
  let failCount = 0;

  for (const [shopId, info] of shopResults) {
    const icon = info.will_pass ? "✅" : "❌";
    if (info.will_pass) passCount++;
    else failCount++;

    console.log(`${icon} [${shopId}] ${info.shop_name} (${info.category}) - ${info.products}件商品`);
    console.log(`   检查: ${info.checks.passed}通过 / ${info.checks.failed}未通过 | 建议: ${info.suggestion_count}条`);

    if (info.issues.length > 0) {
      for (const issue of info.issues.slice(0, 3)) {
        const tag = issue.level === "error" ? "✖" : "⚠";
        console.log(`   ${tag} ${issue.message}`);
      }
      if (info.issues.length > 3) {
        console.log(`   ... 还有 ${info.issues.length - 3} 条问题`);
      }
    }

    const m = updatedMerchants.find((u) => u.shop_id === shopId);
    if (m && m.remark) {
      console.log(`   备注: ${m.remark}`);
    }
    console.log("");
  }

  console.log("─────────────────────────────────────────────────");
  console.log(`预览汇总: 通过 ${passCount} 家 / 未通过 ${failCount} 家 / 共 ${merchants.length} 家`);
  console.log(`修改建议: ${suggestions.length} 条 | 补全备注: ${filledCount} 家`);
  console.log("─────────────────────────────────────────────────\n");
  console.log("提示: 运行 check 命令查看详细检查结果");
  console.log("      运行 fix 命令执行修正并保存");
  console.log("      运行 report 命令生成完整报告\n");

  logger.info("预览完成");

  return { passCount, failCount, suggestions, updatedMerchants };
}

module.exports = { runPreview };
