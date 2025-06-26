# Cloudflare Tunnels MCP Server

This is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) server that supports remote MCP connections for managing Cloudflare Tunnels.

Cloudflare Tunnels create secure connections between your resources and Cloudflare without a publicly routable IP address. This MCP server provides tools to create, configure, and manage tunnels programmatically.

## 🔨 Available Tools

| **Tool**                    | **Description**                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `tunnels_list`              | List all Cloudflare Tunnels in your account                                        |
| `tunnel_create`             | Create a new Cloudflare Tunnel                                                     |
| `tunnel_get`                | Get details of a specific Cloudflare Tunnel                                        |
| `tunnel_config_get`         | Get the configuration of a Cloudflare Tunnel                                       |
| `tunnel_config_update`      | Update the configuration of a Cloudflare Tunnel (ingress rules, WARP routing)      |
| `tunnel_delete`             | Delete a Cloudflare Tunnel                                                         |
| `tunnel_token_get`          | Get a tunnel token for connector installation                                      |
| `tunnel_connections_list`   | List all active connections for a tunnel                                           |

### Prompt Examples

- `List all my Cloudflare Tunnels.`
- `Create a new tunnel called 'production-api'.`
- `Show me the configuration for tunnel 'YOUR_TUNNEL_ID'.` (Replace YOUR_TUNNEL_ID)
- `Update the tunnel 'YOUR_TUNNEL_ID' to route api.example.com to http://localhost:8080.`
- `Add a new ingress rule to tunnel 'YOUR_TUNNEL_ID' for ssh.example.com pointing to ssh://localhost:22.`
- `Get the installation token for tunnel 'YOUR_TUNNEL_ID'.`
- `Show me all active connections for tunnel 'YOUR_TUNNEL_ID'.`
- `Delete the tunnel 'OLD_TUNNEL_ID'.` (Replace OLD_TUNNEL_ID)

### Common Tunnel Configuration Examples

#### Basic Web Service
```
Update tunnel 'TUNNEL_ID' with ingress rules:
- example.com → http://localhost:3000
- www.example.com → http://localhost:3000
- Catch-all → http_status:404
```

#### Multiple Services
```
Configure tunnel 'TUNNEL_ID' with:
- api.example.com → http://localhost:8080
- app.example.com → http://localhost:3000
- ssh.example.com → ssh://localhost:22
- *.dev.example.com → http://localhost:4000
- Catch-all → http_status:404
```

#### With Path Routing
```
Update tunnel 'TUNNEL_ID' ingress:
- example.com/api/* → http://localhost:8080
- example.com/app/* → http://localhost:3000
- example.com → http://localhost:80
```

## Access the remote MCP server from any MCP Client

If your MCP client has first class support for remote MCP servers, the client will provide a way to accept the server URL (`https://tunnels.mcp.cloudflare.com`) directly within its interface.

If your client does not yet support remote MCP servers, you will need to set up its respective configuration file using [mcp-remote](https://www.npmjs.com/package/mcp-remote) to specify which servers your client can access.

```json
{
	"mcpServers": {
		"cloudflare-tunnels": {
			"command": "npx",
			"args": ["mcp-remote", "https://tunnels.mcp.cloudflare.com/sse"]
		}
	}
}
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup instructions.