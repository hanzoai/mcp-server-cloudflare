import { ObservableToolCall, tool } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { McpContext } from '@repo/mcp-common/src/mcp/context'
import { getUserAPIInfo } from '@repo/mcp-common/src/utils/getUserAPIInfo'
import { metrics } from '@repo/mcp-common/src/utils/observability'
import { callCloudflareAPI } from '@repo/mcp-common/src/cloudflare/api'

// Schema definitions for Cloudflare Tunnels
const TunnelSchema = z.object({
	id: z.string(),
	name: z.string(),
	created_at: z.string(),
	deleted_at: z.string().nullable().optional(),
	status: z.string().optional(),
	connections: z.array(z.object({
		colo_name: z.string(),
		id: z.string(),
		is_pending_reconnect: z.boolean(),
		origin_ip: z.string(),
		opened_at: z.string(),
		client_id: z.string(),
		client_version: z.string()
	})).optional()
})

const TunnelConfigSchema = z.object({
	config: z.object({
		ingress: z.array(z.object({
			hostname: z.string().optional(),
			service: z.string(),
			path: z.string().optional(),
			originRequest: z.record(z.any()).optional()
		})),
		warp_routing: z.object({
			enabled: z.boolean()
		}).optional()
	})
})

const TunnelCredentialsSchema = z.object({
	tunnel_id: z.string(),
	tunnel_name: z.string(),
	tunnel_secret: z.string()
})

// List all tunnels in an account
export const tunnels_list: ObservableToolCall<typeof tunnels_list.parameters, z.infer<typeof tunnels_list.returns>> = tool({
	name: 'tunnels_list',
	description: 'List all Cloudflare Tunnels in your account',
	parameters: z.object({
		account_id: z.string().optional().describe('The account ID. If not provided, uses the active account.'),
		include_deleted: z.boolean().optional().describe('Include deleted tunnels in the list')
	}),
	returns: z.object({
		tunnels: z.array(TunnelSchema),
		success: z.boolean(),
		errors: z.array(z.any()).optional(),
		messages: z.array(z.any()).optional()
	}),
	execute: async function (args, context: McpContext): Promise<z.infer<typeof tunnels_list.returns>> {
		const startTime = Date.now()
		metrics(context.env, {
			metric: 'tunnels_list',
			status: 'invoked'
		})

		const { cloudflareAccountId, cloudflareAPIToken } = await getUserAPIInfo(context)
		const accountId = args.account_id || cloudflareAccountId

		const queryParams = new URLSearchParams()
		if (args.include_deleted) {
			queryParams.append('include_deleted', 'true')
		}

		const response = await callCloudflareAPI<{
			result: z.infer<typeof TunnelSchema>[]
			success: boolean
			errors?: any[]
			messages?: any[]
		}>({
			endpoint: `/accounts/${accountId}/tunnels${queryParams.toString() ? `?${queryParams}` : ''}`,
			method: 'GET',
			cloudflareAPIToken
		})

		metrics(context.env, {
			metric: 'tunnels_list',
			status: 'completed',
			duration: Date.now() - startTime
		})

		return {
			tunnels: response.result,
			success: response.success,
			errors: response.errors,
			messages: response.messages
		}
	}
})

