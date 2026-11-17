import { V4PagePaginationArray } from 'cloudflare/core/pagination'
import { z } from 'zod'

import { getCloudflareClient } from '@repo/mcp-common/src/cloudflare-api'

import { pageParam, perPageParam } from '../types'

import type { AutoRAGMCP } from '../autorag.app'

const NAMESPACE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/

export type AiSearchScope = { mode: 'legacy' } | { mode: 'ai-search'; namespace: string }

export function resolveAiSearchScope({
	namespace,
	scoped = false,
}: {
	namespace?: string
	scoped?: boolean
}): AiSearchScope {
	if (namespace === undefined) {
		if (scoped) {
			throw new Error(
				'Scoped isolation requires an explicit non-default namespace (legacy unscoped AutoRAG cannot be used when scoped=true)'
			)
		}
		return { mode: 'legacy' }
	}

	const trimmed = namespace.trim()
	if (!trimmed) {
		throw new Error('namespace must be non-empty when provided')
	}
	if (!NAMESPACE_PATTERN.test(trimmed)) {
		throw new Error(
			`Invalid namespace "${trimmed}": must be 1-64 characters matching [a-zA-Z0-9_-] and start with an alphanumeric character`
		)
	}
	if (scoped && trimmed.toLowerCase() === 'default') {
		throw new Error(
			'Namespace "default" is rejected when scoped isolation is requested; provide a dedicated namespace (e.g. "hzo-<scope>")'
		)
	}

	return { mode: 'ai-search', namespace: trimmed }
}

export function buildAutoRAGPath(
	accountId: string,
	scope: AiSearchScope,
	op: 'list' | 'search' | 'ai-search',
	instanceId?: string
): string {
	if (scope.mode === 'legacy') {
		if (op === 'list') {
			return `/accounts/${accountId}/autorag/rags`
		}
		if (!instanceId) {
			throw new Error('rag_id (or instance_id) is required')
		}
		return `/accounts/${accountId}/autorag/rags/${encodeURIComponent(instanceId)}/${op}`
	}

	const ns = encodeURIComponent(scope.namespace)
	if (op === 'list') {
		return `/accounts/${accountId}/ai-search/namespaces/${ns}/instances`
	}
	if (!instanceId) {
		throw new Error('instance_id (or rag_id) is required')
	}
	const id = encodeURIComponent(instanceId)
	return op === 'search'
		? `/accounts/${accountId}/ai-search/namespaces/${ns}/instances/${id}/search`
		: `/accounts/${accountId}/ai-search/namespaces/${ns}/instances/${id}/chat/completions`
}

function formatSearchChunk(item: any): string {
	const name =
		item?.filename ?? item?.metadata?.filename ?? item?.metadata?.title ?? item?.id ?? 'unknown'
	const text = Array.isArray(item?.content)
		? item.content.map((c: any) => c?.text ?? '').join('\n\n')
		: typeof item?.content === 'string'
			? item.content
			: ''
	return `<file name="${name}">${text}</file>`
}

const namespaceParam = z
	.string()
	.optional()
	.describe(
		'Optional Cloudflare AI Search namespace. When provided, routes requests to /ai-search/namespaces/{namespace}/instances instead of legacy /autorag/rags.'
	)

const scopedParam = z
	.boolean()
	.optional()
	.default(false)
	.describe(
		'When true, enforces scoped namespace isolation: requires an explicit namespace and rejects "default".'
	)

