import argparse
import json
import os
import subprocess
import sys
import threading
from queue import Empty, Queue
from dataclasses import dataclass
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional

import requests
from openai import OpenAI

WORKDIR = os.getenv("AGENT_WORKDIR", "/agent")
SKILLS_DIR = os.path.join(WORKDIR, "skills")
GLOBAL_SKILL_FILE = os.path.join(SKILLS_DIR, "SKILL.md")
LOGS_DIR = os.path.join(WORKDIR, "logs")
API_KEY_FILE = os.getenv("OPENAI_API_KEY_FILE", os.path.join(WORKDIR, "openai.credential"))
MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini")
VERBOSE_DEFAULT = os.getenv("AGENT_VERBOSE", "true").lower() in {"1", "true", "yes", "on"}
MAX_LOG_CHARS = int(os.getenv("AGENT_LOG_MAX_CHARS", "2000"))
HTTP_HOST_DEFAULT = os.getenv("AGENT_HTTP_HOST", "0.0.0.0")
HTTP_PORT_DEFAULT = int(os.getenv("AGENT_HTTP_PORT", "8090"))


class LogStreamHub:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._subscribers: List[Queue[str]] = []

    def subscribe(self) -> Queue[str]:
        queue: Queue[str] = Queue()
        with self._lock:
            self._subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: Queue[str]) -> None:
        with self._lock:
            if queue in self._subscribers:
                self._subscribers.remove(queue)

    def publish(self, message: str) -> None:
        with self._lock:
            subscribers = list(self._subscribers)
        for queue in subscribers:
            queue.put(message)


LOG_STREAM_HUB = LogStreamHub()


def read_text_file(path: str) -> str:
    with open(path, "r", encoding="utf-8") as handle:
        return handle.read()


def safe_abs_path(path: str) -> str:
    abs_path = os.path.abspath(path)
    if not abs_path.startswith(os.path.abspath(WORKDIR) + os.sep):
        raise ValueError(f"Path must be within {WORKDIR}")
    return abs_path


def log_event(event_type: str, payload: Dict[str, Any]) -> None:
    os.makedirs(LOGS_DIR, exist_ok=True)
    timestamp = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    date_str = datetime.utcnow().date().isoformat()
    log_path = os.path.join(LOGS_DIR, f"{date_str}.log")
    record = {"ts": timestamp, "event": event_type, **payload}
    line = json.dumps(record, ensure_ascii=True)
    with open(log_path, "a", encoding="utf-8") as handle:
        handle.write(line + "\n")
    LOG_STREAM_HUB.publish(line)


def extract_skill_overview(skill_text: str) -> str:
    lines = skill_text.splitlines()
    start_index = None
    for idx, line in enumerate(lines):
        if line.strip() == "#SKILL.md":
            start_index = idx + 1
            break
    if start_index is None:
        return ""
    overview_lines = []
    for line in lines[start_index:]:
        if line.lstrip().startswith("#"):
            break
        overview_lines.append(line)
    return "\n".join(overview_lines).strip()


def list_skills_overview() -> str:
    if not os.path.isdir(SKILLS_DIR):
        return "No skills directory found."

    entries = []
    if os.path.isfile(GLOBAL_SKILL_FILE):
        entries.append("- (global) SKILL.md: present")
    else:
        entries.append("- (global) SKILL.md: missing")

    for entry in sorted(os.listdir(SKILLS_DIR)):
        if entry == "SKILL.md":
            continue
        skill_path = os.path.join(SKILLS_DIR, entry)
        if not os.path.isdir(skill_path):
            continue
        skill_file = os.path.join(skill_path, "SKILL.md")
        if not os.path.isfile(skill_file):
            continue
        overview = extract_skill_overview(read_text_file(skill_file))
        if overview:
            entries.append(f"- {entry}: {overview}")
        else:
            entries.append(f"- {entry}: (no overview found)")

    if not entries:
        return "No skills found."

    return "Available skills:\n" + "\n".join(entries)


