
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Transaction, ExpenseCategory } from './types.ts';
import { StatsCard } from './components/StatsCard.tsx';
import { TransactionList } from './components/TransactionList.tsx';
import { parseEmailContent } from './services/geminiService.ts';
import { GmailService, GmailMessage } from './services/gmailService.ts';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

const App: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [syncedIds, setSyncedIds] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  
  const [clientId, setClientId] = useState<string>(() => {
    const saved = localStorage.getItem('gmail_client_id');
    if (saved && saved !== 'undefined') return saved;
    const envVal = process.env.GMAIL_CLIENT_ID;
    return (envVal && envVal !== 'undefined') ? envVal : '';
  });
  
  const [gmailToken, setGmailToken] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);

  const gmailService = useMemo(() => new GmailService(clientId), [clientId]);

  const handleSaveClientId = (id: string) => {
    const val = id.trim();
    if (val) {
      localStorage.setItem('gmail_client_id', val);
      setClientId(val);
      window.location.reload();
    }
  };

  const handleReset = () => {
    if (confirm("Reset everything? This will clear your Client ID and all local history.")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  useEffect(() => {
    try {
      const savedTrans = localStorage.getItem('hdfc_transactions');
      const savedIds = localStorage.getItem('hdfc_synced_ids');
      if (savedTrans) setTransactions(JSON.parse(savedTrans));
      if (savedIds) setSyncedIds(JSON.parse(savedIds));
    } catch (e) {
      console.error("Storage load error", e);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('hdfc_transactions', JSON.stringify(transactions));
    localStorage.setItem('hdfc_synced_ids', JSON.stringify(syncedIds));
  }, [transactions, syncedIds]);

  useEffect(() => {
    if (!clientId) return;
    let attempts = 0;
    const interval = setInterval(() => {
      if (gmailService.isLoaded()) {
        gmailService.init(
          (token) => {
            setGmailToken(token);
            setAppError(null);
          },
          (err: any) => {
            console.error("Auth Error:", err);
            setAppError(err.details || err.error || "Connection failed. Check Google Console origins.");
          }
        );
        clearInterval(interval);
      }
      if (attempts++ > 60) {
        setAppError("Google Library failed to load. Are you offline or using an ad-blocker?");
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [gmailService, clientId]);

  const stats = useMemo(() => {
    const spentTransactions = transactions.filter(t => t.type === 'DEBIT');
    const totalSpent = spentTransactions.reduce((acc, curr) => acc + curr.amount, 0);
    
    const categoryMap: Record<string, number> = {};
    spentTransactions.forEach(t => {
      categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
    });
    
    let topCat = ExpenseCategory.OTHER;
    let maxVal = 0;
    Object.entries(categoryMap).forEach(([cat, val]) => {
      if (val > maxVal) {
        maxVal = val;
        topCat = cat as ExpenseCategory;
      }
    });

    return {
      totalSpent,
      topCategory: topCat,
      transactionCount: transactions.length,
      avgTransaction: spentTransactions.length ? totalSpent / spentTransactions.length : 0
    };
  }, [transactions]);

  const handleManualParse = async () => {
    if (!emailInput.trim()) return;
    setIsParsing(true);
    try {
      const newTransaction = await parseEmailContent(emailInput);
      if (newTransaction) {
        setTransactions(prev => [newTransaction, ...prev]);
        setEmailInput('');
        setShowModal(false);
      } else {
        alert("Extraction failed. Try copying the email text more carefully.");
      }
    } catch (e) {
      alert("AI Processing Error.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleGmailSync = useCallback(async () => {
    if (!gmailToken) {
      gmailService.requestToken();
      return;
    }

    setIsSyncing(true);
    setSyncProgress(0);
    try {
      const messages = await gmailService.fetchMessages();
      const newMessages = messages.filter(m => !syncedIds.includes(m.id));
      
      if (newMessages.length === 0) {
        alert("No new Alerts found.");
        setIsSyncing(false);
        return;
      }

      const results: Transaction[] = [];
      const successfulIds: string[] = [];

      for (let i = 0; i < newMessages.length; i++) {
        setSyncProgress(Math.round(((i + 1) / newMessages.length) * 100));
        const msg = newMessages[i];
        try {
          const parsed = await parseEmailContent(msg.body || msg.snippet);
          if (parsed) {
            results.push(parsed);
            successfulIds.push(msg.id);
          }
        } catch (e) {
          console.error("Parse fail", msg.id);
        }
      }

      if (results.length > 0) {
        setTransactions(prev => [...results, ...prev]);
        setSyncedIds(prev => [...successfulIds, ...prev]);
      }
    } catch (err: any) {
      setGmailToken(null);
      alert("Sync failed. Check your network or Re-link account.");
    } finally {
      setIsSyncing(false);
    }
  }, [gmailToken, gmailService, syncedIds]);

  const chartData = useMemo(() => {
    const days = 7;
    const data = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayTotal = transactions
        .filter(t => t.date === dateStr && t.type === 'DEBIT')
        .reduce((sum, t) => sum + t.amount, 0);
      data.push({
        name: date.toLocaleDateString('en-IN', { weekday: 'short' }),
        amount: dayTotal
      });
    }
    return data;
  }, [transactions]);

  const pieData = useMemo(() => {
    const categoryMap: Record<string, number> = {};
    transactions.filter(t => t.type === 'DEBIT').forEach(t => {
      categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
    });
    return Object.entries(categoryMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

  if (!clientId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-white rounded-[3.5rem] shadow-2xl p-12 border border-slate-200">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mb-8 mx-auto shadow-2xl shadow-blue-200">
             <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <h2 className="text-4xl font-black text-slate-900 text-center mb-4 tracking-tight">Deployment Ready?</h2>
          <p className="text-slate-500 text-center mb-10 text-lg leading-relaxed">Ensure your Google Cloud Console is updated with your new <b>Netlify URL</b> to prevent blocked access.</p>
          
          <div className="space-y-6 mb-12">
            <div className="p-7 bg-blue-50/50 rounded-[2rem] border border-blue-100 flex gap-6">
              <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center font-black text-blue-600 shrink-0 border border-slate-200">1</div>
              <div className="w-full">
                <p className="font-black text-slate-800 text-lg mb-1">Update Authorized Origin</p>
                <p className="text-slate-500 mb-4 text-sm">Add this exact URL to your "Web application" Client ID:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white px-4 py-3 rounded-xl border border-blue-200 text-blue-700 font-mono text-sm block truncate">{window.location.origin}</code>
                  <button onClick={() => { navigator.clipboard.writeText(window.location.origin); alert('Origin URL Copied!'); }} className="bg-blue-600 text-white px-4 py-3 rounded-xl font-bold text-xs hover:bg-blue-700 transition-all">COPY</button>
                </div>
              </div>
            </div>
            <div className="p-7 bg-slate-50 rounded-[2rem] border border-slate-100 flex gap-6">
              <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center font-black text-slate-400 shrink-0 border border-slate-200">2</div>
              <div>
                <p className="font-black text-slate-800 text-lg mb-1">Verify Client Type</p>
                <p className="text-slate-500 text-sm">Ensure your ID is for a <b>"Web application"</b> (not Android or Desktop) in the Credentials tab.</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <input 
              type="text" 
              placeholder="Paste your Client ID here..."
              className="w-full p-6 bg-slate-50 border border-slate-200 rounded-3xl focus:ring-4 focus:ring-blue-100 outline-none transition-all font-mono text-sm"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveClientId((e.target as HTMLInputElement).value) }}
            />
            <button 
              onClick={(e) => {
                const input = (e.currentTarget.previousSibling as HTMLInputElement);
                handleSaveClientId(input.value);
              }}
              className="w-full py-6 bg-slate-900 text-white font-black rounded-3xl hover:bg-slate-800 transition-all shadow-2xl active:scale-[0.98] text-lg"
            >
              Save & Launch App
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {appError && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white p-4 shadow-xl flex items-center justify-center gap-4">
          <span className="font-bold">⚠️ {appError}</span>
          <button onClick={() => window.location.reload()} className="bg-white/20 px-4 py-1 rounded-lg hover:bg-white/30 font-bold text-xs uppercase">Retry</button>
          <button onClick={handleReset} className="bg-white text-red-600 px-4 py-1 rounded-lg hover:bg-white/90 font-bold text-xs uppercase">Reset Config</button>
        </div>
      )}

      {isSyncing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xl">
          <div className="bg-white p-16 rounded-[4rem] shadow-2xl w-full max-w-sm text-center">
            <div className="relative w-32 h-32 mx-auto mb-8">
              <svg className="w-full h-full text-blue-50" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="12" />
                <circle cx="50" cy="50" r="45" fill="none" stroke="#3b82f6" strokeWidth="12" strokeDasharray={`${(syncProgress / 100) * 283} 283`} transform="rotate(-90 50 50)" className="transition-all duration-700 ease-out" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-black text-blue-600 text-3xl">{syncProgress}%</div>
            </div>
            <h3 className="text-3xl font-black text-slate-900 mb-3">Syncing...</h3>
            <p className="text-slate-400 font-bold text-sm">Processing HDFC alerts with AI</p>
          </div>
        </div>
      )}

      <nav className="bg-white/80 backdrop-blur-xl border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-24 items-center">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-100 rotate-6">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m.5-1c.11 0 .21-.017.306-.05M12 16c-1.11 0-2.08-.402-2.599-1M12 16V15m0 1v-8" /></svg>
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tighter leading-none">HDFC InstaDash</h1>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-1.5">Intelligent Finance</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={handleGmailSync}
                className={`flex items-center gap-2 px-8 py-4 rounded-2xl font-black transition-all active:scale-95 ${gmailToken ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-indigo-600 text-white shadow-2xl'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                {gmailToken ? 'Sync Now' : 'Link Gmail'}
              </button>
              <button onClick={() => setShowModal(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-2 shadow-xl hover:bg-slate-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                Paste
              </button>
              <button onClick={handleReset} className="w-14 h-14 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all" title="Reset Session">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
        <header className="mb-16">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-7xl font-black text-slate-900 tracking-tighter mb-4 leading-none">Net Worth</h2>
              <div className="flex items-center gap-4">
                 <div className={`px-4 py-1.5 rounded-full ${gmailToken ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                    <span className="text-xs font-black uppercase tracking-widest">{gmailToken ? 'Live Sync Active' : 'Offline Mode'}</span>
                 </div>
                 <span className="text-sm font-bold text-slate-400">Activity as of {new Date().toLocaleDateString('en-IN')}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Total Outflow</p>
              <p className="text-5xl font-black text-slate-900 tracking-tighter">₹{stats.totalSpent.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          <StatsCard title="Monthly Spend" value={`₹${stats.totalSpent.toLocaleString('en-IN')}`} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>} trend={{ value: 5, isUp: false }} />
          <StatsCard title="Primary Expense" value={stats.topCategory} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>} />
          <StatsCard title="Total Alerts" value={stats.transactionCount} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
          <StatsCard title="Avg Transaction" value={`₹${Math.round(stats.avgTransaction).toLocaleString('en-IN')}`} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-16">
          <div className="lg:col-span-2 bg-white p-12 rounded-[4rem] shadow-sm border border-slate-100 min-h-[500px]">
            <h3 className="text-2xl font-black text-slate-900 mb-12 tracking-tight">Spending Velocity</h3>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#cbd5e1', fontSize: 14, fontWeight: 800 }} dy={15} />
                  <YAxis hide />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1)', padding: '20px' }} />
                  <Bar dataKey="amount" radius={[14, 14, 14, 14]} barSize={55}>
                    {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#3b82f6' : '#f1f5f9'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-12 rounded-[4rem] shadow-sm border border-slate-100 flex flex-col">
            <h3 className="text-2xl font-black text-slate-900 mb-12 tracking-tight">Allocation</h3>
            <div className="h-64 w-full mb-10">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={90} outerRadius={115} paddingAngle={8} dataKey="value" stroke="none">
                      {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-200 gap-6">
                  <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeWidth="3" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
                  </div>
                  <span className="text-xs font-black uppercase tracking-[0.4em]">Zero History</span>
                </div>
              )}
            </div>
            <div className="space-y-4 overflow-y-auto max-h-40 pr-2 custom-scrollbar">
              {pieData.map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-4 h-4 rounded-full" style={{backgroundColor: COLORS[index % COLORS.length]}}></div>
                    <span className="text-sm text-slate-500 font-bold uppercase tracking-tight">{entry.name}</span>
                  </div>
                  <span className="text-sm font-black text-slate-900">₹{entry.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <TransactionList transactions={transactions} />
      </main>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[4rem] w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="p-16">
              <div className="flex justify-between items-center mb-10">
                <h3 className="text-4xl font-black text-slate-900 tracking-tighter">New Entry</h3>
                <button onClick={() => setShowModal(false)} className="w-14 h-14 flex items-center justify-center text-slate-300 hover:text-slate-900 hover:bg-slate-50 rounded-3xl transition-all">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-slate-500 font-bold mb-8 text-lg">Paste your HDFC Alert SMS or Email content here.</p>
              <textarea 
                className="w-full h-64 p-8 bg-slate-50 border border-slate-200 rounded-[3rem] focus:ring-8 focus:ring-blue-100 focus:bg-white outline-none text-slate-700 font-bold text-lg placeholder:text-slate-300 resize-none mb-10 transition-all"
                placeholder="Alert! Rs 450.00 spent at Amazon Pay..."
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
              <div className="flex gap-6">
                <button onClick={() => setShowModal(false)} className="flex-1 py-7 font-black text-slate-400 hover:bg-slate-50 rounded-[2rem] transition-all">Cancel</button>
                <button onClick={handleManualParse} disabled={isParsing || !emailInput} className="flex-1 py-7 bg-blue-600 text-white rounded-[2rem] font-black shadow-2xl shadow-blue-100 disabled:opacity-50 active:scale-95 transition-all text-xl">
                  {isParsing ? 'Processing...' : 'Record Transaction'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
