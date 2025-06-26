import { McpDurableObject } from '@repo/mcp-common/src/durable-objects/mcp.do'
import type { Env } from './tunnels.context'
import { tunnelsTools } from './tools/tunnels.tools'
import { createWorkerRouter } from '@repo/mcp-common/src/routes/workerRoutes'

export class CloudflareTunnelsMCP extends McpDurableObject<Env> {
	env: Env

	constructor(state: DurableObjectState, env: Env) {
		super(state, env)
		this.env = env
		this.serverParams = {
			name: 'Cloudflare Tunnels MCP Server',
			version: '0.1.0',
			capabilities: {
				tools: {}
			}
		}
		this.tools = tunnelsTools
	}
}

export default createWorkerRouter<Env>({
	durableObjectName: 'CloudflareTunnelsMCP',
	serverParams: {
		name: 'Cloudflare Tunnels MCP Server',
		version: '0.1.0',
		capabilities: {
			tools: {}
		}
	}
})