// Create a new tunnel
export const tunnel_create: ObservableToolCall<typeof tunnel_create.parameters, z.infer<typeof tunnel_create.returns>> = tool({
	name: 'tunnel_create',
	description: 'Create a new Cloudflare Tunnel',
	parameters: z.object({
		account_id: z.string().optional().describe('The account ID. If not provided, uses the active account.'),
		name: z.string().describe('Name of the tunnel'),
		tunnel_secret: z.string().optional().describe('Pre-generated tunnel secret (base64 encoded). If not provided, one will be generated.')
	}),
	returns: z.object({
		tunnel: TunnelSchema,
		credentials: TunnelCredentialsSchema.optional(),
		success: z.boolean(),
		errors: z.array(z.any()).optional(),
		messages: z.array(z.any()).optional()
	}),
	execute: async function (args, context: McpContext): Promise<z.infer<typeof tunnel_create.returns>> {
		const startTime = Date.now()
		metrics(context.env, {
			metric: 'tunnel_create',
			status: 'invoked'
		})

		const { cloudflareAccountId, cloudflareAPIToken } = await getUserAPIInfo(context)
		const accountId = args.account_id || cloudflareAccountId

		const body: any = {
			name: args.name
		}

		if (args.tunnel_secret) {
			body.tunnel_secret = args.tunnel_secret
		}

		const response = await callCloudflareAPI<{
			result: z.infer<typeof TunnelSchema> & { 
				credentials?: z.infer<typeof TunnelCredentialsSchema>
			}
			success: boolean
			errors?: any[]
			messages?: any[]
		}>({
			endpoint: `/accounts/${accountId}/tunnels`,
			method: 'POST',
			body,
			cloudflareAPIToken
		})

		metrics(context.env, {
			metric: 'tunnel_create',
			status: 'completed',
			duration: Date.now() - startTime
		})

		const { credentials, ...tunnel } = response.result

		return {
			tunnel,
			credentials,
			success: response.success,
			errors: response.errors,
			messages: response.messages
		}
	}
})

// Get tunnel details
export const tunnel_get: ObservableToolCall<typeof tunnel_get.parameters, z.infer<typeof tunnel_get.returns>> = tool({
	name: 'tunnel_get',
	description: 'Get details of a specific Cloudflare Tunnel',
	parameters: z.object({
		account_id: z.string().optional().describe('The account ID. If not provided, uses the active account.'),
		tunnel_id: z.string().describe('ID of the tunnel')
	}),
	returns: z.object({
		tunnel: TunnelSchema,
		success: z.boolean(),
		errors: z.array(z.any()).optional(),
		messages: z.array(z.any()).optional()
	}),
	execute: async function (args, context: McpContext): Promise<z.infer<typeof tunnel_get.returns>> {
		const startTime = Date.now()
		metrics(context.env, {
			metric: 'tunnel_get',
			status: 'invoked'
		})

		const { cloudflareAccountId, cloudflareAPIToken } = await getUserAPIInfo(context)
		const accountId = args.account_id || cloudflareAccountId

		const response = await callCloudflareAPI<{
			result: z.infer<typeof TunnelSchema>
			success: boolean
			errors?: any[]
			messages?: any[]
		}>({
			endpoint: `/accounts/${accountId}/tunnels/${args.tunnel_id}`,
			method: 'GET',
			cloudflareAPIToken
		})

		metrics(context.env, {
			metric: 'tunnel_get',
			status: 'completed',
			duration: Date.now() - startTime
		})

		return {
			tunnel: response.result,
			success: response.success,
			errors: response.errors,
			messages: response.messages
		}
	}
})

// Get tunnel configuration
export const tunnel_config_get: ObservableToolCall<typeof tunnel_config_get.parameters, z.infer<typeof tunnel_config_get.returns>> = tool({
	name: 'tunnel_config_get',
	description: 'Get the configuration of a Cloudflare Tunnel',
	parameters: z.object({
		account_id: z.string().optional().describe('The account ID. If not provided, uses the active account.'),
		tunnel_id: z.string().describe('ID of the tunnel')
	}),
	returns: z.object({
		config: TunnelConfigSchema,
		success: z.boolean(),
		errors: z.array(z.any()).optional(),
		messages: z.array(z.any()).optional()
	}),
	execute: async function (args, context: McpContext): Promise<z.infer<typeof tunnel_config_get.returns>> {
		const startTime = Date.now()
		metrics(context.env, {
			metric: 'tunnel_config_get',
			status: 'invoked'
		})

		const { cloudflareAccountId, cloudflareAPIToken } = await getUserAPIInfo(context)
		const accountId = args.account_id || cloudflareAccountId

		const response = await callCloudflareAPI<{
			result: z.infer<typeof TunnelConfigSchema>
			success: boolean
			errors?: any[]
			messages?: any[]
		}>({
			endpoint: `/accounts/${accountId}/tunnels/${args.tunnel_id}/configurations`,
			method: 'GET',
			cloudflareAPIToken
		})

		metrics(context.env, {
			metric: 'tunnel_config_get',
			status: 'completed',
			duration: Date.now() - startTime
		})

		return {
			config: response.result,
			success: response.success,
			errors: response.errors,
			messages: response.messages
		}
	}
})

