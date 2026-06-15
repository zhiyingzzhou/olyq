const requiredMajor = 22;
const actual = process.versions.node;
const actualMajor = Number.parseInt(actual.split('.')[0] ?? '', 10);

if (actualMajor !== requiredMajor) {
  console.error(
    `Olyq verification requires Node.js ${requiredMajor}.x to match GitHub Actions. Current Node.js: ${actual}.`,
  );
  console.error('Switch to the version declared in .node-version / .nvmrc before running pnpm commands.');
  process.exit(1);
}

console.log(`Node.js ${actual} verified.`);
