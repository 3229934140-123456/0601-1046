const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function loadConfig(configPath) {
  const resolved = path.resolve(configPath || "./config.yaml");
  if (!fs.existsSync(resolved)) {
    throw new Error(`配置文件不存在: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, "utf-8");
  return yaml.load(raw);
}

function loadMerchants(dataPath) {
  const resolved = path.resolve(dataPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`商家数据文件不存在: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, "utf-8");
  return JSON.parse(raw);
}

function saveJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  return filePath;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

module.exports = { loadConfig, loadMerchants, saveJson, ensureDir };
