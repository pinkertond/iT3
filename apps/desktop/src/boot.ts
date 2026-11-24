// Packaged iT3 owns its server state and is upgraded through versioned installers.
if (require("node:os").platform() === "darwin") {
  process.env.T3CODE_HOME ??= require("node:path").join(require("node:os").homedir(), ".it3");
  process.env.T3CODE_DISABLE_AUTO_UPDATE = "true";
}
require("./compileCache.cjs");
require("./main.cjs");
