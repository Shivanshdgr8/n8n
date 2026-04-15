import type {
	IDataObject,
	IExecuteFunctions,
	INode,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import { abacusNodeProperties, resourceByName, type AbacusResourceName } from './shared/resourceData';
import { abacusApiRequest, getListItems, normalizeRecord } from './shared/transport';

type AbacusCredentials = {
	instanceUrl: string;
	clientId: string;
	clientSecret: string;
	apiBasePath?: string;
};

type TokenState = {
	discovery?: { token_endpoint?: string };
	accessToken?: string;
	expiresAt?: number;
};

const setValue = (target: IDataObject, key: string, value: unknown): void => {
	if (value === '' || value === undefined || value === null) {
		return;
	}

	target[key] = value;
};

const ensureNonEmptyBody = (
	node: INode,
	body: IDataObject,
	operation: 'create' | 'update',
	itemIndex: number,
): void => {
	if (Object.keys(body).length > 0) {
		return;
	}

	throw new NodeOperationError(
		node,
		operation === 'create'
			? 'At least one field must be provided to create a record'
			: 'At least one field must be provided to update a record',
		{ itemIndex },
	);
};

const buildBody = (
	context: IExecuteFunctions,
	resource: AbacusResourceName,
	itemIndex: number,
): IDataObject => {
	const resourceConfig = resourceByName[resource];
	const body: IDataObject = {};

	for (const field of resourceConfig.fields) {
		const value = context.getNodeParameter(field.name, itemIndex, null) as unknown;
		if (field.type === 'number' && value === 0) {
			continue;
		}

		if (field.type === 'boolean' && value === false) {
			continue;
		}

		setValue(body, field.name, value);
	}

	const additionalFields = context.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	for (const [key, value] of Object.entries(additionalFields)) {
		setValue(body, key, value);
	}

	return body;
};

const buildListQuery = (
	context: IExecuteFunctions,
	itemIndex: number,
	limit?: number,
	page?: number,
): IDataObject => {
	const query: IDataObject = {};
	const search = context.getNodeParameter('search', itemIndex, '') as string;
	const updatedAfter = context.getNodeParameter('updatedAfter', itemIndex, '') as string;

	setValue(query, 'search', search);
	setValue(query, 'updatedAfter', updatedAfter);

	if (limit !== undefined) {
		query.limit = limit;
		query.pageSize = limit;
	}

	if (page !== undefined) {
		query.page = page;
	}

	return query;
};

const toExecutionData = (json: IDataObject, itemIndex: number): INodeExecutionData => ({
	json,
	pairedItem: {
		item: itemIndex,
	},
});

export class Abacus implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Abacus',
		name: 'abacus',
		icon: 'file:../../icons/abacus.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Read and write data in Abacus ERP',
		defaults: {
			name: 'Abacus',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'abacusApi',
				required: true,
			},
		],
		properties: abacusNodeProperties,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = (await this.getCredentials('abacusApi')) as AbacusCredentials;
		const tokenState: TokenState = {};

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as AbacusResourceName;
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const resourceConfig = resourceByName[resource];

				if (operation === 'get') {
					const recordId = this.getNodeParameter(`${resource}Id`, itemIndex) as string;
					const response = await abacusApiRequest(this, credentials, tokenState, {
						method: 'GET',
						endpoint: `${resourceConfig.path}/${recordId}`,
					});
					returnData.push(toExecutionData(normalizeRecord(response), itemIndex));
					continue;
				}

				if (operation === 'delete') {
					const recordId = this.getNodeParameter(`${resource}Id`, itemIndex) as string;
					await abacusApiRequest(this, credentials, tokenState, {
						method: 'DELETE',
						endpoint: `${resourceConfig.path}/${recordId}`,
					});
					returnData.push(
						toExecutionData(
							{
								success: true,
								id: recordId,
								resource,
							},
							itemIndex,
						),
					);
					continue;
				}

				if (operation === 'create') {
					const body = buildBody(this, resource, itemIndex);
					ensureNonEmptyBody(this.getNode(), body, 'create', itemIndex);
					const response = await abacusApiRequest(this, credentials, tokenState, {
						method: 'POST',
						endpoint: resourceConfig.path,
						body,
					});
					returnData.push(toExecutionData(normalizeRecord(response), itemIndex));
					continue;
				}

				if (operation === 'update') {
					const recordId = this.getNodeParameter(`${resource}Id`, itemIndex) as string;
					const body = buildBody(this, resource, itemIndex);
					ensureNonEmptyBody(this.getNode(), body, 'update', itemIndex);
					const response = await abacusApiRequest(this, credentials, tokenState, {
						method: 'PATCH',
						endpoint: `${resourceConfig.path}/${recordId}`,
						body,
					});
					returnData.push(toExecutionData(normalizeRecord(response), itemIndex));
					continue;
				}

				const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
				const limit = this.getNodeParameter('limit', itemIndex, 50) as number;

				if (!returnAll) {
					const response = await abacusApiRequest(this, credentials, tokenState, {
						method: 'GET',
						endpoint: resourceConfig.path,
						qs: buildListQuery(this, itemIndex, limit),
					});
					for (const entry of getListItems(response)) {
						returnData.push(toExecutionData(normalizeRecord(entry), itemIndex));
					}
					continue;
				}

				let page = 1;
				let fetched = 0;

				while (true) {
					const response = await abacusApiRequest(this, credentials, tokenState, {
						method: 'GET',
						endpoint: resourceConfig.path,
						qs: buildListQuery(this, itemIndex, 100, page),
					});
					const listItems = getListItems(response);

					if (listItems.length === 0) {
						break;
					}

					for (const entry of listItems) {
						returnData.push(toExecutionData(normalizeRecord(entry), itemIndex));
						fetched += 1;
					}

					if (listItems.length < 100) {
						break;
					}

					page += 1;
				}

				if (fetched === 0) {
					returnData.push(toExecutionData({}, itemIndex));
				}
			} catch (error) {
				if (this.continueOnFail()) {
					const message = error instanceof Error ? error.message : 'Unknown Abacus node error';
					returnData.push(
						toExecutionData(
							{
								success: false,
								error: message,
								resource: this.getNodeParameter('resource', itemIndex) as string,
							},
							itemIndex,
						),
					);
					continue;
				}

				throw error instanceof NodeApiError
					? error
					: new NodeApiError(this.getNode(), error as JsonObject);
			}
		}

		return [returnData];
	}
}
