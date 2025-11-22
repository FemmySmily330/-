import React, { useState, useRef, useEffect } from 'react';
import { Chat, GenerateContentResponse } from "@google/genai";
import { ChatMessage } from '../types';

interface ChatPanelProps {
  chat: Chat | null;
  isOpen: boolean;
  onClose: () => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ chat, isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'intro',
      role: 'model',
      text: '你好，我是 NeuroScreen Ruby 专家助手。我已经阅读了上述文献。我们可以一起探讨这些研究的可信度、临床转化潜力，或者如果您需要，我可以帮您寻找 PDF 下载链接。'
    }
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !chat) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsSending(true);

    try {
      const result = await chat.sendMessageStream({ message: input });
      
      let fullResponse = "";
      const modelMsgId = (Date.now() + 1).toString();
      
      // Add placeholder for streaming response
      setMessages(prev => [...prev, {
        id: modelMsgId,
        role: 'model',
        text: '',
        isStreaming: true
      }]);

      for await (const chunk of result) {
        const c = chunk as GenerateContentResponse;
        const text = c.text || "";
        fullResponse += text;
        
        setMessages(prev => prev.map(msg => 
          msg.id === modelMsgId 
            ? { ...msg, text: fullResponse } 
            : msg
        ));
      }

      // Mark as done
       setMessages(prev => prev.map(msg => 
          msg.id === modelMsgId 
            ? { ...msg, isStreaming: false } 
            : msg
        ));

    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: "抱歉，我遇到了一些连接问题，请稍后再试。"
      }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[450px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 flex flex-col border-l border-slate-200">
      {/* Header */}
      <div className="h-16 bg-slate-900 flex items-center justify-between px-6 shadow-md flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-3 h-3 bg-green-500 rounded-full absolute bottom-0 right-0 border-2 border-slate-900"></div>
            <div className="w-10 h-10 bg-teal-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
              NR
            </div>
          </div>
          <div>
            <h3 className="text-white font-bold text-sm">NeuroScreen Ruby Expert</h3>
            <p className="text-slate-400 text-xs">Online • 资深 PI 模式</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors p-2 rounded-full hover:bg-slate-800"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-grow overflow-y-auto p-6 space-y-6 bg-slate-50">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-teal-600 text-white rounded-br-none' 
                  : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
              }`}
            >
              {msg.role === 'model' ? (
                 <div 
                 className="prose prose-sm prose-teal max-w-none"
                 // Very basic markdown rendering for links and bold text
                 dangerouslySetInnerHTML={{ 
                   __html: msg.text
                     .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
                     .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" class="text-teal-600 underline font-medium hover:text-teal-800">$1</a>')
                     .replace(/\n/g, '<br/>')
                 }} 
               />
              ) : (
                msg.text
              )}
            </div>
          </div>
        ))}
        {isSending && !messages.find(m => m.isStreaming) && (
           <div className="flex justify-start">
             <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-bl-none flex gap-1 items-center">
               <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></span>
               <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-75"></span>
               <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-150"></span>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-slate-200 flex-shrink-0">
        <div className="relative flex items-center">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="探讨这篇论文的可信度，或者让我帮您下载 PDF..."
            className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-teal-500 focus:border-teal-500 block p-4 pr-12 resize-none shadow-inner focus:shadow-md transition-shadow h-14 max-h-32 overflow-y-auto"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="absolute right-2 p-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:hover:bg-teal-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-slate-400 text-center mt-2">
          AI may produce inaccurate information. Verify important data.
        </p>
      </div>
    </div>
  );
};

export default ChatPanel;