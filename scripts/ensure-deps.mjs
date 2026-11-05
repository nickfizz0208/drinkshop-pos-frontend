// 啟動前檢查套件：package.json 列的套件只要有缺（例如組員新增了套件），就自動執行 npm install。
// 都已安裝時直接結束，不影響啟動速度。由 package.json 的 prestart／pretest 呼叫。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// fileURLToPath 才能正確處理 Windows 路徑（D:\...）
const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const missing = names.filter(name => !existsSync(join(root, 'node_modules', name, 'package.json')));

if (missing.length) {
  console.log(`\n[ensure-deps] 缺少 ${missing.length} 個套件：${missing.join(', ')}`);
  console.log('[ensure-deps] 自動執行 npm install …\n');
  // Windows 的 npm 是 npm.cmd，需要 shell: true
  const result = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error('\n[ensure-deps] npm install 失敗，請手動執行 npm install 查看錯誤。');
    process.exit(result.status ?? 1);
  }
}
