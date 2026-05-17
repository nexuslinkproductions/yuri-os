import React, { useEffect, useRef, useState } from 'react';
import { NotebookMessage, RagCitation, streamChat } from '../../../lib/notebookBridge';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    streaming?: boolean;
    citations?: RagCitation[];
}

export function ChatPane({
    notebookId,
    initialMessages,
    model
}: {
    notebookId: number;
    initialMessages: NotebookMessage[];
    model: string;
}) {
    const [messages, setMessages] = useState<Message[]>(() =>
        initialMessages.map(m => ({ id: String(m.id), role: m.role, content: m.content }))
    );
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const esRef = useRef<EventSource | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        setMessages(initialMessages.map(m => ({ id: String(m.id), role: m.role, content: m.content })));
    }, [notebookId]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    function submit() {
        const query = input.trim();
        if (!query || busy) return;

        setInput('');
        setBusy(true);

        const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: query };
        const assistantId = `a-${Date.now()}`;
        const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', streaming: true, citations: [] };
        setMessages(prev => [...prev, userMsg, assistantMsg]);

        esRef.current?.close();
        esRef.current = streamChat(notebookId, query, model, {
            onToken: (token) => {
                setMessages(prev => prev.map(m =>
                    m.id === assistantId ? { ...m, content: m.content + token } : m
                ));
            },
            onCitation: (citation) => {
                setMessages(prev => prev.map(m =>
                    m.id === assistantId
                        ? { ...m, citations: [...(m.citations || []), citation] }
                        : m
                ));
            },
            onDone: (_content) => {
                setMessages(prev => prev.map(m =>
                    m.id === assistantId ? { ...m, streaming: false } : m
                ));
                setBusy(false);
            },
            onError: (msg) => {
                setMessages(prev => prev.map(m =>
                    m.id === assistantId ? { ...m, content: `⚠ ${msg}`, streaming: false } : m
                ));
                setBusy(false);
            }
        });
    }

    function handleKey(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    }

    return (
        <div className="nb-chat-pane">
            <div className="nb-chat-messages">
                {messages.length === 0 && (
                    <div className="nb-chat-empty">
                        Ask anything about your sources. Add sources in the left panel first.
                    </div>
                )}
                {messages.map(msg => (
                    <div key={msg.id} className={`oracle-msg oracle-msg--${msg.role === 'user' ? 'user' : 'nexus'}`}>
                        <div className="msg-body">{msg.content}
                            {msg.streaming && <span className="nb-cursor">▌</span>}
                        </div>
                        {msg.citations && msg.citations.length > 0 && (
                            <div className="nb-citations">
                                {msg.citations.map((c, i) => (
                                    <span key={i} className="nb-citation-pill" title={c.excerpt}>
                                        {c.source_title.slice(0, 24)}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            <div className="oracle-input-bar">
                <textarea
                    ref={textareaRef}
                    className="oracle-textarea"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Ask about your sources…"
                    rows={1}
                    disabled={busy}
                />
                <button
                    className="nb-send-btn"
                    onClick={submit}
                    disabled={busy || !input.trim()}
                >
                    {busy ? '⟳' : '↵'}
                </button>
            </div>
        </div>
    );
}
