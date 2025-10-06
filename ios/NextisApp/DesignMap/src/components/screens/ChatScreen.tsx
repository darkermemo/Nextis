import { useState, useRef, useEffect } from 'react';
import { Send, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { NextActionRow } from '../NextActionRow';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ChatScreenProps {
  onQuickAdd: () => void;
}

export function ChatScreen({ onQuickAdd }: ChatScreenProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Good morning! I've organized your day based on your schedule. You have 3 priority tasks and 2 meetings today.",
      timestamp: '9:00 AM',
    },
    {
      id: '2',
      role: 'user',
      content: 'What should I focus on first?',
      timestamp: '9:02 AM',
    },
    {
      id: '3',
      role: 'assistant',
      content: "I recommend starting with your deep work session on the project proposal. You're most productive in the morning, and this task requires 2 hours of focused time.",
      timestamp: '9:02 AM',
    },
  ]);
  const [input, setInput] = useState('');
  const [isNextActionsExpanded, setIsNextActionsExpanded] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    };

    setMessages([...messages, newMessage]);
    setInput('');

    // Simulate assistant response
    setTimeout(() => {
      const response: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I understand. Let me help you with that.',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, response]);
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Next Actions Section */}
      <div className="border-b border-border bg-accent/30">
        <button
          onClick={() => setIsNextActionsExpanded(!isNextActionsExpanded)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
        >
          <h3 className="text-[13px]">Next Actions</h3>
          {isNextActionsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        
        {isNextActionsExpanded && (
          <div className="border-t border-border">
            <NextActionRow
              index={1}
              title="Review project proposal draft"
              priority="high"
              deadline="10:00 AM"
              onAction={() => console.log('Start action 1')}
            />
            <NextActionRow
              index={2}
              title="Prepare for team meeting"
              priority="medium"
              deadline="2:00 PM"
              onAction={() => console.log('Start action 2')}
            />
            <NextActionRow
              index={3}
              title="Review pull requests"
              priority="low"
              onAction={() => console.log('Start action 3')}
            />
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <Avatar className="w-7 h-7 shrink-0">
              <AvatarFallback className="text-[10px]">
                {message.role === 'user' ? 'JD' : 'AI'}
              </AvatarFallback>
            </Avatar>
            
            <div className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div
                className={`
                  max-w-[75%] p-3 rounded-2xl text-[13px]
                  ${message.role === 'user' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-accent'
                  }
                `}
              >
                {message.content}
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 px-1">
                {message.timestamp}
              </span>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="border-t border-border bg-background p-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={onQuickAdd}
            className="shrink-0"
          >
            <Plus size={18} />
          </Button>
          
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask anything..."
            className="flex-1"
          />
          
          <Button
            onClick={handleSend}
            disabled={!input.trim()}
            size="icon"
            className="shrink-0"
          >
            <Send size={18} />
          </Button>
        </div>
        
        <div className="flex items-center gap-3 mt-2 text-[9px] text-muted-foreground">
          <span>🕐 PST</span>
          <span>☀️ Early work mode</span>
        </div>
      </div>
    </div>
  );
}
