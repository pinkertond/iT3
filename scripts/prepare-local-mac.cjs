const { execFileSync } = require("node:child_process");
const path = require("node:path");
const prepareServerCache = require("./prepare-server-compile-cache.cjs");

module.exports = async (context) => {
  await prepareServerCache(context);
  const app = path.join(context.appOutDir, context.packager.appInfo.productFilename + ".app");
  execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", "--timestamp=none", app]);
  execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
};
