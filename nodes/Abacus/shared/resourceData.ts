import type { INodePropertyOptions, INodeProperties } from 'n8n-workflow';

export type AbacusResourceName =
	| 'addresses'
	| 'customers'
	| 'subjects'
	| 'orders'
	| 'invoices'
	| 'projects';

type ResourceField = {
	name: string;
	displayName: string;
	type?: 'string' | 'number' | 'boolean';
	description: string;
};

type ResourceConfig = {
	value: AbacusResourceName;
	name: string;
	path: string;
	fields: ResourceField[];
};

const resourceConfigs: ResourceConfig[] = [
	{
		value: 'addresses',
		name: 'Address',
		path: 'addresses',
		fields: [
			{ name: 'code', displayName: 'Code', description: 'Internal address code' },
			{ name: 'name', displayName: 'Name', description: 'Full display name' },
			{ name: 'addressLine1', displayName: 'Address Line 1', description: 'Primary street line' },
			{ name: 'addressLine2', displayName: 'Address Line 2', description: 'Secondary street line' },
			{ name: 'zip', displayName: 'ZIP', description: 'Postal code' },
			{ name: 'city', displayName: 'City', description: 'City name' },
			{ name: 'country', displayName: 'Country', description: 'Country code or label' },
			{ name: 'email', displayName: 'Email', description: 'Primary email address' },
			{ name: 'phone', displayName: 'Phone', description: 'Primary phone number' },
		],
	},
	{
		value: 'customers',
		name: 'Customer',
		path: 'customers',
		fields: [
			{ name: 'customerNumber', displayName: 'Customer Number', description: 'Customer number in Abacus' },
			{ name: 'name', displayName: 'Name', description: 'Customer name' },
			{ name: 'email', displayName: 'Email', description: 'Primary email address' },
			{ name: 'phone', displayName: 'Phone', description: 'Primary phone number' },
			{ name: 'vatNumber', displayName: 'VAT Number', description: 'VAT or tax identifier' },
			{ name: 'currency', displayName: 'Currency', description: 'Default currency' },
		],
	},
	{
		value: 'subjects',
		name: 'Subject',
		path: 'subjects',
		fields: [
			{ name: 'subjectNumber', displayName: 'Subject Number', description: 'Subject number in Abacus' },
			{ name: 'name', displayName: 'Name', description: 'Subject name' },
			{ name: 'email', displayName: 'Email', description: 'Primary email address' },
			{ name: 'phone', displayName: 'Phone', description: 'Primary phone number' },
			{ name: 'language', displayName: 'Language', description: 'Communication language' },
			{ name: 'isActive', displayName: 'Is Active', type: 'boolean', description: 'Whether the subject is active' },
		],
	},
	{
		value: 'orders',
		name: 'Order',
		path: 'orders',
		fields: [
			{ name: 'orderNumber', displayName: 'Order Number', description: 'Order number in Abacus' },
			{ name: 'customerId', displayName: 'Customer ID', description: 'Linked customer identifier' },
			{ name: 'subjectId', displayName: 'Subject ID', description: 'Linked subject identifier' },
			{ name: 'status', displayName: 'Status', description: 'Order status' },
			{ name: 'orderDate', displayName: 'Order Date', description: 'Order date in ISO format' },
			{ name: 'currency', displayName: 'Currency', description: 'Order currency' },
			{ name: 'totalAmount', displayName: 'Total Amount', type: 'number', description: 'Order total amount' },
		],
	},
	{
		value: 'invoices',
		name: 'Invoice',
		path: 'invoices',
		fields: [
			{ name: 'invoiceNumber', displayName: 'Invoice Number', description: 'Invoice number in Abacus' },
			{ name: 'customerId', displayName: 'Customer ID', description: 'Linked customer identifier' },
			{ name: 'subjectId', displayName: 'Subject ID', description: 'Linked subject identifier' },
			{ name: 'status', displayName: 'Status', description: 'Invoice status' },
			{ name: 'invoiceDate', displayName: 'Invoice Date', description: 'Invoice date in ISO format' },
			{ name: 'dueDate', displayName: 'Due Date', description: 'Due date in ISO format' },
			{ name: 'totalAmount', displayName: 'Total Amount', type: 'number', description: 'Invoice total amount' },
		],
	},
	{
		value: 'projects',
		name: 'Project',
		path: 'projects',
		fields: [
			{ name: 'projectNumber', displayName: 'Project Number', description: 'Project number in Abacus' },
			{ name: 'name', displayName: 'Name', description: 'Project name' },
			{ name: 'customerId', displayName: 'Customer ID', description: 'Linked customer identifier' },
			{ name: 'status', displayName: 'Status', description: 'Project status' },
			{ name: 'startDate', displayName: 'Start Date', description: 'Start date in ISO format' },
			{ name: 'endDate', displayName: 'End Date', description: 'End date in ISO format' },
			{ name: 'budgetAmount', displayName: 'Budget Amount', type: 'number', description: 'Budget amount' },
		],
	},
];

