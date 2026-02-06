import json
import os
import subprocess
import sys
from typing import Any, Dict, List, Optional

import requests
from openai import OpenAI

WORKDIR = os.getenv("AGENT_WORKDIR", "/agent")
SKILLS_DIR = os.path.join(WORKDIR, "skills")
MENU_FILE = os.path.join(SKILLS_DIR, "menu.md")
API_KEY_FILE = os.getenv("OPENAI_API_KEY_FILE", os.path.join(WORKDIR, "openai.credential"))
MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini")
VERBOSE_DEFAULT = os.getenv("AGENT_VERBOSE", "true").lower() in {"1", "true", "yes", "on"}
MAX_LOG_CHARS = int(os.getenv("AGENT_LOG_MAX_CHARS", "2000"))


def read_text_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def safe_abs_path(path: str) -> str:
    abs_path = os.path.abspath(path)
    if not abs_path.startswith(os.path.abspath(WORKDIR) + os.sep):
        raise ValueError(f"Path must be within {WORKDIR}")
    return abs_path


def load_skills_context() -> str:
    lines: List[str] = []
    if os.path.isfile(MENU_FILE):
        lines.append("Skills menu (from skills/menu.md):")
        lines.append(read_text_file(MENU_FILE).strip())
    else:
        lines.append("No skills menu found at skills/menu.md.")

    if os.path.isdir(SKILLS_DIR):
        for entry in sorted(os.listdir(SKILLS_DIR)):
            skill_path = os.path.join(SKILLS_DIR, entry)
            if not os.path.isdir(skill_path):
                continue
            skill_file = os.path.join(skill_path, "SKILL.md")
            if os.path.isfile(skill_file):
                lines.append(f"\nSkill: {entry}")
                lines.append(read_text_file(skill_file).strip())
    else:
        lines.append("No skills directory found.")

    return "\n".join(lines).strip()


def build_system_prompt(skills_context: str) -> str:
    base = (
        "You are a command-line agent running in a container with access to a local shell and file system. "
        "Use the provided tools when you need to read/write files, run shell commands, execute Python, or call remote APIs. "
        "When a task requires an external API, consult the SKILL.md instructions and use the http_request tool accordingly. "
        "If needed information is missing or unclear, ask a concise follow-up question."
    )
    return f"{base}\n\n{skills_context}".strip()


def tool_definitions() -> List[Dict[str, Any]]:
    return [
        {
            "type": "function",
            "name": "run_shell",
            "description": "Run a shell command in the container and return stdout, stderr, and exit code.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to execute."},
                    "cwd": {
                        "type": "string",
                        "description": "Working directory. Defaults to /agent.",
                    },
                },
                "required": ["command"],
            },
        },
        {
            "type": "function",
            "name": "run_python",
            "description": "Execute a Python code snippet and return stdout, stderr, and exit code.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Python code to run."},
                },
                "required": ["code"],
            },
        },
        {
            "type": "function",
            "name": "read_file",
            "description": "Read a UTF-8 text file under /agent.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to the file."},
                },
                "required": ["path"],
            },
        },
        {
            "type": "function",
            "name": "write_file",
            "description": "Write UTF-8 text to a file under /agent, creating directories if needed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to the file."},
                    "content": {"type": "string", "description": "File contents."},
                },
                "required": ["path", "content"],
            },
        },
        {
            "type": "function",
            "name": "list_dir",
            "description": "List files and directories under /agent.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Directory path to list. Defaults to /agent.",
                    }
                },
            },
        },
        {
            "type": "function",
            "name": "http_request",
            "description": "Call a remote HTTP API and return status, headers, and body.",
            "parameters": {
                "type": "object",
                "properties": {
                    "method": {"type": "string", "description": "HTTP method, e.g. GET, POST."},
                    "url": {"type": "string", "description": "Full URL."},
                    "headers": {"type": "object", "description": "HTTP headers."},
                    "params": {"type": "object", "description": "Query parameters."},
                    "json": {"type": "object", "description": "JSON body."},
                    "data": {"type": "string", "description": "Raw body as string."},
                    "timeout": {"type": "number", "description": "Timeout in seconds."},
                },
                "required": ["method", "url"],
            },
        },
    ]


def run_shell(command: str, cwd: Optional[str]) -> Dict[str, Any]:
    workdir = cwd or WORKDIR
    result = subprocess.run(
        command,
        shell=True,
        cwd=workdir,
        capture_output=True,
        text=True,
    )
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.returncode,
    }


def run_python(code: str) -> Dict[str, Any]:
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        cwd=WORKDIR,
    )
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.returncode,
    }


def read_file(path: str) -> Dict[str, Any]:
    abs_path = safe_abs_path(path)
    return {"content": read_text_file(abs_path)}


def write_file(path: str, content: str) -> Dict[str, Any]:
    abs_path = safe_abs_path(path)
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, "w", encoding="utf-8") as handle:
        handle.write(content)
    return {"status": "ok", "path": abs_path}


