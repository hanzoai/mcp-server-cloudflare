import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildAutoRAGPath, registerAutoRAGTools, resolveAiSearchScope } from './autorag.tools'

const mockGetAPIList = vi.fn()
const mockPost = vi.fn()

vi.mock('@repo/mcp-common/src/cloudflare-api', () => ({
	getCloudflareClient: () => ({
		getAPIList: mockGetAPIList,
		post: mockPost,
	}),
}))

type RegisteredTool = {
	name: string
	handler: (params: any) => Promise<any>
}

function createFakeAgent() {
	const tools = new Map<string, RegisteredTool>()
	const agent = {
		props: { accessToken: 'test-token' },
		getActiveAccountId: vi.fn().mockResolvedValue('acct-123'),
		server: {
			tool: (name: string, _desc: string, _schema: unknown, cb: (params: any) => Promise<any>) => {
				tools.set(name, { name, handler: cb })
			},
		},
	}
	registerAutoRAGTools(agent as any)
	return { agent, tools }
}

describe('autorag / ai-search namespace isolation & endpoints', () => {
	beforeEach(() => {
		mockGetAPIList.mockReset()
		mockPost.mockReset()
	})

	describe('resolveAiSearchScope & buildAutoRAGPath', () => {
		it('uses legacy /autorag/rags paths when namespace is omitted and scoped=false', () => {
			const scope = resolveAiSearchScope({})
			expect(scope).toEqual({ mode: 'legacy' })
			expect(buildAutoRAGPath('acct-1', scope, 'list')).toBe('/accounts/acct-1/autorag/rags')
			expect(buildAutoRAGPath('acct-1', scope, 'search', 'rag-a')).toBe(
				'/accounts/acct-1/autorag/rags/rag-a/search'
			)
			expect(buildAutoRAGPath('acct-1', scope, 'ai-search', 'rag-a')).toBe(
				'/accounts/acct-1/autorag/rags/rag-a/ai-search'
			)
		})

		it('routes explicit namespace to /ai-search/namespaces/{ns}/instances endpoints', () => {
			const scope = resolveAiSearchScope({ namespace: 'hzo-acme', scoped: true })
			expect(scope).toEqual({ mode: 'ai-search', namespace: 'hzo-acme' })
			expect(buildAutoRAGPath('acct-1', scope, 'list')).toBe(
				'/accounts/acct-1/ai-search/namespaces/hzo-acme/instances'
			)
			expect(buildAutoRAGPath('acct-1', scope, 'search', 'docs')).toBe(
				'/accounts/acct-1/ai-search/namespaces/hzo-acme/instances/docs/search'
			)
			expect(buildAutoRAGPath('acct-1', scope, 'ai-search', 'docs')).toBe(
				'/accounts/acct-1/ai-search/namespaces/hzo-acme/instances/docs/chat/completions'
			)
		})

		it('allows explicit "default" namespace only when scoped isolation is not requested', () => {
			expect(resolveAiSearchScope({ namespace: 'default', scoped: false })).toEqual({
				mode: 'ai-search',
				namespace: 'default',
			})
		})

		it('rejects "default" or omitted namespace when scoped isolation is requested', () => {
			expect(() => resolveAiSearchScope({ namespace: 'default', scoped: true })).toThrow(
				/default.*rejected/i
			)
			expect(() => resolveAiSearchScope({ namespace: ' DEFAULT ', scoped: true })).toThrow(
				/default.*rejected/i
			)
			expect(() => resolveAiSearchScope({ scoped: true })).toThrow(
				/explicit non-default namespace/i
			)
		})

		it('rejects empty or path-traversal namespaces', () => {
			expect(() => resolveAiSearchScope({ namespace: '   ' })).toThrow(/non-empty/i)
			expect(() => resolveAiSearchScope({ namespace: '../other' })).toThrow(/Invalid namespace/i)
		})
	})

	describe('registered MCP tools', () => {
		it('list_rags supports both legacy /autorag/rags and namespace-scoped /ai-search', async () => {
			const { tools } = createFakeAgent()
			const listRags = tools.get('list_rags')!.handler

			mockGetAPIList.mockResolvedValueOnce({
				result: [{ id: 'legacy-1', source: 'bucket-1', paused: false }],
				result_info: { total_count: 1 },
			})
			const legacyRes = await listRags({ page: 1, per_page: 20, scoped: false })
			expect(mockGetAPIList).toHaveBeenCalledWith(
				'/accounts/acct-123/autorag/rags',
				expect.anything(),
				{ query: { page: 1, per_page: 20 } }
			)
			expect(JSON.parse(legacyRes.content[0].text)).toEqual({
				autorags: [{ id: 'legacy-1', source: 'bucket-1', paused: false }],
				total_count: 1,
			})

			mockGetAPIList.mockResolvedValueOnce({
				result: [{ id: 'docs', source: 'r2-docs', type: 'r2', paused: false }],
				result_info: { total_count: 1 },
			})
			const aiRes = await listRags({
				page: 1,
				per_page: 10,
				namespace: 'hzo-acme',
				scoped: true,
			})
			expect(mockGetAPIList).toHaveBeenLastCalledWith(
				'/accounts/acct-123/ai-search/namespaces/hzo-acme/instances',
				expect.anything(),
				{ query: { page: 1, per_page: 10 } }
			)
			const parsed = JSON.parse(aiRes.content[0].text)
			expect(parsed.namespace).toBe('hzo-acme')
			expect(parsed.instances[0]).toMatchObject({
				id: 'docs',
				type: 'r2',
				namespace: 'hzo-acme',
			})
		})

		it('search supports /ai-search messages payload alongside legacy /autorag/rags', async () => {
			const { tools } = createFakeAgent()
			const search = tools.get('search')!.handler

			mockPost.mockResolvedValueOnce({
				result: {
					data: [{ filename: 'a.md', content: [{ text: 'legacy chunk' }] }],
				},
			})
			const legacyRes = await search({ rag_id: 'r1', query: 'hello', scoped: false })
			expect(mockPost).toHaveBeenCalledWith('/accounts/acct-123/autorag/rags/r1/search', {
				body: { query: 'hello', max_num_results: 5 },
			})
			expect(legacyRes.content[0].text).toBe('<file name="a.md">legacy chunk</file>')

			mockPost.mockResolvedValueOnce({
				object: 'list',
				data: [{ id: 'doc-1', content: 'namespaced chunk', metadata: { title: 'guide.md' } }],
			})
			const aiRes = await search({
				instance_id: 'docs',
				namespace: 'hzo-acme',
				scoped: true,
				query: 'hello ai search',
			})
			expect(mockPost).toHaveBeenLastCalledWith(
				'/accounts/acct-123/ai-search/namespaces/hzo-acme/instances/docs/search',
				{
					body: {
						messages: [{ role: 'user', content: 'hello ai search' }],
						ai_search_options: { retrieval: { max_num_results: 5 } },
					},
				}
			)
			expect(aiRes.content[0].text).toBe('<file name="guide.md">namespaced chunk</file>')
		})

		it('ai_search routes namespaced requests to /chat/completions and rejects "default" when scoped=true', async () => {
			const { tools } = createFakeAgent()
			const aiSearch = tools.get('ai_search')!.handler

			mockPost.mockResolvedValueOnce({
				choices: [{ message: { role: 'assistant', content: 'Scoped answer' } }],
			})
			const res = await aiSearch({
				instance_id: 'docs',
				namespace: 'hzo-acme',
				scoped: true,
				query: 'summarize',
			})
			expect(mockPost).toHaveBeenCalledWith(
				'/accounts/acct-123/ai-search/namespaces/hzo-acme/instances/docs/chat/completions',
				{
					body: {
						messages: [{ role: 'user', content: 'summarize' }],
						ai_search_options: { retrieval: { max_num_results: 10 } },
					},
				}
			)
			expect(res.content[0].text).toBe('Scoped answer')

			const rejected = await aiSearch({
				instance_id: 'docs',
				namespace: 'default',
				scoped: true,
				query: 'summarize',
			})
			expect(rejected.isError).toBe(true)
			expect(rejected.content[0].text).toMatch(/default.*rejected/i)
		})
	})
})