// Update tunnel configuration
export const tunnel_config_update: ObservableToolCall<typeof tunnel_config_update.parameters, z.infer<typeof tunnel_config_update.returns>> = tool({
	name: 'tunnel_config_update',
	description: 'Update the configuration of a Cloudflare Tunnel',
	parameters: z.object({
		account_id: z.string().optional().describe('The account ID. If not provided, uses the active account.'),
		tunnel_id: z.string().describe('ID of the tunnel'),
		config: z.object({
			ingress: z.array(z.object({
				hostname: z.string().optional().describe('Hostname to match. Leave empty for catch-all rule.'),
				service: z.string().describe('Service to route to (e.g., http://localhost:8080, ssh://localhost:22)'),
				path: z.string().optional().describe('Path pattern to match'),
				originRequest: z.record(z.any()).optional().describe('Origin request configuration')
			})).describe('Ingress rules (processed in order)'),
			warp_routing: z.object({
				enabled: z.boolean()
			}).optional().describe('WARP routing configuration')
		}).describe('Tunnel configuration')
	}),
	returns: z.object({
		config: TunnelConfigSchema,
		success: z.boolean(),
		errors: z.array(z.any()).optional(),
		messages: z.array(z.any()).optional()
	}),
	execute: async function (args, context: McpContext): Promise<z.infer<typeof tunnel_config_update.returns>> {
		const startTime = Date.now()
		metrics(context.env, {
			metric: 'tunnel_config_update',
			status: 'invoked'
		})

		const { cloudflareAccountId, cloudflareAPIToken } = await getUserAPIInfo(context)
		const accountId = args.account_id || cloudflareAccountId

		const response = await callCloudflareAPI<{
			result: z.infer<typeof TunnelConfigSchema>
			success: boolean
			errors?: any[]
			messages?: any[]
		}>({
			endpoint: `/accounts/${accountId}/tunnels/${args.tunnel_id}/configurations`,
			method: 'PUT',
			body: { config: args.config },
			cloudflareAPIToken
		})

		metrics(context.env, {
			metric: 'tunnel_config_update',
			status: 'completed',
			duration: Date.now() - startTime
		})

		return {
			config: response.result,
			success: response.success,
			errors: response.errors,
			messages: response.messages
		}
	}
})

// Delete a tunnel
export const tunnel_delete: ObservableToolCall<typeof tunnel_delete.parameters, z.infer<typeof tunnel_delete.returns>> = tool({
	name: 'tunnel_delete',
	description: 'Delete a Cloudflare Tunnel',
	parameters: z.object({
		account_id: z.string().optional().describe('The account ID. If not provided, uses the active account.'),
		tunnel_id: z.string().describe('ID of the tunnel to delete')
	}),
	returns: z.object({
		tunnel: TunnelSchema,
		success: z.boolean(),
		errors: z.array(z.any()).optional(),
		messages: z.array(z.any()).optional()
	}),
	execute: async function (args, context: McpContext): Promise<z.infer<typeof tunnel_delete.returns>> {
		const startTime = Date.now()
		metrics(context.env, {
			metric: 'tunnel_delete',
			status: 'invoked'
		})

		const { cloudflareAccountId, cloudflareAPIToken } = await getUserAPIInfo(context)
		const accountId = args.account_id || cloudflareAccountId

		const response = await callCloudflareAPI<{
			result: z.infer<typeof TunnelSchema>
			success: boolean
			errors?: any[]
			messages?: any[]
		}>({
			endpoint: `/accounts/${accountId}/tunnels/${args.tunnel_id}`,
			method: 'DELETE',
			cloudflareAPIToken
		})

		metrics(context.env, {
			metric: 'tunnel_delete',
			status: 'completed',
			duration: Date.now() - startTime
		})

		return {
			tunnel: response.result,
			success: response.success,
			errors: response.errors,
			messages: response.messages
		}
	}
})

