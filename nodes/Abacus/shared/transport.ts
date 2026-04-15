import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

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

type AbacusRequestOptions = {
	method: IHttpRequestMethods;
	endpoint: string;
	body?: IDataObject;
	qs?: IDataObject;
	retryCount?: number;
};

const TOKEN_REFRESH_BUFFER_MS = 60_000;
const MAX_RETRIES = 3;

const sleep = async (ms: number): Promise<void> =>
	await new Promise((resolve) =>
		(globalThis as unknown as { setTimeout: (handler: () => void, timeout: number) => unknown }).setTimeout(
			resolve,
			ms,
		),
	);

const toFormUrlEncoded = (values: Record<string, string>): string =>
	Object.entries(values)
		.map(
			([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
		)
		.join('&');

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const normalizeInstanceUrl = (value: string): string => {
	const instanceUrl = trimTrailingSlash(value.trim());
	if (instanceUrl === '') {
		throw new Error('Instance URL is required');
	}

	if (!/^https?:\/\//i.test(instanceUrl)) {
		throw new Error('Instance URL must start with http:// or https://');
	}

	return instanceUrl;
};

const normalizeBasePath = (value?: string): string => {
	const basePath = (value ?? '/api/entity/v1').trim();
	if (basePath === '') {
		return '';
	}

	return basePath.startsWith('/') ? basePath : `/${basePath}`;
};

const buildApiBaseUrl = (credentials: AbacusCredentials): string =>
	`${normalizeInstanceUrl(credentials.instanceUrl)}${normalizeBasePath(credentials.apiBasePath)}`;

const getResponsePayload = (response: unknown): unknown => {
	if (
		typeof response === 'object' &&
		response !== null &&
		'body' in response &&
		(response as { body?: unknown }).body !== undefined
	) {
		return (response as { body?: unknown }).body;
	}

	return response;
};

const getErrorStatusCode = (error: JsonObject): number | undefined =>
	(error.statusCode as number | undefined) ??
	((error.cause as JsonObject | undefined)?.statusCode as number | undefined);

const getErrorMessage = (error: JsonObject): string => {
	const causeMessage = (error.cause as JsonObject | undefined)?.message as string | undefined;
	return (
		((error.response as JsonObject | undefined)?.message as string | undefined) ??
		causeMessage ??
		(error.message as string | undefined) ??
		'Unknown Abacus API error'
	);
};

export const getListItems = (payload: unknown): IDataObject[] => {
	if (Array.isArray(payload)) {
		return payload as IDataObject[];
	}

	if (typeof payload !== 'object' || payload === null) {
		return [];
	}

	for (const key of ['data', 'items', 'results', 'value']) {
		const candidate = (payload as IDataObject)[key];
		if (Array.isArray(candidate)) {
			return candidate as IDataObject[];
		}
	}

	return [payload as IDataObject];
};

export const normalizeRecord = (value: unknown): IDataObject => {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return { value } as IDataObject;
	}

	const normalized: IDataObject = {};

	for (const [key, entry] of Object.entries(value)) {
		if (entry === undefined) {
			continue;
		}

		if (typeof entry === 'number' && (key === 'id' || key.endsWith('Id'))) {
			normalized[key] = entry.toString();
			continue;
		}

		if (Array.isArray(entry)) {
			normalized[key] = entry.map((item) =>
				typeof item === 'object' && item !== null ? normalizeRecord(item) : item,
			);
			continue;
		}

		normalized[key] =
			typeof entry === 'object' && entry !== null ? normalizeRecord(entry) : entry;
	}

	return normalized;
};

const getOpenIdConfiguration = async (
	context: IExecuteFunctions,
	credentials: AbacusCredentials,
	state: TokenState,
): Promise<{ token_endpoint?: string }> => {
	if (state.discovery?.token_endpoint) {
		return state.discovery;
	}

	const response = await context.helpers.httpRequest({
		method: 'GET',
		url: `${normalizeInstanceUrl(credentials.instanceUrl)}/.well-known/openid-configuration`,
		headers: {
			Accept: 'application/json',
		},
	});

	state.discovery = getResponsePayload(response) as { token_endpoint?: string };
	return state.discovery;
};

const getAccessToken = async (
	context: IExecuteFunctions,
	credentials: AbacusCredentials,
	state: TokenState,
	forceRefresh = false,
): Promise<string> => {
	const now = Date.now();
	if (!forceRefresh && state.accessToken && state.expiresAt && now < state.expiresAt) {
		return state.accessToken;
	}

	const discovery = await getOpenIdConfiguration(context, credentials, state);
	if (!discovery.token_endpoint) {
		throw new NodeApiError(context.getNode(), {
			message: 'Abacus OpenID discovery document does not expose a token endpoint',
		});
	}

	if (!credentials.clientId.trim() || !credentials.clientSecret.trim()) {
		throw new NodeApiError(context.getNode(), {
			message: 'Client ID and Client Secret are required',
		});
	}

	const body = toFormUrlEncoded({
		grant_type: 'client_credentials',
		client_id: credentials.clientId,
		client_secret: credentials.clientSecret,
	});

	const response = await context.helpers.httpRequest({
		method: 'POST',
		url: discovery.token_endpoint,
		body,
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/x-www-form-urlencoded',
		},
	});

	const payload = getResponsePayload(response) as IDataObject;
	const accessToken = payload.access_token as string | undefined;

	if (!accessToken) {
		throw new NodeApiError(context.getNode(), {
			message: 'Abacus token response did not include an access token',
		});
	}

	const expiresIn = Number(payload.expires_in ?? 3600);
	state.accessToken = accessToken;
	state.expiresAt = now + expiresIn * 1000 - TOKEN_REFRESH_BUFFER_MS;
	return accessToken;
};

