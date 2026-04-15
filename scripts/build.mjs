import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

rmSync('dist', { recursive: true, force: true });

const tsc = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], {
	stdio: 'inherit',
});

if (tsc.status !== 0) {
	process.exit(tsc.status ?? 1);
}

rmSync('dist/tsconfig.tsbuildinfo', { force: true });

if (existsSync('icons')) {
	mkdirSync('dist/icons', { recursive: true });
	cpSync('icons', 'dist/icons', { recursive: true });
}
