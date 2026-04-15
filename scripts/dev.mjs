import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const isWindows = process.platform === 'win32';
const npmExecutable = isWindows ? 'npm.cmd' : 'npm';
const npxExecutable = isWindows ? 'npx.cmd' : 'npx';
const n8nExecutable = isWindows ? 'n8n.cmd' : 'n8n';
const whereExecutable = isWindows ? 'where.exe' : 'which';
const repoRoot = process.cwd();

const localN8nExecutable = path.join(
	repoRoot,
	'node_modules',
	'.bin',
	isWindows ? 'n8n.cmd' : 'n8n',
);

const shouldUseCmdShell = (command) => isWindows && /\.(cmd|bat)$/i.test(command);

const quoteForCmd = (value) => {
	if (value.length === 0) {
		return '""';
	}

	if (!/[\s"&()<>^|]/.test(value)) {
		return value;
	}

	return `"${value.replace(/"/g, '""')}"`;
};

const normalizeCommand = (command, args) => {
	if (!shouldUseCmdShell(command)) {
		return { command, args };
	}

	return {
		command: process.env.ComSpec ?? 'cmd.exe',
		args: ['/d', '/s', '/c', [command, ...args].map(quoteForCmd).join(' ')],
	};
};

const run = (command, args, options = {}) => {
	const normalized = normalizeCommand(command, args);
	const result = spawnSync(normalized.command, normalized.args, {
		cwd: repoRoot,
		stdio: 'inherit',
		env: process.env,
		...options,
	});

	if (result.status !== 0) {
		if (result.error) {
			console.error(`Unable to run ${command}: ${result.error.message}`);
		}
		process.exit(result.status ?? 1);
	}
};

const findGlobalN8nExecutable = () => {
	const result = spawnSync(whereExecutable, [n8nExecutable], {
		cwd: repoRoot,
		stdio: ['ignore', 'pipe', 'ignore'],
		env: process.env,
		encoding: 'utf8',
	});

	if (result.status !== 0 || !result.stdout) {
		return null;
	}

	return result.stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find(Boolean) ?? null;
};
//offline
const isOffline = String(process.env.npm_config_offline).toLowerCase() === 'true';

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

	const globalN8nExecutable = findGlobalN8nExecutable();

	if (globalN8nExecutable) {
		return {
			command: globalN8nExecutable,
			args: ['start'],
		};
	}

	if (isOffline) {
		console.error(
			'npm offline mode is enabled and no local or global n8n binary was found. Start n8n with Docker using "docker compose up -d", install n8n locally/globally, or unset npm_config_offline before running "npm run dev".',
		);
		process.exit(1);
	}

	return {
		command: npxExecutable,
		args: ['-y', '--prefer-online', 'n8n@next', 'start'],
	};
};

const n8nCommand = resolveN8nCommand();

console.log(`n8n dev mode running with custom extensions from ${path.resolve(repoRoot)}`);
console.log(`Starting n8n using ${n8nCommand.command} ${n8nCommand.args.join(' ')}`);

const normalizedN8nCommand = normalizeCommand(n8nCommand.command, n8nCommand.args);

const n8nProcess = spawn(normalizedN8nCommand.command, normalizedN8nCommand.args, {
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

for (const [name, child] of [
	['TypeScript watcher', tscProcess],
	['n8n', n8nProcess],
]) {
	child.on('error', (error) => {
		console.error(`${name} failed to start: ${error.message}`);
		shutdown('SIGTERM');
		process.exit(1);
	});
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