export const abacusApiRequest = async (
	context: IExecuteFunctions,
	credentials: AbacusCredentials,
	state: TokenState,
	options: AbacusRequestOptions,
): Promise<unknown> => {
	const token = await getAccessToken(context, credentials, state);
	const requestOptions: IHttpRequestOptions = {
		method: options.method,
		url: `${buildApiBaseUrl(credentials)}/${options.endpoint.replace(/^\/+/, '')}`,
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
		},
		json: true,
	};

	if (options.qs && Object.keys(options.qs).length > 0) {
		requestOptions.qs = options.qs;
	}

	if (options.body && Object.keys(options.body).length > 0) {
		requestOptions.body = options.body;
	}

	try {
		const response = await context.helpers.httpRequest(requestOptions);
		return getResponsePayload(response);
	} catch (error) {
		const errorData = error as JsonObject;
		const statusCode = getErrorStatusCode(errorData);
		const retryCount = options.retryCount ?? 0;

		if (statusCode === 401 && retryCount < 1) {
			state.accessToken = undefined;
			state.expiresAt = undefined;
			return await abacusApiRequest(context, credentials, state, {
				...options,
				retryCount: retryCount + 1,
			});
		}

		if (statusCode === 429 && retryCount < MAX_RETRIES) {
			const retryAfter = Number(
				((errorData.headers as JsonObject | undefined)?.['retry-after'] as string | undefined) ?? 0,
			);
			const delay = retryAfter > 0 ? retryAfter * 1000 : 1000 * (retryCount + 1);
			await sleep(delay);
			return await abacusApiRequest(context, credentials, state, {
				...options,
				retryCount: retryCount + 1,
			});
		}

		const message =
			statusCode === 404
				? `Resource not found: ${options.endpoint}`
				: statusCode === 500
					? `Abacus server error: ${getErrorMessage(errorData)}`
					: getErrorMessage(errorData);

		throw new NodeApiError(context.getNode(), errorData, {
			message,
			description: `HTTP ${statusCode ?? 'unknown'} while calling ${options.endpoint}`,
		});
	}
};
