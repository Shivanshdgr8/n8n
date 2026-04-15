import tsParser from '@typescript-eslint/parser';
import n8nNodesBase from 'eslint-plugin-n8n-nodes-base';

const n8nPlugin = {
	plugins: {
		'n8n-nodes-base': n8nNodesBase,
	},
	languageOptions: {
		parser: tsParser,
		ecmaVersion: 'latest',
		sourceType: 'module',
	},
};

export default [
	{
		ignores: ['dist/**', 'node_modules/**'],
	},
	{
		...n8nPlugin,
		files: ['credentials/**/*.ts'],
		rules: {
			...n8nNodesBase.configs.credentials.rules,
			'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
		},
	},
	{
		...n8nPlugin,
		files: ['nodes/**/*.ts'],
		rules: n8nNodesBase.configs.nodes.rules,
	},
];
