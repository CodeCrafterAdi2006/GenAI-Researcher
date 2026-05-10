import { useState, useRef, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { Send, Bot, User, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { cn } from '../lib/utils';

const getAI = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }
  return new GoogleGenAI({ apiKey: key });
};

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: any;
}

export function ChatInterface({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'projects', projectId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
    });
  }, [projectId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage = input.trim();
    setInput('');
    setIsTyping(true);

    const messagesPath = `projects/${projectId}/messages`;
    const sourcesPath = `projects/${projectId}/sources`;
    
    try {
      // 1. Save user message to Firebase
      await addDoc(collection(db, messagesPath), {
        role: 'user',
        content: userMessage,
        createdAt: serverTimestamp()
      });

      // 2. Fetch all sources for context
      const sourcesSnap = await getDocs(collection(db, sourcesPath));
      const sources = sourcesSnap.docs.map(doc => doc.data());
      
      let contextString = "";
      if (sources.length > 0) {
        contextString = "CONTEXT KNOWLEDGE REPOSITORY:\n" + sources.map(s => `=== SOURCE ID: ${s.title} ===\n${s.content}\n=== END SOURCE ===`).join("\n\n") + "\n\n";
      }

      // 3. Call Gemini
      const systemInstruction = `You are a high-level GenAI Research Assistant. 
      Use the provided KNOWLEDGE context to answer questions precisely. 
      
      MANDATORY CITATION RULE:
      When you derive information from a source, you MUST cite it using the exact syntax: \`[[Source Title]]\`. 
      Example: "The project timeline is estimated at 6 months \`[[Project Roadmap 2024]]\`."
      If information comes from multiple sources, cite them like this: \`[[Source A]]\` \`[[Source B]]\`.
      
      Always prioritize accuracy. If the context doesn't contain the answer, state that and suggest further research.
      Format your response in a technical, clear manner using Markdown.`;

      const aiInstance = getAI();
      const response = await aiInstance.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: `${contextString}USER QUESTION: ${userMessage}` }] }],
        config: {
          systemInstruction
        }
      });

      const aiResponse = response.text || "I encountered an error processing your inquiry.";

      // 4. Save AI response to Firebase
      await addDoc(collection(db, messagesPath), {
        role: 'model',
        content: aiResponse,
        createdAt: serverTimestamp()
      });

    } catch (error) {
      if (error instanceof Error && error.message.includes('GEMINI_API_KEY')) {
        console.error(error);
      } else {
        try {
          handleFirestoreError(error, OperationType.WRITE, messagesPath);
        } catch (fErr) {
          // Already handled
        }
      }
      
      await addDoc(collection(db, messagesPath), {
        role: 'model',
        content: "CRITICAL SYSTEM ERROR: Communication with intelligence node failed. Please ensure environment variables are configured.",
        createdAt: serverTimestamp()
      }).catch(e => console.error("Failed to post error message", e));
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="h-full flex flex-col font-sans overflow-hidden bg-[#030303]">
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-10 pointer-events-none">
            <Sparkles className="w-16 h-16 mb-4 text-indigo-400" />
            <p className="text-xs font-mono uppercase tracking-[0.3em] font-bold text-center text-white">
              Sytem Idle<br/>
              Awaiting Inquiry
            </p>
          </div>
        )}
        {messages.map((m) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={m.id}
            className={cn(
              "flex gap-6 p-6 rounded-3xl transition-all",
              m.role === 'model' ? "bg-white/5 border border-white/5" : ""
            )}
          >
            <div className={cn(
              "w-10 h-10 shrink-0 flex items-center justify-center rounded-2xl border transition-all",
              m.role === 'model' ? "bg-gradient-to-tr from-indigo-500 to-purple-500 border-white/20 text-white" : "border-white/10 text-zinc-500"
            )}>
              {m.role === 'model' ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-2 font-bold">
                {m.role === 'model' ? "Intelligence Node" : "Authorized User"} • {m.createdAt?.toDate?.()?.toLocaleTimeString() || "..."}
              </p>
              <div className="markdown-body prose prose-sm max-w-none prose-invert font-sans">
                <Markdown
                  components={{
                    code: ({ children, className, inline }: any) => {
                      const content = String(children);
                      if (inline && content.startsWith('[[') && content.endsWith(']]')) {
                        return <span className="citation">{content.slice(2, -2)}</span>;
                      }
                      return <code className={className}>{children}</code>;
                    }
                  }}
                >
                  {m.content}
                </Markdown>
              </div>
            </div>
          </motion.div>
        ))}
        {isTyping && (
          <div className="flex gap-6 p-6 animate-pulse">
            <div className="w-10 h-10 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            </div>
            <div className="flex-1 space-y-3">
              <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest font-bold">Synthesizing...</p>
              <div className="h-3 bg-white/5 rounded-full w-3/4" />
              <div className="h-3 bg-white/5 rounded-full w-1/2" />
            </div>
          </div>
        )}
      </div>

      <div className="p-8 border-t border-white/5 bg-[#030303]">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSend} className="relative group">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Query the system..."
              className="w-full bg-zinc-900/50 border border-white/10 px-6 py-5 pr-14 rounded-2xl text-sm font-medium focus:outline-none focus:border-indigo-500/50 transition-all text-white placeholder:text-zinc-600 shadow-2xl"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-indigo-500 text-white rounded-xl disabled:opacity-20 hover:bg-indigo-600 transition-all shadow-lg active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <p className="text-[9px] font-mono text-zinc-600 mt-4 uppercase tracking-[0.2em] text-center">
            AI Sub-modules: Gemini Pro Vision • Context Engine v2.4
          </p>
        </div>
      </div>
    </div>
  );
}
