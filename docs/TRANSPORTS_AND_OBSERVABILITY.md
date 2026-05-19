# Transports and Observability

## Scope of stdio MCP

The stdio MCP transport captures only explicit tool calls directed to this server.

It does not automatically capture all activity in a host application. It records what is routed into Nyxa MCP tool invocation boundaries.

## HTTP Audit Sink (Future)

An HTTP audit sink is intended for events emitted by hooks, wrappers, and proxies.

This allows event intake beyond direct MCP tool calls and supports broader timeline capture when clients intentionally emit governance events.

## Streamable HTTP MCP (Long-Term Target)

Streamable HTTP MCP is the long-term MCP-native remote transport target.

It is intended to preserve MCP semantics while enabling remote operation, service-level deployment, and controlled integration patterns beyond local stdio sessions.

## Gateway / Proxy Layer

A Nyxa gateway/proxy is the layer for full action-chain visibility when client traffic is routed through Nyxa.

It can correlate lifecycle events from request ingress to governance outcomes, provided clients use Nyxa-controlled routing surfaces.

## Exact Boundary

Full action-chain observability requires routing events through Nyxa and only applies to clients that emit or route those events through Nyxa-controlled hooks, wrappers, proxies, or MCP transports.

## Explicitly Out of Scope

- passive observation of all Claude Desktop/Web chats
- observation of other MCP servers not routed through Nyxa
- bash/file actions not routed through Nyxa
- computer-use actions not routed through Nyxa
