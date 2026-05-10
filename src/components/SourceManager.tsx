import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { Globe, FileText, Plus, Trash2, Loader2, Link as LinkIcon, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';

export function SourceManager({ projectId }: { projectId: string }) {
  const [sources, setSources] = useState<any[]>([]);
  const [url, setUrl] = useState('');
  const [isUrlAdding, setIsUrlAdding] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'projects', projectId, 'sources'),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      setSources(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, [projectId]);

  const addUrlSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || loading) return;

    const path = `projects/${projectId}/sources`;
    setLoading(true);
    try {
      const response = await axios.post('/api/scrape', { url: url.trim() });
      const { title, content } = response.data;

      await addDoc(collection(db, path), {
        type: 'url',
        title,
        content,
        metadata: { url: url.trim() },
        createdAt: serverTimestamp()
      });

      setUrl('');
      setIsUrlAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setLoading(false);
    }
  };

  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);

  const deleteSource = async (id: string) => {
    const path = `projects/${projectId}/sources/${id}`;
    try {
      await deleteDoc(doc(db, path));
      setDeletingSourceId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || loading) return;

    if (!file.name.toLowerCase().endsWith('.pdf') && !file.name.toLowerCase().endsWith('.txt')) {
      alert("Intelligence Core Alert: Only PDF and TXT files are accepted for document analysis.");
      return;
    }

    const path = `projects/${projectId}/sources`;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const endpoint = file.name.toLowerCase().endsWith('.pdf') ? '/api/analyze-pdf' : '/api/analyze-text';
      
      if (file.name.toLowerCase().endsWith('.txt')) {
        const text = await file.text();
        await addDoc(collection(db, path), {
          type: 'text',
          title: file.name,
          content: text.replace(/\s+/g, ' ').trim(),
          createdAt: serverTimestamp()
        });
      } else {
        const response = await axios.post('/api/analyze-pdf', formData);
        const { title, content } = response.data;
        await addDoc(collection(db, path), {
          type: 'file',
          title,
          content,
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  return (
    <div className="h-full flex flex-col p-8 bg-[#030303] space-y-8">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-zinc-500">Knowledge Core</h3>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 px-5 py-2 bg-white text-black text-[11px] uppercase font-bold tracking-widest rounded-xl hover:bg-zinc-200 transition-all cursor-pointer shadow-lg active:scale-95">
            <Plus className="w-3.5 h-3.5" />
            Ingest File
            <input type="file" className="hidden" accept=".pdf,.txt" onChange={handleFileUpload} />
          </label>
          <button
            onClick={() => setIsUrlAdding(!isUrlAdding)}
            className="flex items-center gap-2 px-5 py-2 glass-panel text-white text-[11px] uppercase font-bold tracking-widest rounded-xl hover:bg-white/10 transition-all active:scale-95"
          >
            <LinkIcon className="w-3.5 h-3.5 text-indigo-400" />
            Remote URL
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isUrlAdding && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={addUrlSource}
            className="overflow-hidden space-y-3"
          >
            <div className="relative group">
              <input
                autoFocus
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="HTTPS://SOURCE_URL..."
                className="w-full bg-white/5 border border-white/10 px-5 py-4 rounded-2xl text-xs font-mono focus:outline-none focus:border-indigo-500/50 uppercase text-white transition-all shadow-2xl"
              />
              <button
                type="submit"
                disabled={!url.trim() || loading}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-indigo-500 text-white rounded-xl"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LinkIcon className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest ml-1">Input URL for neural content extraction</p>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {sources.length === 0 && !isUrlAdding && (
          <div className="h-full flex flex-col items-center justify-center opacity-10 border border-white/5 bg-white/5 rounded-3xl">
            <Globe className="w-12 h-12 mb-4 text-indigo-400" />
            <p className="text-[10px] font-mono uppercase font-bold tracking-widest">Base Layer Empty</p>
          </div>
        )}
        {sources.map(s => (
          <motion.div
            layout
            key={s.id}
            className="p-5 bento-card flex items-start justify-between group"
          >
            <div className="flex gap-4 min-w-0">
              <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-indigo-400">
                {s.type === 'url' ? <Globe className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-white uppercase truncate tracking-tight">{s.title}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                    {s.type} • {new Date(s.createdAt?.toDate()).toLocaleDateString()}
                  </p>
                  {s.metadata?.url && (
                    <a href={s.metadata.url} target="_blank" className="text-[9px] font-mono text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-widest font-bold">
                      [View Origin]
                    </a>
                  )}
                </div>
              </div>
            </div>
            {deletingSourceId === s.id ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => deleteSource(s.id)}
                  className="px-3 py-1.5 bg-red-500 text-white text-[10px] uppercase font-bold rounded-lg"
                >
                  Confirm Delete
                </button>
                <button
                  onClick={() => setDeletingSourceId(null)}
                  className="px-3 py-1.5 glass-panel text-zinc-400 text-[10px] uppercase font-bold rounded-lg"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeletingSourceId(s.id)}
                className="p-2 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                title="Delete Knowledge"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
