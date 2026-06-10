#!/usr/bin/env node

const { Command } = require("commander");
const path = require("path");
const { runCheck } = require("./commands/check");
const { runFix } = require("./commands/fix");
const { runPreview } = require("./commands/preview");
const { runReport } = require("./commands/report");

const program = new Command();

program
  .name("mat")
  .description("电商运营平台自动化工具 - 批量检查商家报名活动资料")
  .version("1.0.0");

program
  .command("check")
  .description("检查商家报名资料，输出检查结果")
  .option("-c, --config <path>", "配置文件路径", "./config.yaml")
  .option("-d, --data <path>", "商家数据文件路径", "./data/sample-merchants.json")
  .option("-o, --output <path>", "检查结果输出路径")
  .option("-a, --activity-id <id>", "指定活动ID，覆盖配置中的默认活动ID")
  .option("--output-dir <dir>", "指定输出根目录，分活动目录产出报告和日志", "./")
  .action((opts) => {
    try {
      runCheck(opts);
    } catch (err) {
      console.error("检查失败:", err.message);
      process.exit(1);
    }
  });

program
  .command("fix")
  .description("修正商家资料，生成修改建议并批量补全备注")
  .option("-c, --config <path>", "配置文件路径", "./config.yaml")
  .option("-d, --data <path>", "商家数据文件路径", "./data/sample-merchants.json")
  .option("--save-data", "保存修正后的商家数据", false)
  .option("-a, --activity-id <id>", "指定活动ID，覆盖配置中的默认活动ID")
  .option("--output-dir <dir>", "指定输出根目录，分活动目录产出报告和日志", "./")
  .action((opts) => {
    try {
      runFix(opts);
    } catch (err) {
      console.error("修正失败:", err.message);
      process.exit(1);
    }
  });

program
  .command("preview")
  .description("预览检查结果，不写入文件")
  .option("-c, --config <path>", "配置文件路径", "./config.yaml")
  .option("-d, --data <path>", "商家数据文件路径", "./data/sample-merchants.json")
  .option("-a, --activity-id <id>", "指定活动ID，覆盖配置中的默认活动ID")
  .option("--output-dir <dir>", "指定输出根目录，分活动目录产出报告和日志", "./")
  .action((opts) => {
    try {
      runPreview(opts);
    } catch (err) {
      console.error("预览失败:", err.message);
      process.exit(1);
    }
  });

program
  .command("report")
  .description("生成完整审核报告，导出通过名单和失败原因")
  .option("-c, --config <path>", "配置文件路径", "./config.yaml")
  .option("-d, --data <path>", "商家数据文件路径", "./data/sample-merchants.json")
  .option("-a, --activity-id <id>", "指定活动ID，覆盖配置中的默认活动ID")
  .option("--output-dir <dir>", "指定输出根目录，分活动目录产出报告和日志", "./")
  .option("--resume <path>", "从上次导出的 review-tracker.json 恢复复核进度，保留人工处理状态")
  .action((opts) => {
    try {
      runReport(opts);
    } catch (err) {
      console.error("报告生成失败:", err.message);
      process.exit(1);
    }
  });

program.parse();