const operations: INodePropertyOptions[] = [
	{ name: 'Get', value: 'get', action: 'Get a resource by ID' },
	{ name: 'Get All', value: 'getAll', action: 'Get many resources' },
	{ name: 'Create', value: 'create', action: 'Create a resource' },
	{ name: 'Update', value: 'update', action: 'Update a resource' },
	{ name: 'Delete', value: 'delete', action: 'Delete a resource' },
];

export const resourceByName = resourceConfigs.reduce<Record<AbacusResourceName, ResourceConfig>>(
	(accumulator, resource) => {
		accumulator[resource.value] = resource;
		return accumulator;
	},
	{} as Record<AbacusResourceName, ResourceConfig>,
);

const createOperationProperty = (resource: ResourceConfig): INodeProperties => ({
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: {
		show: {
			resource: [resource.value],
		},
	},
	options: operations,
	default: 'getAll',
});

const createIdProperty = (resource: ResourceConfig): INodeProperties => ({
	displayName: 'Record ID',
	name: `${resource.value}Id`,
	type: 'string',
	required: true,
	default: '',
	displayOptions: {
		show: {
			resource: [resource.value],
			operation: ['get', 'update', 'delete'],
		},
	},
	description: `Identifier of the ${resource.name.toLowerCase()} record`,
});

const createListProperties = (resource: ResourceConfig): INodeProperties[] => [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: {
			show: {
				resource: [resource.value],
				operation: ['getAll'],
			},
		},
		description: 'Whether to fetch all pages automatically',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: {
			minValue: 1,
		},
		default: 50,
		displayOptions: {
			show: {
				resource: [resource.value],
				operation: ['getAll'],
				returnAll: [false],
			},
		},
		description: 'Max number of records to return',
	},
	{
		displayName: 'Updated After',
		name: 'updatedAfter',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: [resource.value],
				operation: ['getAll'],
			},
		},
		description: 'Optional ISO timestamp filter',
	},
	{
		displayName: 'Search',
		name: 'search',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: [resource.value],
				operation: ['getAll'],
			},
		},
		description: 'Free-text search term when supported by the tenant',
	},
];

const createFieldProperties = (resource: ResourceConfig): INodeProperties[] =>
	resource.fields.map((field) => ({
		displayName: field.displayName,
		name: field.name,
		type: field.type ?? 'string',
		default: field.type === 'number' ? 0 : field.type === 'boolean' ? false : '',
		displayOptions: {
			show: {
				resource: [resource.value],
				operation: ['create', 'update'],
			},
		},
		description: field.description,
	}));

const createAdditionalFieldsProperty = (resource: ResourceConfig): INodeProperties => ({
	displayName: 'Additional Fields',
	name: 'additionalFields',
	type: 'collection',
	placeholder: 'Add Field',
	default: {},
	displayOptions: {
		show: {
			resource: [resource.value],
			operation: ['create', 'update'],
		},
	},
	options: [
		{
			displayName: 'Description',
			name: 'description',
			type: 'string',
			default: '',
		},
		{
			displayName: 'External Reference',
			name: 'externalReference',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Notes',
			name: 'notes',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Is Active',
			name: 'isActive',
			type: 'boolean',
			default: true,
		},
	],
});

export const abacusNodeProperties: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Address', value: 'addresses' },
			{ name: 'Customer', value: 'customers' },
			{ name: 'Subject', value: 'subjects' },
			{ name: 'Order', value: 'orders' },
			{ name: 'Invoice', value: 'invoices' },
			{ name: 'Project', value: 'projects' },
		],
		default: 'addresses',
	},
	...resourceConfigs.flatMap((resource) => [
		createOperationProperty(resource),
		createIdProperty(resource),
		...createListProperties(resource),
		...createFieldProperties(resource),
		createAdditionalFieldsProperty(resource),
	]),
];