// Get tunnel token (for connector installation)
export const tunnel_token_get: ObservableToolCall<typeof tunnel_token_get.parameters, z.infer<typeof tunnel_token_get.returns>> = tool({
	name: 'tunnel_token_get',
	description: 'Get a tunnel token for connector installation',
	parameters: z.object({
		account_id: z.string().optional().describe('The account ID. If not provided, uses the active account.'),
		tunnel_id: z.string().describe('ID of the tunnel')
	}),
	returns: z.object({
		token: z.string(),
		success: z.boolean(),
		errors: z.array(z.any()).optional(),
		messages: z.array(z.any()).optional()
	}),
	execute: async function (args, context: McpContext): Promise<z.infer<typeof tunnel_token_get.returns>> {
		const startTime = Date.now()
		metrics(context.env, {
			metric: 'tunnel_token_get',
			status: 'invoked'
		})

		const { cloudflareAccountId, cloudflareAPIToken } = await getUserAPIInfo(context)
		const accountId = args.account_id || cloudflareAccountId

		const response = await callCloudflareAPI<{
			result: { token: string }
			success: boolean
			errors?: any[]
			messages?: any[]
		}>({
			endpoint: `/accounts/${accountId}/tunnels/${args.tunnel_id}/token`,
			method: 'GET',
			cloudflareAPIToken
		})

		metrics(context.env, {
			metric: 'tunnel_token_get',
			status: 'completed',
			duration: Date.now() - startTime
		})

		return {
			token: response.result.token,
			success: response.success,
			errors: response.errors,
			messages: response.messages
		}
	}
})

// List tunnel connections
export const tunnel_connections_list: ObservableToolCall<typeof tunnel_connections_list.parameters, z.infer<typeof tunnel_connections_list.returns>> = tool({
	name: 'tunnel_connections_list',
	description: 'List all active connections for a tunnel',
	parameters: z.object({
		account_id: z.string().optional().describe('The account ID. If not provided, uses the active account.'),
		tunnel_id: z.string().describe('ID of the tunnel')
	}),
	returns: z.object({
		connections: z.array(z.object({
			colo_name: z.string(),
			id: z.string(),
			is_pending_reconnect: z.boolean(),
			origin_ip: z.string(),
			opened_at: z.string(),
			client_id: z.string(),
			client_version: z.string()
		})),
		success: z.boolean(),
		errors: z.array(z.any()).optional(),
		messages: z.array(z.any()).optional()
	}),
	execute: async function (args, context: McpContext): Promise<z.infer<typeof tunnel_connections_list.returns>> {
		const startTime = Date.now()
		metrics(context.env, {
			metric: 'tunnel_connections_list',
			status: 'invoked'
		})

		const { cloudflareAccountId, cloudflareAPIToken } = await getUserAPIInfo(context)
		const accountId = args.account_id || cloudflareAccountId

		const response = await callCloudflareAPI<{
			result: any[]
			success: boolean
			errors?: any[]
			messages?: any[]
		}>({
			endpoint: `/accounts/${accountId}/tunnels/${args.tunnel_id}/connections`,
			method: 'GET',
			cloudflareAPIToken
		})

		metrics(context.env, {
			metric: 'tunnel_connections_list',
			status: 'completed',
			duration: Date.now() - startTime
		})

		return {
			connections: response.result,
			success: response.success,
			errors: response.errors,
			messages: response.messages
		}
	}
})

// Export all tools
export const tunnelsTools = [
	tunnels_list,
	tunnel_create,
	tunnel_get,
	tunnel_config_get,
	tunnel_config_update,
	tunnel_delete,
	tunnel_token_get,
	tunnel_connections_list
]