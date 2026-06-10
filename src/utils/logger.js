const fs = require("fs");
const path = require("path");

class Logger {
  constructor(logDir) {
    this.logDir = logDir || "./logs";
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    this.logFile = path.join(
      this.logDir,
      `audit-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.log`
    );
    this.entries = [];
  }

  _timestamp() {
    return new Date().toISOString();
  }

  _write(level, message, data) {
    const entry = {
      timestamp: this._timestamp(),
      level,
      message,
      data: data || null,
    };
    this.entries.push(entry);
    const line = `[${entry.timestamp}] [${level}] ${message}${data ? " | " + JSON.stringify(data) : ""}\n`;
    fs.appendFileSync(this.logFile, line, "utf-8");
    return entry;
  }

  info(message, data) {
    return this._write("INFO", message, data);
  }

  warn(message, data) {
    return this._write("WARN", message, data);
  }

  error(message, data) {
    return this._write("ERROR", message, data);
  }

  success(message, data) {
    return this._write("OK", message, data);
  }

  getEntries() {
    return this.entries;
  }

  getLogFile() {
    return this.logFile;
  }

  exportLog(outputPath) {
    const content = JSON.stringify(this.entries, null, 2);
    fs.writeFileSync(outputPath, content, "utf-8");
    return outputPath;
  }
}

module.exports = Logger;
