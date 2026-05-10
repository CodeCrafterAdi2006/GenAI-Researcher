import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { ChatInterface } from './ChatInterface';
import { SourceManager } from './SourceManager';
import { motion } from 'motion/react';
import { Layers, MessageSquare, Info } from 'lucide-react';
import { cn } from '../lib/utils';

interface ProjectBoardProps {
  projectId: string;
}

export function ProjectBoard({ projectId }: ProjectBoardProps) {
  const [project, setProject] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'sources'>('chat');

  useEffect(() => {
    return onSnapshot(doc(db, 'projects', projectId), (doc) => {
      setProject({ id: doc.id, ...doc.data() });
    });
  }, [projectId]);

  if (!project) return null;

  return (
    <div className="h-full flex flex-col bg-[#030303]">
      <header className="p-8 border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight leading-none uppercase">{project.name}</h2>
          <div className="flex items-center gap-4 mt-2">
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
              Agent: Active
            </p>
            <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse"></div>
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.2em]">
              ID: {projectId.substring(0, 12)}
            </p>
          </div>
        </div>

        <div className="flex gap-2 p-1 bg-white/5 rounded-2xl border border-white/5">
          <TabButton
            active={activeTab === 'chat'}
            onClick={() => setActiveTab('chat')}
            icon={<MessageSquare className="w-3.5 h-3.5" />}
            label="Inquiry"
          />
          <TabButton
            active={activeTab === 'sources'}
            onClick={() => setActiveTab('sources')}
            icon={<Layers className="w-3.5 h-3.5" />}
            label="Knowledge"
          />
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' ? (
          <ChatInterface projectId={projectId} />
        ) : (
          <SourceManager projectId={projectId} />
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-6 py-2 text-[11px] uppercase font-bold tracking-widest transition-all rounded-xl",
        active
          ? "bg-white text-black shadow-lg shadow-white/10"
          : "text-zinc-500 hover:text-white hover:bg-white/5"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
