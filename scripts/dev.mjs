import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const isWindows = process.platform === 'win32';
const npmExecutable = isWindows ? 'npm.cmd' : 'npm';
const npxExecutable = isWindows ? 'npx.cmd' : 'npx';
const n8nExecutable = isWindows ? 'n8n.cmd' : 'n8n';
const repoRoot = process.cwd();

const localN8nExecutable = path.join(
	repoRoot,
	'node_modules',
	'.bin',
	isWindows ? 'n8n.cmd' : 'n8n',
);

const run = (command, args, options = {}) => {
	const result = spawnSync(command, args, {
		cwd: repoRoot,
		stdio: 'inherit',
		env: process.env,
		...options,
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
};

run(npmExecutable, ['run', 'build']);

const childEnv = {
	...process.env,
	N8N_COMMUNITY_PACKAGES_ENABLED: 'true',
	N8N_CUSTOM_EXTENSIONS: repoRoot,
};

const tscProcess = spawn(
	process.execPath,
	['node_modules/typescript/bin/tsc', '--watch', '--preserveWatchOutput'],
	{
		cwd: repoRoot,
		stdio: 'inherit',
		env: childEnv,
	},
);

const resolveN8nCommand = () => {
	if (process.env.N8N_EXECUTABLE) {
		return {
			command: process.env.N8N_EXECUTABLE,
			args: ['start'],
		};
	}

	if (existsSync(localN8nExecutable)) {
		return {
			command: localN8nExecutable,
			args: ['start'],
		};
	}

	return {
		command: npxExecutable,
		args: ['-y', '--quiet', '--prefer-online', 'n8n@next', 'start'],
	};
};

const n8nCommand = resolveN8nCommand();

const n8nProcess = spawn(n8nCommand.command, n8nCommand.args, {
	cwd: repoRoot,
	stdio: 'inherit',
	env: childEnv,
});

const shutdown = (signal) => {
	for (const child of [tscProcess, n8nProcess]) {
		if (!child.killed) {
			child.kill(signal);
		}
	}
};

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => shutdown(signal));
}

for (const child of [tscProcess, n8nProcess]) {
	child.on('exit', (code) => {
		if (code && code !== 0) {
			if (child === n8nProcess && n8nCommand.command === npxExecutable) {
				console.error(
					'Unable to start n8n via npx. Install n8n locally or globally, or set N8N_EXECUTABLE to an existing n8n binary.',
				);
			}
			shutdown('SIGTERM');
			process.exit(code);
		}
	});
}

console.log(`n8n dev mode running with custom extensions from ${path.resolve(repoRoot)}`);
