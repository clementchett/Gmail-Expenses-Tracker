
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
  
  // Gmail States
  const [gmailToken, setGmailToken] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);

  const gmailClientId = process.env.GMAIL_CLIENT_ID || ''; // Ensure you have this set
  const gmailService = useMemo(() => new GmailService(gmailClientId), [gmailClientId]);

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

  // Initialize Gmail Service
  useEffect(() => {
    if (gmailClientId) {
      gmailService.init((token) => {
        setGmailToken(token);
      });
    }
  }, [gmailService, gmailClientId]);

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
        // We use snippet or body. Body is better if extracted correctly.
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
      alert("Failed to sync with Gmail.");
    }
    setIsSyncing(false);
  }, [gmailToken, gmailService, syncedIds]);

  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    return last7Days.map(date => {
      const dayTotal = transactions
        .filter(t => t.date === date && t.type === 'DEBIT')
        .reduce((sum, t) => sum + t.amount, 0);
      return {
        name: new Date(date).toLocaleDateString('en-IN', { weekday: 'short' }),
        amount: dayTotal
      };
    });
  }, [transactions]);

  const pieData = useMemo(() => {
    const categoryMap: Record<string, number> = {};
    transactions.filter(t => t.type === 'DEBIT').forEach(t => {
      categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
    });
    return Object.entries(categoryMap).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Sync Overlay */}
      {isSyncing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-sm text-center">
            <div className="relative w-24 h-24 mx-auto mb-6">
              <svg className="w-full h-full text-blue-100" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" />
                <circle 
                  cx="50" cy="50" r="45" fill="none" stroke="#3b82f6" strokeWidth="8" 
                  strokeDasharray={`${(syncProgress / 100) * 283} 283`}
                  className="transition-all duration-300"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-bold text-blue-600">
                {syncProgress}%
              </div>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Syncing Expenses</h3>
            <p className="text-slate-500 text-sm">Reading HDFC alerts and analyzing with Gemini AI...</p>
          </div>
        </div>
      )}

      {/* Header */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m.5-1c.11 0 .21-.017.306-.05M12 16c-1.11 0-2.08-.402-2.599-1M12 16V15m0 1v-8" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">HDFC InstaDash</h1>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleGmailSync}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all shadow-md ${
                  gmailToken 
                  ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {gmailToken ? 'Sync Gmail' : 'Link Gmail'}
              </button>
              <button 
                onClick={() => setShowModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-semibold transition-all shadow-md shadow-blue-100 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Paste Alert
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-slate-800">Financial Summary</h2>
          <p className="text-slate-500">Linked to: {gmailToken ? 'HDFC Bank InstaAlerts via Gmail' : 'Manual Input Mode'}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatsCard 
            title="Total Spent" 
            value={`₹${stats.totalSpent.toLocaleString('en-IN')}`} 
            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
          />
          <StatsCard 
            title="Top Category" 
            value={stats.topCategory} 
            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>}
          />
          <StatsCard 
            title="Total Items" 
            value={stats.transactionCount} 
            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
          />
          <StatsCard 
            title="Avg. Spend" 
            value={`₹${Math.round(stats.avgTransaction).toLocaleString('en-IN')}`} 
            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
              Weekly Spending Trend
            </h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                  <YAxis hide />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                  />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#3b82f6' : '#94a3b8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
              Category Split
            </h3>
            <div className="h-72 w-full">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                  No data to display
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 justify-center">
              {pieData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{backgroundColor: COLORS[index % COLORS.length]}}></div>
                  <span className="text-[10px] text-slate-500 font-medium uppercase">{entry.name}</span>
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
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-slate-800">New InstaAlert</h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Paste Email Content</label>
                <textarea 
                  className="w-full h-40 p-4 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none text-slate-600 placeholder:text-slate-400 resize-none"
                  placeholder="Paste the HDFC Bank InstaAlert text here..."
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                />
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 px-4 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleManualParse}
                  disabled={isParsing || !emailInput}
                  className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
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
