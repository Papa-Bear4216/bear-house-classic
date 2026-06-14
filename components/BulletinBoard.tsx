'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, ShoppingCart, Bell, Plus, Trash2, X } from 'lucide-react';
import { useBoard, BoardPost } from '@/hooks/use-board';
import { useFamilyMembers } from '@/hooks/use-family';
import { format } from 'date-fns';

export function BulletinBoard() {
  const { posts, isLoaded, addPost, deletePost } = useBoard();
  const { users } = useFamilyMembers();
  
  const [isOpen, setIsOpen] = useState(false);
  const [newType, setNewType] = useState<'note' | 'shopping' | 'alert'>('note');
  const [newContent, setNewContent] = useState('');
  
  if (!isLoaded) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    
    // Default to first admin user if current user is not available
    const myUser = users.find(u => u.role === 'admin' || u.role === 'superadmin') || users[0];
    
    addPost({
      authorId: myUser.id,
      content: newContent.trim(),
      type: newType,
    });
    setNewContent('');
    setIsOpen(false);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'shopping': return <ShoppingCart className="w-4 h-4 text-emerald-500" />;
      case 'alert': return <Bell className="w-4 h-4 text-rose-500" />;
      default: return <MessageSquare className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <div className="bg-[#ccff00] rounded-3xl shadow-[8px_8px_0_#1e293b] border-4 border-slate-900 p-6 flex flex-col h-[400px]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-display font-black text-slate-900 flex items-center gap-2 tracking-tight">
          Bulletin Board
        </h2>
        <button 
          onClick={() => setIsOpen(true)}
          className="p-2 bg-white hover:bg-slate-100 rounded-xl border-2 border-slate-900 shadow-[2px_2px_0_#1e293b] text-slate-900 transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:scale-95"
        >
          <Plus className="w-5 h-5 stroke-[3]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-700/60 font-bold">
            <MessageSquare className="w-10 h-10 mb-2 opacity-50 stroke-[2]" />
            <p className="text-sm">Nothing posted yet.</p>
          </div>
        ) : (
          posts.map(post => {
            const author = users.find(u => u.id === post.authorId);
            return (
              <motion.div 
                key={post.id}
                initial={{ opacity: 0, y: 10, rotate: -2 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                className="p-4 bg-white border-4 border-slate-900 shadow-[4px_4px_0_#1e293b] rounded-2xl relative group hover:-translate-y-1 transition-transform"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="bg-slate-100 p-1.5 rounded-xl border-2 border-slate-900">
                    {getTypeIcon(post.type)}
                  </div>
                  <span className="text-sm font-black tracking-tight text-slate-900">
                    {author?.name || 'Unknown'}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-slate-500 ml-auto bg-slate-100 px-2 py-1 rounded-md border-2 border-slate-200">
                    {post.createdAt ? format(post.createdAt.toDate(), 'MMM d, h:mm a') : 'Just now'}
                  </span>
                </div>
                <p className="text-base font-medium text-slate-800 leading-snug whitespace-pre-wrap pl-1">{post.content}</p>
                <button 
                  onClick={() => deletePost(post.id)}
                  className="absolute -top-3 -right-3 opacity-0 group-hover:opacity-100 bg-rose-500 hover:bg-rose-400 border-2 border-slate-900 shadow-[2px_2px_0_#1e293b] text-white p-1.5 rounded-full transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                >
                  <Trash2 className="w-4 h-4 stroke-[2.5]" />
                </button>
              </motion.div>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, rotate: 3 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.95, opacity: 0, rotate: -3 }}
              className="bg-[#facc15] p-6 border-4 border-slate-900 shadow-[12px_12px_0_#1e293b] rounded-3xl w-full max-w-sm relative"
            >
              <button 
                onClick={() => setIsOpen(false)}
                className="absolute -top-4 -right-4 p-2 text-slate-900 bg-white border-2 border-slate-900 shadow-[2px_2px_0_#1e293b] hover:bg-slate-100 rounded-full hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
              >
                <X className="w-5 h-5 stroke-[3]" />
              </button>
              <h3 className="text-2xl font-black text-slate-900 mb-4 uppercase tracking-tight">New Post</h3>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex gap-2 p-1.5 bg-slate-900 rounded-2xl">
                  {['note', 'shopping', 'alert'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewType(t as any)}
                      className={`flex-1 py-2 text-xs font-black rounded-xl capitalize transition-colors border-2 border-transparent ${newType === t ? 'bg-[#ccff00] text-slate-900 border-slate-900 shadow-sm' : 'text-slate-300 hover:text-white'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <textarea 
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  placeholder="What's screaming to be said?"
                  className="w-full p-4 rounded-2xl border-4 border-slate-900 bg-white focus:bg-[#f0fdf4] focus:outline-none focus:translate-x-[2px] focus:translate-y-[2px] focus:shadow-none shadow-[4px_4px_0_#1e293b] text-slate-900 text-base font-medium h-32 resize-none transition-all"
                />
                <button 
                  type="submit"
                  disabled={!newContent.trim()}
                  className="w-full py-3 bg-[#be185d] border-4 border-slate-900 shadow-[4px_4px_0_#1e293b] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none text-white rounded-2xl font-black text-lg uppercase tracking-wider disabled:opacity-50 transition-all active:scale-95"
                >
                  Post to Board
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
