# MCP server for Fill's Nerve API

# Native run

Recommend to use uv (install [here](https://docs.astral.sh/uv/getting-started/installation/)), and remember ```bash uv sync``` for the first time

## Local (stdio) mcp server
```bash uv run main.py```

## REST mcp server
```bash uv run main.py --server --port=5001```

Port is optional, 5000 by default

## Other parameters
- --api-host <url>  
  Host for the external Nerve API server (e.g., http://localhost:8080/nerve). When provided the tool will attempt to use a real proxy endpoint (note: current behavior may fall back to the mock proxy).

- --mock-proxy  
  Use a mock proxy implementation (no real server connection). Useful for local testing and development. If set, it overrides external proxy behavior.

- --local  
  Run MCP in local (stdio) mode. Cannot be used together with --server.

- --server  
  Run MCP in REST server mode (starts an HTTP endpoint). Cannot be used together with --local.

- --port <int> (default: 5005)  
  Port to use when running with --server.

Notes:
- Setting both --local and --server will cause an error.
- Examples:
  - uv run main.py --mock-proxy


# Run inside a container

```bash docker build -t my-fill-mcp . ```    
```bash docker run -it -p 5005:5005 my-fill-mcp python main.py --server --port=5005```