export function registerAutoRAGTools(agent: AutoRAGMCP) {
	agent.server.tool(
		'list_rags',
		'List AutoRAGs or namespace-scoped AI Search instances (vector stores)',
		{
			page: pageParam,
			per_page: perPageParam,
			namespace: namespaceParam,
			scoped: scopedParam,
		},
		async (params) => {
			const accountId = await agent.getActiveAccountId()
			if (!accountId) {
				return {
					content: [
						{
							type: 'text',
							text: 'No currently active accountId. Try listing your accounts (accounts_list) and then setting an active account (set_active_account)',
						},
					],
				}
			}
			try {
				const scope = resolveAiSearchScope({
					namespace: params.namespace,
					scoped: params.scoped,
				})
				const path = buildAutoRAGPath(accountId, scope, 'list')
				const accessToken = agent.props?.accessToken
				if (!accessToken) {
					throw new Error('Missing Cloudflare access token')
				}
				const client = getCloudflareClient(accessToken)
				const r = (await client.getAPIList(
					path,
					// @ts-ignore
					V4PagePaginationArray,
					{ query: { page: params.page, per_page: params.per_page } }
				)) as unknown as {
					result: Array<{
						id: string
						source?: string
						type?: string
						paused?: boolean
						namespace?: string
					}>
					result_info?: { total_count?: number }
				}

				const items = (r.result ?? []).map((obj) => ({
					id: obj.id,
					source: obj.source,
					paused: obj.paused,
					...(obj.type ? { type: obj.type } : {}),
					...(scope.mode === 'ai-search' ? { namespace: obj.namespace ?? scope.namespace } : {}),
				}))

				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								autorags: items,
								...(scope.mode === 'ai-search'
									? { namespace: scope.namespace, instances: items }
									: {}),
								total_count: r.result_info?.total_count ?? items.length,
							}),
						},
					],
				}
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: `Error listing rags: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				}
			}
		}
	)

	agent.server.tool(
		'search',
		'Search Documents using AutoRAG or namespace-scoped AI Search (vector store)',
		{
			rag_id: z.string().optional().describe('ID of the AutoRAG or AI Search instance to search'),
			instance_id: z
				.string()
				.optional()
				.describe('AI Search instance ID (alias for rag_id when querying /ai-search)'),
			namespace: namespaceParam,
			scoped: scopedParam,
			query: z.string().describe('Query to search for. Can be a URL, a title, or a snippet.'),
		},
		async (params) => {
			try {
				const accountId = await agent.getActiveAccountId()
				if (!accountId) {
					return {
						content: [
							{
								type: 'text',
								text: 'No currently active accountId. Try listing your accounts (accounts_list) and then setting an active account (set_active_account)',
							},
						],
					}
				}

				const targetId = (params.instance_id ?? params.rag_id)?.trim()
				if (!targetId) {
					throw new Error('rag_id or instance_id is required')
				}
				const scope = resolveAiSearchScope({
					namespace: params.namespace,
					scoped: params.scoped,
				})
				const path = buildAutoRAGPath(accountId, scope, 'search', targetId)

				const accessToken = agent.props?.accessToken
				if (!accessToken) {
					throw new Error('Missing Cloudflare access token')
				}
				const client = getCloudflareClient(accessToken)
				const body =
					scope.mode === 'ai-search'
						? {
								messages: [{ role: 'user', content: params.query }],
								ai_search_options: { retrieval: { max_num_results: 5 } },
							}
						: {
								query: params.query,
								max_num_results: 5,
							}

				const r = (await client.post(path, { body })) as {
					result?: { data?: Array<any> }
					data?: Array<any>
				}

				const items = r.result?.data ?? r.data ?? []
				const chunks = items.map(formatSearchChunk).join('\n\n')

				return {
					content: [
						{
							type: 'text',
							text: chunks,
						},
					],
				}
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: `Error searching rag: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				}
			}
		}
	)

	agent.server.tool(
		'ai_search',
		'AI Search Documents using AutoRAG or namespace-scoped AI Search (vector store)',
		{
			rag_id: z.string().optional().describe('ID of the AutoRAG or AI Search instance to search'),
			instance_id: z
				.string()
				.optional()
				.describe('AI Search instance ID (alias for rag_id when querying /ai-search)'),
			namespace: namespaceParam,
			scoped: scopedParam,
			query: z.string().describe('Query to search for. Can be a URL, a title, or a snippet.'),
		},
		async (params) => {
			try {
				const accountId = await agent.getActiveAccountId()
				if (!accountId) {
					return {
						content: [
							{
								type: 'text',
								text: 'No currently active accountId. Try listing your accounts (accounts_list) and then setting an active account (set_active_account)',
							},
						],
					}
				}

				const targetId = (params.instance_id ?? params.rag_id)?.trim()
				if (!targetId) {
					throw new Error('rag_id or instance_id is required')
				}
				const scope = resolveAiSearchScope({
					namespace: params.namespace,
					scoped: params.scoped,
				})
				const path = buildAutoRAGPath(accountId, scope, 'ai-search', targetId)

				const accessToken = agent.props?.accessToken
				if (!accessToken) {
					throw new Error('Missing Cloudflare access token')
				}
				const client = getCloudflareClient(accessToken)
				const body =
					scope.mode === 'ai-search'
						? {
								messages: [{ role: 'user', content: params.query }],
								ai_search_options: { retrieval: { max_num_results: 10 } },
							}
						: {
								query: params.query,
								max_num_results: 10, // Limit can be bigger here, since llm is only getting the end response and not individual chunks
							}

				const r = (await client.post(path, { body })) as {
					result?: {
						response?: string
						choices?: Array<{ message?: { content?: string } }>
					}
					choices?: Array<{ message?: { content?: string } }>
				}

				const text =
					r.choices?.[0]?.message?.content ??
					r.result?.choices?.[0]?.message?.content ??
					r.result?.response ??
					''

				return {
					content: [
						{
							type: 'text',
							text,
						},
					],
				}
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: `Error searching rag: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				}
			}
		}
	)
}
