import { spawn } from "node:child_process";

const env = { ...process.env };

// Playwright 会为 worker 输出强制启用颜色；部分 harness shell 同时导出 NO_COLOR。
// 两者一起继承会让每个 worker 在测试前打印 Node warning，因此只移除冲突输入。
delete env.NO_COLOR;

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(pnpmBin, ["exec", "playwright", ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
