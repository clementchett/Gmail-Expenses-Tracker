
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Transaction, ExpenseCategory } from './types';
import { StatsCard } from './components/StatsCard';
import { TransactionList } from './components/TransactionList';
import { parseEmailContent } from './services/geminiService';
import { GmailService, GmailMessage } from './services/gmailService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

const App: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [syncedIds, setSyncedIds] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  
  // Gmail & Config States
  const [clientId, setClientId] = useState<string>(localStorage.getItem('gmail_client_id') || process.env.GMAIL_CLIENT_ID || '');
  const [gmailToken, setGmailToken] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [isServiceInitialized, setIsServiceInitialized] = useState(false);

  const gmailService = useMemo(() => new GmailService(clientId), [clientId]);

  // Save Client ID
  const handleSaveClientId = (id: string) => {
    const trimmedId = id.trim();
    setClientId(trimmedId);
    localStorage.setItem('gmail_client_id', trimmedId);
  };

  // Persistence
  useEffect(() => {
    const savedTrans = localStorage.getItem('hdfc_transactions');
    const savedIds = localStorage.getItem('hdfc_synced_ids');
    if (savedTrans) setTransactions(JSON.parse(savedTrans));
    if (savedIds) setSyncedIds(JSON.parse(savedIds));
  }, []);

  useEffect(() => {
    localStorage.setItem('hdfc_transactions', JSON.stringify(transactions));
    localStorage.setItem('hdfc_synced_ids', JSON.stringify(syncedIds));
  }, [transactions, syncedIds]);

  // Robust Service Initialization
  useEffect(() => {
    if (!clientId) return;

    let retries = 0;
    const interval = setInterval(() => {
      if (gmailService.isLoaded()) {
        const success = gmailService.init((token) => setGmailToken(token));
        if (success) {
          setIsServiceInitialized(true);
          clearInterval(interval);
        }
      }
      if (retries++ > 20) clearInterval(interval); // Stop after 10s
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
    const newTransaction = await parseEmailContent(emailInput);
    if (newTransaction) {
      setTransactions(prev => [newTransaction, ...prev]);
      setEmailInput('');
      setShowModal(false);
    } else {
      alert("Could not parse email. Make sure it's an HDFC InstaAlert text.");
    }
    setIsParsing(false);
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
        alert("Already up to date!");
        setIsSyncing(false);
        return;
      }

      const results: Transaction[] = [];
      const successfulIds: string[] = [];

      for (let i = 0; i < newMessages.length; i++) {
        setSyncProgress(Math.round(((i + 1) / newMessages.length) * 100));
        const msg = newMessages[i];
        const parsed = await parseEmailContent(msg.body || msg.snippet);
        if (parsed) {
          results.push(parsed);
          successfulIds.push(msg.id);
        }
      }

      if (results.length > 0) {
        setTransactions(prev => [...results, ...prev]);
        setSyncedIds(prev => [...successfulIds, ...prev]);
      }
    } catch (err) {
      console.error("Sync error:", err);
      alert("Failed to sync with Gmail. Check console for details.");
    }
    setIsSyncing(false);
  }, [gmailToken, gmailService, syncedIds]);

  const chartData = useMemo(() => {
    const days = 7;
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
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
    return Object.entries(categoryMap).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

  // Setup Screen if no Client ID
  if (!clientId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10 border border-slate-200">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-8 mx-auto shadow-lg shadow-blue-200">
             <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 text-center mb-2">Setup Required</h2>
          <p className="text-slate-500 text-center mb-8 text-sm">To link your HDFC InstaAlerts, you need a Google Cloud Client ID.</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Google Client ID</label>
              <input 
                type="text" 
                placeholder="e.g. 12345-abcde.apps.googleusercontent.com"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all text-sm"
                onBlur={(e) => handleSaveClientId(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Get yours at the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" className="text-blue-500 hover:underline">Google Cloud Console</a>. 
              Add <code className="bg-slate-100 p-0.5 rounded">http://localhost:3000</code> or your deployment URL to "Authorized JavaScript origins".
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Sync Overlay */}
      {isSyncing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-sm text-center animate-in fade-in duration-300">
            <div className="relative w-24 h-24 mx-auto mb-6">
              <svg className="w-full h-full text-blue-100" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" />
                <circle 
                  cx="50" cy="50" r="45" fill="none" stroke="#3b82f6" strokeWidth="8" 
                  strokeDasharray={`${(syncProgress / 100) * 283} 283`}
                  className="transition-all duration-300"
                  transform="rotate(-90 50 50)"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-bold text-blue-600">
                {syncProgress}%
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Syncing Expenses</h3>
            <p className="text-slate-500 text-sm">Reading HDFC alerts from Gmail...</p>
          </div>
        </div>
      )}

      {/* Header */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m.5-1c.11 0 .21-.017.306-.05M12 16c-1.11 0-2.08-.402-2.599-1M12 16V15m0 1v-8" /></svg>
              </div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">HDFC InstaDash</h1>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleGmailSync}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all ${
                  gmailToken 
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-100'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                {gmailToken ? 'Sync Now' : 'Link Gmail'}
              </button>
              <button 
                onClick={() => setShowModal(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl font-semibold transition-all shadow-md flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                Paste
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
        <div className="mb-10">
          <h2 className="text-4xl font-extrabold text-slate-900 mb-2">Finance Overview</h2>
          <div className="flex items-center gap-2 text-slate-500">
             <div className={`w-2 h-2 rounded-full ${gmailToken ? 'bg-emerald-500' : 'bg-slate-300 animate-pulse'}`}></div>
             <span className="text-sm font-medium">{gmailToken ? 'Connected to Gmail' : 'Waiting for connection...'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <StatsCard title="Total Spent" value={`₹${stats.totalSpent.toLocaleString('en-IN')}`} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>} />
          <StatsCard title="Top Category" value={stats.topCategory} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>} />
          <StatsCard title="Items Tracked" value={stats.transactionCount} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} />
          <StatsCard title="Average / Transaction" value={`₹${Math.round(stats.avgTransaction).toLocaleString('en-IN')}`} icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-8 flex items-center gap-2">Weekly Spending</h3>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                  <YAxis hide />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} />
                  <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#3b82f6' : '#e2e8f0'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-8">Category Split</h3>
            <div className="h-64 w-full">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={90} paddingAngle={6} dataKey="value">
                      {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-300 text-sm italic">No data yet</div>
              )}
            </div>
            <div className="mt-8 flex flex-wrap gap-4 justify-center">
              {pieData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS[index % COLORS.length]}}></div>
                  <span className="text-xs text-slate-600 font-bold uppercase tracking-tight">{entry.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <TransactionList transactions={transactions} />
      </main>

      {/* Manual Input Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-slate-800">Add Alert Text</h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <textarea 
                className="w-full h-48 p-5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none text-slate-700 placeholder:text-slate-400 resize-none mb-6"
                placeholder="Paste the HDFC InstaAlert email text here..."
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
              <div className="flex gap-4">
                <button onClick={() => setShowModal(false)} className="flex-1 py-4 font-bold text-slate-500 hover:bg-slate-50 rounded-2xl">Cancel</button>
                <button onClick={handleManualParse} disabled={isParsing || !emailInput} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 disabled:opacity-50">
                  {isParsing ? 'Analysing...' : 'Extract Expense'}
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