def list_dir(path: Optional[str]) -> Dict[str, Any]:
    target = path or WORKDIR
    abs_path = safe_abs_path(target)
    entries = []
    for name in sorted(os.listdir(abs_path)):
        full_path = os.path.join(abs_path, name)
        entries.append({"name": name, "type": "dir" if os.path.isdir(full_path) else "file"})
    return {"path": abs_path, "entries": entries}


def http_request(
    method: str,
    url: str,
    headers: Optional[Dict[str, str]] = None,
    params: Optional[Dict[str, Any]] = None,
    json_body: Optional[Dict[str, Any]] = None,
    data: Optional[str] = None,
    timeout: Optional[float] = None,
) -> Dict[str, Any]:
    response = requests.request(
        method=method,
        url=url,
        headers=headers,
        params=params,
        json=json_body,
        data=data,
        timeout=timeout or 30,
    )
    return {
        "status_code": response.status_code,
        "headers": dict(response.headers),
        "body": response.text,
    }


def dispatch_tool(name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    if name == "run_shell":
        return run_shell(args["command"], args.get("cwd"))
    if name == "run_python":
        return run_python(args["code"])
    if name == "read_file":
        return read_file(args["path"])
    if name == "write_file":
        return write_file(args["path"], args["content"])
    if name == "list_dir":
        return list_dir(args.get("path"))
    if name == "http_request":
        return http_request(
            method=args["method"],
            url=args["url"],
            headers=args.get("headers"),
            params=args.get("params"),
            json_body=args.get("json"),
            data=args.get("data"),
            timeout=args.get("timeout"),
        )
    raise ValueError(f"Unknown tool: {name}")


def extract_tool_calls(response: Any) -> List[Any]:
    calls = []
    for item in getattr(response, "output", []):
        if getattr(item, "type", "") == "function_call":
            calls.append(item)
    return calls


def extract_text(response: Any) -> str:
    text = getattr(response, "output_text", None)
    if text:
        return text
    parts = []
    for item in getattr(response, "output", []):
        if getattr(item, "type", "") == "message":
            for content in getattr(item, "content", []):
                if getattr(content, "type", "") == "output_text":
                    parts.append(getattr(content, "text", ""))
    return "\n".join(parts).strip()


def load_api_key() -> str:
    if not os.path.isfile(API_KEY_FILE):
        raise FileNotFoundError(f"Missing API key file: {API_KEY_FILE}")
    key = read_text_file(API_KEY_FILE).strip()
    if not key:
        raise ValueError(f"API key file is empty: {API_KEY_FILE}")
    return key


def main() -> None:
    try:
        api_key = load_api_key()
    except Exception as exc:
        print(f"Error: {exc}")
        print("Create /agent/openai.credential with your OpenAI API key (plain text).")
        sys.exit(1)

    client = OpenAI(api_key=api_key)
    last_response_id: Optional[str] = None
    verbose = VERBOSE_DEFAULT

    print("Agent ready. Type :help for commands.")
    print(f"Model: {MODEL}")

    while True:
        try:
            user_input = input("\n> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye.")
            break

        if not user_input:
            continue
        if user_input in {":exit", ":quit"}:
            print("Bye.")
            break
        if user_input == ":help":
            print("Commands: :help, :skills, :verbose, :exit")
            continue
        if user_input == ":skills":
            print(load_skills_context())
            continue
        if user_input == ":verbose":
            verbose = not verbose
            print(f"Verbose mode: {'on' if verbose else 'off'}")
            continue

        skills_context = load_skills_context()
        system_prompt = build_system_prompt(skills_context)

        try:
            response = client.responses.create(
                model=MODEL,
                input=[{"role": "user", "content": user_input}],
                instructions=system_prompt,
                tools=tool_definitions(),
                previous_response_id=last_response_id,
            )
        except Exception as exc:
            print(f"Error: OpenAI request failed: {exc}")
            continue

        while True:
            tool_calls = extract_tool_calls(response)
            if not tool_calls:
                break
            tool_outputs = []
            for call in tool_calls:
                call_id = getattr(call, "call_id", None) or getattr(call, "id", None)
                if not call_id:
                    continue
                try:
                    args = json.loads(getattr(call, "arguments", "") or "{}")
                except json.JSONDecodeError:
                    args = {}
                if verbose:
                    print(f"\n[tool] {getattr(call, 'name', '')} args={args}")
                try:
                    result = dispatch_tool(getattr(call, "name", ""), args)
                except Exception as exc:
                    result = {"error": str(exc)}
                if verbose:
                    preview = json.dumps(result)
                    if len(preview) > MAX_LOG_CHARS:
                        preview = preview[:MAX_LOG_CHARS] + "...(truncated)"
                    print(f"[tool] output={preview}")
                tool_outputs.append(
                    {
                        "type": "function_call_output",
                        "call_id": call_id,
                        "output": json.dumps(result),
                    }
                )
            try:
                response = client.responses.create(
                    model=MODEL,
                    input=tool_outputs,
                    instructions=system_prompt,
                    tools=tool_definitions(),
                    previous_response_id=response.id,
                )
            except Exception as exc:
                print(f"Error: OpenAI follow-up failed: {exc}")
                response = None
                break

        if response is None:
            continue
        last_response_id = response.id
        text = extract_text(response)
        print(text or "(no response)")


if __name__ == "__main__":
    main()
