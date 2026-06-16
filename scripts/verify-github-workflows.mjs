import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";

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

function formatYamlError(relativePath, error) {
  const line = error.linePos?.[0]?.line;
  const column = error.linePos?.[0]?.col;
  const location = line ? `:${line}${column ? `:${column}` : ""}` : "";
  return `${relativePath}${location} workflow YAML must be parseable: ${error.message}`;
}

function checkWorkflowSyntax(filePath) {
  const relativePath = path.relative(repoRoot, filePath).split(path.sep).join("/");
  const content = fs.readFileSync(filePath, "utf8");
  const document = parseDocument(content, { prettyErrors: false });
  return document.errors.map((error) => formatYamlError(relativePath, error));
}

function checkWorkflowActionPins(filePath) {
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

function checkWorkflowNodeVersionFile(filePath) {
  const relativePath = path.relative(repoRoot, filePath).split(path.sep).join("/");
  const lines = fs.readFileSync(filePath, "utf8").split(/\n/);
  const failures = [];

  for (const [index, line] of lines.entries()) {
    if (!/uses:\s*actions\/setup-node@/.test(line)) continue;

    const blockIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
    const followingBlock = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextLine = lines[cursor];
      if (nextLine.trim() && (nextLine.match(/^(\s*)/)?.[1].length ?? 0) < blockIndent) break;
      followingBlock.push(nextLine);
    }

    const blockText = followingBlock.join("\n");
    if (/^\s*node-version:/m.test(blockText)) {
      failures.push(`${relativePath}:${index + 1} setup-node must read .node-version via node-version-file, not node-version`);
    }
    if (!/^\s*node-version-file:\s*\.node-version\s*$/m.test(blockText)) {
      failures.push(`${relativePath}:${index + 1} setup-node must include node-version-file: .node-version`);
    }
  }

  return failures;
}

const workflowFiles = collectWorkflowFiles(workflowsDir);
const failures = workflowFiles.flatMap((filePath) => [
  ...checkWorkflowSyntax(filePath),
  ...checkWorkflowActionPins(filePath),
  ...checkWorkflowNodeVersionFile(filePath),
]);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("GitHub workflow syntax and action pins verified.");
