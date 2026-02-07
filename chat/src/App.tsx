import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const API_URL = 'http://localhost:8090/intent';
const LOG_STREAM_URL = 'http://localhost:8090/logs/stream';

type Message = {
  id: string;
  role: 'user' | 'agent' | 'system';
  text: string;
};

const initialMessages: Message[] = [
  {
    id: 'welcome',
    role: 'system',
    text: 'Hello! Ask me anything about the system and I will respond.'
  }
];

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logStatus, setLogStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const listRef = useRef<HTMLDivElement | null>(null);
  const logListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  const scrollToBottom = useCallback(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const node = logListRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [logs]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const source = new EventSource(LOG_STREAM_URL);

    source.onopen = () => {
      setLogStatus('connected');
    };

    source.onerror = () => {
      setLogStatus('disconnected');
    };

    source.onmessage = (event) => {
      if (!event.data) return;
      setLogs((prev) => [...prev, event.data]);
    };

    return () => {
      source.close();
    };
  }, []);

  const pushMessage = (message: Message) => {
    setMessages((prev) => [...prev, message]);
  };

  const sendMessage = async () => {
    if (!canSend) return;

    const trimmed = input.trim();
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed
    };

    setInput('');
    setError(null);
    pushMessage(userMessage);
    setIsSending(true);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: trimmed })
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const json = (await response.json()) as { response?: string };
      const agentText = json.response ?? 'No response received.';

      pushMessage({
        id: `agent-${Date.now()}`,
        role: 'agent',
        text: agentText
      });
    } catch (err) {
      console.error(err);
      setError('Unable to reach the agent. Check that the backend is running on :8090.');
      pushMessage({
        id: `error-${Date.now()}`,
        role: 'system',
        text: 'Something went wrong while sending your message.'
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-app">
      <header className="chat-header">
        <div>
          <p className="chat-title">Nerve Agent</p>
          <p className="chat-subtitle">Connected on port 8090</p>
        </div>
        <div className="status-pill">
          <span className={`status-dot ${isSending ? 'busy' : 'ready'}`} />
          {isSending ? 'Thinking…' : 'Ready'}
        </div>
      </header>

      <main className="chat-panels">
        <section className="panel logs-panel">
          <div className="panel-header">
            <div>
              <p className="panel-title">Agent Logs</p>
              <p className="panel-subtitle">Live stream from /logs/stream</p>
            </div>
            <div className={`log-status ${logStatus}`}>
              <span className="status-dot" />
              {logStatus === 'connected' ? 'Live' : 'Reconnecting'}
            </div>
          </div>
          <div className="log-list" ref={logListRef}>
            {logs.length === 0 ? (
              <p className="empty-state">Waiting for log events…</p>
            ) : (
              logs.map((entry, index) => (
                <div key={`${entry}-${index}`} className="log-row">
                  {entry}
                </div>
              ))
            )}
          </div>
        </section>

        <div className="chat-column">
          <section className="panel chat-panel">
            <div className="message-list" ref={listRef}>
              {messages.map((message) => (
                <div key={message.id} className={`message-row ${message.role}`}>
                  <div className="message-bubble">
                    <p>{message.text}</p>
                  </div>
                </div>
              ))}
            </div>
            {error && <div className="error-banner">{error}</div>}
          </section>

          <footer className="chat-input">
            <div className="input-shell">
              <textarea
                ref={inputRef}
                placeholder="Type a message…"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <button
                type="button"
                className="send-button"
                onClick={sendMessage}
                disabled={!canSend}
              >
                Send
              </button>
            </div>
            <p className="helper">Press Enter to send, Shift+Enter for a new line.</p>
          </footer>
        </div>
      </main>
    </div>
  );
};

export default App;
