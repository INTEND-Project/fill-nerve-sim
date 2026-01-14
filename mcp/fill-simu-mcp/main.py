from fastmcp import FastMCP
import argparse
from proxy import BaseProxy


mcp = FastMCP("MCP NERVE API")
proxy:BaseProxy = None

@mcp.tool
def apply_node_config(serial_number: str, config: str) -> str:
    """Deploy workloads into a selected machine using Nerve DNA API.
    Inputs:
    - serial_number: serial number of the machine (node)
    - config: Node configuration YAML string, with workloads to deploy e.g., ```
schema_version: 1
workloads:
  - name: DC1
    version: version1
    hash: hash1
  - name: DC2
    version: version2
    Outputs:``` name and version are required fields for workloads.

    Outputs:
    - "Success" if applied successfully, otherwise error message.

    """
    try:
        result = proxy.apply_node_config(serial_number, config)
        return "Success" if result else "Failed"
    except Exception as e:
        return str(e)

#!/usr/bin/env python3
if __name__ == "__main__":
    """Parameters:
    --api-host: Host for the API server, e.g., http://localhost:8080/nerve
    --mock-proxy: If set, use a mock proxy without a real server connection
    --local: If set, run in local mcp model
    --server: if set, run in REST mcp mode
    --port: Port for the mcp server (default:5000)
    """
    parser = argparse.ArgumentParser(description="Run MCP NERVE API")
    parser.add_argument("--api-host", type=str, default=None,
                        help="Host for the API server, e.g., http://localhost:8080/nerve")
    parser.add_argument("--mock-proxy", action="store_true",
                        help="If set, use a mock proxy without a real server connection")
    parser.add_argument("--local", action="store_true",
                        help="If set, run in local mcp model")
    parser.add_argument("--server", action="store_true",
                        help="If set, run in REST mcp mode")
    parser.add_argument("--port", type=int, default=5000,
                        help="Port for the mcp server (default: 5005)")

    args = parser.parse_args()

    if args.local and args.server:
        parser.error("Cannot set both --local and --server at the same time.")

    if args.mock_proxy:
        proxy = BaseProxy()
    elif args.api_host:
        print (f"API host not supported yet, using --mock-proxy instead.")
    else:
        print (f"No proxy provided, use --mock-proxy by default.")
        proxy = BaseProxy()

    if args.local:
        mcp.run()
    elif args.server:
        port = args.port if args.port else 5005
        mcp.run(transport="http", host="0.0.0.0",port=port)
    else:
        print("No--server is set. run as local by default.") 
        mcp.run()