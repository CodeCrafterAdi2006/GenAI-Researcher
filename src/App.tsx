import { useState, useEffect } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, User } from 'firebase/auth';
import { Sidebar } from './components/Sidebar';
import { ProjectBoard } from './components/ProjectBoard';
import { LogIn, Search, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    
    // Check if we are in an iframe or a restricted environment
    const isInIframe = window.self !== window.top;
    
    try {
      if (isInIframe) {
        // Popups usually fail in iframes, so we try redirect
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/unauthorized-domain') {
        setError(`Unauthorized Domain: Please add ${window.location.hostname} to authorized domains in Firebase Console (Authentication > Settings > Authorized domains).`);
      } else if (err.code === 'auth/popup-blocked') {
        setError('Login popup was blocked. Please enable popups or try again.');
        // Try redirect as fallback for blocked popup
        signInWithRedirect(auth, provider).catch(rerr => {
          setError(`Redirect failed: ${rerr.message}`);
        });
      } else {
        setError(err.message || 'Authentication failed. Please try again.');
      }
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#030303] text-white font-sans">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#030303] text-[#F4F4F5] font-sans p-6 relative overflow-hidden">
        {/* Background Accents */}
        <div className="absolute top-[-100px] right-[-100px] w-[400px] h-[400px] bg-indigo-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-50px] left-[-50px] w-[300px] h-[300px] bg-purple-600/10 blur-[100px] rounded-full"></div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-8 max-w-lg z-10"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/20 mb-4">
            <Search className="w-10 h-10 text-white" />
          </div>
          <div className="space-y-4">
            <h1 className="text-6xl font-bold text-white tracking-tighter leading-tight">
              GenAI <span className="text-gradient">Researcher</span>
            </h1>
            <p className="text-zinc-400 text-lg max-w-md mx-auto leading-relaxed">
              Scale your research with intelligent automation, real-time document analysis, and autonomous agents.
            </p>
          </div>
          <button
            onClick={login}
            id="login-button"
            className="w-full max-w-xs mx-auto flex items-center justify-center gap-2 bg-white text-black py-4 px-8 rounded-full hover:bg-zinc-200 transition-all font-bold text-sm shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-95"
          >
            <LogIn className="w-4 h-4" />
            Get Started
          </button>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex bg-[#030303] font-sans text-[#F4F4F5] overflow-hidden relative">
      {/* Background Accents */}
      <div className="absolute top-[-100px] right-[-100px] w-[400px] h-[400px] bg-indigo-600/5 blur-[120px] rounded-full pointer-events-none"></div>
      
      <Sidebar
        userId={user.uid}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
      />
      <main className="flex-1 overflow-hidden relative border-l border-white/5 z-10">
        <AnimatePresence mode="wait">
          {selectedProjectId ? (
            <ProjectBoard key={selectedProjectId} projectId={selectedProjectId} />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="max-w-md space-y-6">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto border border-white/10 text-indigo-400">
                  <Search className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold text-white tracking-tight">Select Workstation</h2>
                  <p className="text-sm text-zinc-500 font-mono uppercase tracking-widest">
                    Awaiting Project Synchronization
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
