import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

export class AbacusApi implements ICredentialType {
	name = 'abacusApi';

	displayName = 'Abacus API';

	documentationUrl = 'https://apihub.abacus.ch';

	icon: Icon = {
		light: 'file:../icons/abacus.svg',
		dark: 'file:../icons/abacus.svg',
	};

	properties: INodeProperties[] = [
		{
			displayName: 'Instance URL',
			name: 'instanceUrl',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'https://company.abacus.ch',
			description: 'Base URL of the Abacus tenant',
			typeOptions: {
				trim: true,
			},
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
			required: true,
			description: 'Service-user client ID',
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'Service-user client secret',
		},
		{
			displayName: 'API Base Path',
			name: 'apiBasePath',
			type: 'string',
			default: '/api/entity/v1',
			description: 'Override only if the tenant exposes another REST base path',
			typeOptions: {
				trim: true,
			},
		},
	];
}
