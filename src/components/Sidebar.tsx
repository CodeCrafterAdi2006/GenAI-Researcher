import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, orderBy, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { Plus, FolderOpen, Hash, LogOut, ChevronRight, Trash2 } from 'lucide-react';
import { auth } from '../lib/firebase';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

interface SidebarProps {
  userId: string;
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
}

export function Sidebar({ userId, selectedProjectId, onSelectProject }: SidebarProps) {
  const [projects, setProjects] = useState<any[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'projects'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, [userId]);

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    const path = 'projects';
    try {
      const docRef = await addDoc(collection(db, path), {
        name: newProjectName,
        userId,
        createdAt: serverTimestamp()
      });
      setNewProjectName('');
      setIsCreating(false);
      onSelectProject(docRef.id);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

  const deleteProject = async (id: string) => {
    const path = `projects/${id}`;
    try {
      await deleteDoc(doc(db, path));
      if (selectedProjectId === id) {
        onSelectProject('');
      }
      setDeletingProjectId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  return (
    <aside className="w-64 flex flex-col bg-zinc-950/50 backdrop-blur-xl h-full overflow-hidden shrink-0 border-r border-white/5 relative z-20">
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
            <Hash className="w-3 h-3 text-white" />
          </div>
          <span className="font-bold text-white tracking-tight uppercase text-xs">Researcher</span>
        </div>
        <button
          onClick={() => auth.signOut()}
          className="p-1.5 hover:bg-white/10 text-zinc-500 hover:text-white transition-colors rounded-lg"
          title="Sign Out"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <div className="flex items-center justify-between px-2 mb-4">
            <span className="text-[10px] font-mono uppercase text-zinc-500 tracking-widest font-bold">Workspace</span>
            <button
              onClick={() => setIsCreating(true)}
              className="p-1 hover:bg-white/10 hover:text-white text-zinc-500 transition-colors rounded"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            {isCreating && (
              <form onSubmit={createProject} className="px-2 mb-2">
                <input
                  autoFocus
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  placeholder="PROJECT_NAME..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg text-xs font-mono py-2 px-3 focus:outline-none focus:border-indigo-500/50 uppercase text-white"
                  onBlur={() => !newProjectName && setIsCreating(false)}
                />
              </form>
            )}
            {projects.map(p => (
              <div
                key={p.id}
                className={cn(
                  "group relative flex items-center rounded-xl transition-all",
                  selectedProjectId === p.id
                    ? "bg-white/10 text-white shadow-sm shadow-black/50"
                    : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                )}
              >
                <button
                  onClick={() => onSelectProject(p.id)}
                  className="flex-1 flex items-center gap-3 px-3 py-2.5 text-xs font-medium text-left"
                >
                  <ChevronRight className={cn(
                    "w-3.5 h-3.5 transition-transform",
                    selectedProjectId === p.id ? "rotate-90 text-indigo-400" : "opacity-0 group-hover:opacity-100"
                  )} />
                  <span className="truncate uppercase tracking-tight">{p.name}</span>
                </button>
                {deletingProjectId === p.id ? (
                  <div className="absolute right-0 inset-y-0 flex items-center bg-zinc-900 rounded-xl px-2 gap-1 z-30">
                    <button
                      onClick={() => deleteProject(p.id)}
                      className="p-1 px-2 bg-red-500 text-white text-[10px] font-bold rounded uppercase truncate"
                    >
                      Delete
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeletingProjectId(null); }}
                      className="p-1 px-2 text-zinc-500 text-[10px] font-bold uppercase"
                    >
                      Esc
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeletingProjectId(p.id); }}
                    className="absolute right-2 p-1.5 hover:bg-red-500/10 text-zinc-600 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-all"
                    title="Terminate Workspace"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 bg-zinc-900/50 border-t border-white/5">
        <div className="flex items-center gap-3 p-2 rounded-2xl bg-white/5 border border-white/5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-900 border border-white/10 text-white flex items-center justify-center font-bold text-[10px] uppercase">
            {auth.currentUser?.email?.substring(0, 1) || 'U'}
          </div>
          <div className="flex-1 truncate">
            <p className="text-[11px] font-bold text-white truncate">{auth.currentUser?.email?.split('@')[0]}</p>
            <p className="text-[9px] font-mono text-zinc-500 truncate uppercase mt-0.5 tracking-tight">Access Verified</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