def load_global_skill() -> str:
    if not os.path.isfile(GLOBAL_SKILL_FILE):
        return ""
    return read_text_file(GLOBAL_SKILL_FILE).strip()


def is_valid_skill_name(name: str) -> bool:
    if not name or name.strip() != name:
        return False
    if os.path.sep in name or (os.path.altsep and os.path.altsep in name):
        return False
    if name in {".", ".."} or ".." in name:
        return False
    return True


def base_system_prompt() -> str:
    return (
        "You are a command-line agent running in a container with access to a local shell and file system. "
        "Use the provided tools when you need to read/write files, run shell commands, execute Python, or call remote APIs. "
        "If needed information is missing or unclear, ask a concise follow-up question."
    )


def build_captain_prompt(skills_context: str, global_skill: str) -> str:
    base = base_system_prompt()
    captain_rules = (
        "You are the main coordinator agent named 'captain'. "
        "Use the global SKILL.md below for domain instructions and workflows. "
        "When a task should be specialized, split it into subtasks and delegate them via the delegate_task tool. "
        "Do not load multiple skills into a single agent; each sub-agent must specialize in a single skill."
    )
    sections = [base, captain_rules]
    if global_skill:
        sections.append("Global SKILL.md:\n" + global_skill)
    sections.append(skills_context)
    return "\n\n".join(section for section in sections if section).strip()


def build_worker_prompt(skill_name: str, skill_content: str, agent_name: str) -> str:
    base = base_system_prompt()
    worker_rules = (
        f"You are a specialized sub-agent named '{agent_name}'. "
        f"You are strictly limited to the skill '{skill_name}' and must not use or request other skills. "
        "If a request is outside this skill, say so plainly."
    )
    sections = [base, worker_rules, f"Skill '{skill_name}' SKILL.md:\n{skill_content}"]
    return "\n\n".join(section for section in sections if section).strip()


def tool_definitions(include_delegate: bool) -> List[Dict[str, Any]]:
    tools: List[Dict[str, Any]] = [
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
    if include_delegate:
        tools.append(
            {
                "type": "function",
                "name": "delegate_task",
                "description": "Delegate a subtask to a named sub-agent using a single skill.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "agent_name": {"type": "string", "description": "Sub-agent name."},
                        "skill_name": {"type": "string", "description": "Skill folder name."},
                        "task": {"type": "string", "description": "Task description for the sub-agent."},
                    },
                    "required": ["agent_name", "skill_name", "task"],
                },
            }
        )
        tools.append(
            {
                "type": "function",
                "name": "list_agents",
                "description": "List active agents and their assigned skills.",
                "parameters": {"type": "object", "properties": {}},
            }
        )
    return tools


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

@dataclass
class AgentState:
    name: str
    role: str
    last_response_id: Optional[str] = None
    skill_name: Optional[str] = None
    skill_content: Optional[str] = None


@dataclass
class AgentManager:
    client: OpenAI
    agents: Dict[str, AgentState]
    verbose: bool

    def captain(self) -> AgentState:
        return self.agents["captain"]


def load_skill_content(skill_name: str) -> str:
    if not is_valid_skill_name(skill_name):
        raise ValueError("Invalid skill name.")
    skill_file = os.path.join(SKILLS_DIR, skill_name, "SKILL.md")
    abs_path = safe_abs_path(skill_file)
    if not os.path.isfile(abs_path):
        raise FileNotFoundError(f"Skill not found: {skill_name}")
    return read_text_file(abs_path).strip()


def list_agents(agents: Dict[str, AgentState]) -> Dict[str, Any]:
    summary = []
    for name in sorted(agents.keys()):
        agent = agents[name]
        summary.append(
            {
                "name": agent.name,
                "role": agent.role,
                "skill": agent.skill_name,
            }
        )
    return {"agents": summary}


