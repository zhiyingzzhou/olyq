import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const workflowsDir = path.join(repoRoot, ".github", "workflows");
const actionUsePattern = /^(\s*)uses:\s*([^#\s]+)(?:\s+#\s*(.+))?\s*$/;
const fullShaPattern = /^[0-9a-f]{40}$/;

function collectWorkflowFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectWorkflowFiles(absolutePath);
    if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) return [];
    return [absolutePath];
  });
}

function checkWorkflowFile(filePath) {
  const relativePath = path.relative(repoRoot, filePath).split(path.sep).join("/");
  const lines = fs.readFileSync(filePath, "utf8").split(/\n/);
  const failures = [];

  for (const [index, line] of lines.entries()) {
    const match = line.match(actionUsePattern);
    if (!match) continue;

    const spec = match[2];
    if (spec.startsWith("docker://") || spec.startsWith("./") || spec.startsWith("../")) continue;

    const atIndex = spec.lastIndexOf("@");
    if (atIndex < 0) {
      failures.push(`${relativePath}:${index + 1} action reference must include an @sha pin: ${spec}`);
      continue;
    }

    const ref = spec.slice(atIndex + 1);
    if (!fullShaPattern.test(ref)) {
      failures.push(`${relativePath}:${index + 1} action reference must use a full 40-character commit SHA: ${spec}`);
    }

    const versionComment = String(match[3] || "").trim();
    if (!/^v?[0-9][0-9A-Za-z._-]*$/.test(versionComment)) {
      failures.push(`${relativePath}:${index + 1} pinned action must retain a version comment such as "# v4": ${spec}`);
    }
  }

  return failures;
}

const failures = collectWorkflowFiles(workflowsDir).flatMap(checkWorkflowFile);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("GitHub workflow action pins verified.");
