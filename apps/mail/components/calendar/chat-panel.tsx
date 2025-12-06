import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, XCircle, Download, X, AlertTriangle } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useTRPC } from '@/providers/query-provider';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

interface CalendarChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToolExecution?: () => void;
}

export function CalendarChatPanel({ open, onOpenChange, onToolExecution }: CalendarChatPanelProps) {
  const trpc = useTRPC();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-' + Date.now(),
      role: 'assistant',
      content:
        "Hi! I'm your calendar assistant. I can help you:\n\n- Create, update, or delete events\n- Check your schedule\n- Find free time slots\n- Set up recurring events\n- Add reminders\n\nWhat would you like to do?",
    },
  ]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conversationId] = useState(() => 'conv-' + Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Chat mutation
  const chatMutation = useMutation(
    trpc.calendar.chat.mutationOptions({
      onSuccess: (data) => {
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.role === 'assistant' && lastMessage.content === 'Thinking...') {
            lastMessage.content = data.response;
          }
          return newMessages;
        });

        // Trigger tool execution callback if tools were used
        if (data.usedTools) {
          onToolExecution?.();
        }
      },
      onError: (_error) => {
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.role === 'assistant' && lastMessage.content === 'Thinking...') {
            lastMessage.content = 'Sorry, I encountered an error. Please try again.';
          }
          return newMessages;
        });
        setError('Failed to get a response. Please try again.');
      },
    }),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chatMutation.isPending) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    // Add user message
    const userMessageObj: Message = {
      id: 'user-' + Date.now(),
      role: 'user',
      content: userMessage,
    };
    setMessages((prev) => [...prev, userMessageObj]);

    // Add placeholder for assistant response
    const assistantMessageObj: Message = {
      id: 'assistant-' + Date.now(),
      role: 'assistant',
      content: 'Thinking...',
    };
    setMessages((prev) => [...prev, assistantMessageObj]);

    // Get conversation history
    const history = messages.map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n\n');

    // Send chat request
    chatMutation.mutate({
      message: userMessage,
      conversationId,
      history,
    });
  };

  const clearConversation = () => {
    setMessages([
      {
        id: 'welcome-' + Date.now(),
        role: 'assistant',
        content:
          "Hi! I'm your calendar assistant. I can help you:\n\n- Create, update, or delete events\n- Check your schedule\n- Find free time slots\n- Set up recurring events\n- Add reminders\n\nWhat would you like to do?",
      },
    ]);
    setError(null);
  };

  const downloadConversation = () => {
    const conversationText = messages
      .map((msg) => `${msg.role === 'user' ? 'You' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    const blob = new Blob([conversationText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calendar-conversation-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <div
        className="fixed inset-y-0 right-0 w-full max-w-md border-l bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h2 className="text-lg font-semibold">Calendar Assistant</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={downloadConversation}
                title="Download conversation"
                className="h-8 w-8 rounded-full"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={clearConversation}
                title="Clear conversation"
                className="h-8 w-8 rounded-full"
              >
                <XCircle className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                title="Close"
                className="h-8 w-8 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex gap-2 border-t p-4">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your calendar..."
              disabled={chatMutation.isPending}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={chatMutation.isPending}>
              {chatMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