def run_agent_turn(
    client: OpenAI,
    agent: AgentState,
    user_input: str,
    skills_context: str,
    global_skill: str,
    agents: Dict[str, AgentState],
    verbose: bool,
) -> str:
    if agent.role == "captain":
        system_prompt = build_captain_prompt(skills_context, global_skill)
        tools = tool_definitions(include_delegate=True)
    else:
        if not agent.skill_name or agent.skill_content is None:
            return "Error: sub-agent is missing a skill."
        system_prompt = build_worker_prompt(agent.skill_name, agent.skill_content, agent.name)
        tools = tool_definitions(include_delegate=False)

    try:
        response = client.responses.create(
            model=MODEL,
            input=[{"role": "user", "content": user_input}],
            instructions=system_prompt,
            tools=tools,
            previous_response_id=agent.last_response_id,
        )
    except Exception as exc:
        return f"Error: OpenAI request failed: {exc}"

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
            log_event(
                "tool_invocation",
                {
                    "agent": agent.name,
                    "tool": getattr(call, "name", ""),
                    "args": args,
                },
            )
            if verbose:
                print(f"\n[{agent.name} tool] {getattr(call, 'name', '')} args={args}")
            try:
                result = dispatch_tool(
                    getattr(call, "name", ""),
                    args,
                    agent=agent,
                    agents=agents,
                    client=client,
                    skills_context=skills_context,
                    global_skill=global_skill,
                    verbose=verbose,
                )
            except Exception as exc:
                result = {"error": str(exc)}
            log_event(
                "tool_result",
                {
                    "agent": agent.name,
                    "tool": getattr(call, "name", ""),
                    "result": result,
                },
            )
            if verbose:
                preview = json.dumps(result)
                if len(preview) > MAX_LOG_CHARS:
                    preview = preview[:MAX_LOG_CHARS] + "...(truncated)"
                print(f"[{agent.name} tool] output={preview}")
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
                tools=tools,
                previous_response_id=response.id,
            )
        except Exception as exc:
            return f"Error: OpenAI follow-up failed: {exc}"

    agent.last_response_id = response.id
    return extract_text(response) or "(no response)"


def dispatch_tool(
    name: str,
    args: Dict[str, Any],
    *,
    agent: AgentState,
    agents: Dict[str, AgentState],
    client: OpenAI,
    skills_context: str,
    global_skill: str,
    verbose: bool,
) -> Dict[str, Any]:
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
    if name == "list_agents":
        return list_agents(agents)
    if name == "delegate_task":
        if agent.role != "captain":
            return {"error": "Only the captain can delegate tasks."}
        agent_name = args["agent_name"]
        skill_name = args["skill_name"]
        task = args["task"]
        if not is_valid_skill_name(skill_name):
            return {"error": "Invalid skill name."}
        if agent_name in agents:
            worker = agents[agent_name]
            if worker.role != "worker":
                return {"error": "Agent name is already used by a non-worker."}
            if worker.skill_name and worker.skill_name != skill_name:
                return {
                    "error": f"Agent '{agent_name}' is bound to skill '{worker.skill_name}'."
                }
        else:
            worker = AgentState(name=agent_name, role="worker")
            agents[agent_name] = worker
            log_event(
                "agent_created",
                {
                    "agent": worker.name,
                    "created_by": agent.name,
                    "role": worker.role,
                },
            )

        if worker.skill_name is None:
            try:
                worker.skill_content = load_skill_content(skill_name)
            except Exception as exc:
                return {"error": str(exc)}
            worker.skill_name = skill_name
            log_event(
                "skill_loaded",
                {
                    "agent": worker.name,
                    "skill": worker.skill_name,
                },
            )

        log_event(
            "agent_message",
            {
                "from": agent.name,
                "to": worker.name,
                "content": task,
            },
        )
        response_text = run_agent_turn(
            client=client,
            agent=worker,
            user_input=task,
            skills_context=skills_context,
            global_skill=global_skill,
            agents=agents,
            verbose=verbose,
        )
        log_event(
            "agent_message",
            {
                "from": worker.name,
                "to": agent.name,
                "content": response_text,
            },
        )
        return {"agent_name": worker.name, "response": response_text}

    raise ValueError(f"Unknown tool: {name}")


def process_user_input(manager: AgentManager, user_input: str) -> str:
    skills_context = list_skills_overview()
    global_skill = load_global_skill()
    if global_skill:
        log_event(
            "skill_loaded",
            {
                "agent": manager.captain().name,
                "skill": "global",
            },
        )
    return run_agent_turn(
        client=manager.client,
        agent=manager.captain(),
        user_input=user_input,
        skills_context=skills_context,
        global_skill=global_skill,
        agents=manager.agents,
        verbose=manager.verbose,
    )


class AgentHTTPRequestHandler(BaseHTTPRequestHandler):
    manager: AgentManager

    def _send_json(self, status: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self) -> None:
        if self.path != "/intent":
            self._send_json(404, {"error": "Not found."})
            return
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length > 0 else b""
        try:
            data = json.loads(raw.decode("utf-8")) if raw else {}
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON body."})
            return
        user_input = data.get("input")
        if not isinstance(user_input, str) or not user_input.strip():
            self._send_json(400, {"error": "Missing 'input' string."})
            return
        response_text = process_user_input(self.manager, user_input.strip())
        self._send_json(200, {"response": response_text})

    def do_GET(self) -> None:
        if self.path == "/skills":
            self._send_json(200, {"skills": list_skills_overview()})
            return
        if self.path == "/agents":
            self._send_json(200, list_agents(self.manager.agents))
            return
        if self.path == "/logs/stream":
            self._handle_log_stream()
            return
        self._send_json(404, {"error": "Not found."})

    def _handle_log_stream(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        queue = LOG_STREAM_HUB.subscribe()
        try:
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            while True:
                try:
                    message = queue.get(timeout=15)
                    safe_message = message.replace("\n", "\\n")
                    payload = f"data: {safe_message}\n\n".encode("utf-8")
                    self.wfile.write(payload)
                    self.wfile.flush()
                except Empty:
                    self.wfile.write(b": keep-alive\n\n")
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            LOG_STREAM_HUB.unsubscribe(queue)

    def log_message(self, format: str, *args: Any) -> None:
        return


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
    parser = argparse.ArgumentParser(description="Agent runner")
    parser.add_argument("--http", action="store_true", help="Run as HTTP server")
    parser.add_argument("--host", default=HTTP_HOST_DEFAULT, help="HTTP host")
    parser.add_argument("--port", type=int, default=HTTP_PORT_DEFAULT, help="HTTP port")
    args = parser.parse_args()

    try:
        api_key = load_api_key()
    except Exception as exc:
        print(f"Error: {exc}")
        print("Create /agent/openai.credential with your OpenAI API key (plain text).")
        sys.exit(1)

    client = OpenAI(api_key=api_key)
    agents: Dict[str, AgentState] = {"captain": AgentState(name="captain", role="captain")}
    manager = AgentManager(client=client, agents=agents, verbose=VERBOSE_DEFAULT)

    if args.http:
        server = ThreadingHTTPServer((args.host, args.port), AgentHTTPRequestHandler)
        AgentHTTPRequestHandler.manager = manager
        print(f"Agent HTTP server on http://{args.host}:{args.port}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down.")
        return

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
            print("Commands: :help, :skills, :agents, :kill <agent>, :verbose, :exit")
            continue
        if user_input == ":skills":
            print(list_skills_overview())
            continue
        if user_input == ":agents":
            print(json.dumps(list_agents(agents), indent=2))
            continue
        if user_input.startswith(":kill "):
            target = user_input.split(" ", 1)[1].strip()
            if not target:
                print("Usage: :kill <agent_name>")
                continue
            if target == "captain":
                print("Cannot kill captain.")
                continue
            if target in agents:
                del agents[target]
                log_event(
                    "agent_killed",
                    {
                        "agent": target,
                        "killed_by": "user",
                    },
                )
                print(f"Killed agent: {target}")
            else:
                print(f"No such agent: {target}")
            continue
        if user_input == ":verbose":
            manager.verbose = not manager.verbose
            print(f"Verbose mode: {'on' if manager.verbose else 'off'}")
            continue

        text = process_user_input(manager, user_input)
        print(text or "(no response)")


if __name__ == "__main__":
    main()
