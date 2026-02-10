
import React from 'react';
import { Transaction } from '../types.ts';

interface TransactionListProps {
  transactions: Transaction[];
}

export const TransactionList: React.FC<TransactionListProps> = ({ transactions }) => {
  return (
    <div className="bg-white rounded-[3.5rem] shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-10 border-b border-slate-50 flex justify-between items-center">
        <h3 className="font-black text-slate-900 text-2xl tracking-tight">Activity Log</h3>
        <button className="text-blue-600 text-sm font-black uppercase tracking-widest hover:underline">Download CSV</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50/50 text-slate-400 text-xs font-black uppercase tracking-[0.2em]">
              <th className="px-10 py-6">Source</th>
              <th className="px-10 py-6">Category</th>
              <th className="px-10 py-6">Timeline</th>
              <th className="px-10 py-6 text-right">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-10 py-24 text-center">
                  <div className="flex flex-col items-center gap-4 text-slate-300">
                    <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    <p className="font-bold text-lg">Your activity will appear here</p>
                  </div>
                </td>
              </tr>
            ) : (
              transactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-10 py-8">
                    <div className="flex flex-col">
                      <span className="font-black text-slate-900 text-lg tracking-tight group-hover:text-blue-600 transition-colors">{t.merchant}</span>
                      <span className="text-xs text-slate-400 font-bold uppercase tracking-tight mt-1">{t.description}</span>
                    </div>
                  </td>
                  <td className="px-10 py-8">
                    <span className="px-4 py-1.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                      {t.category}
                    </span>
                  </td>
                  <td className="px-10 py-8 text-slate-500 font-bold text-sm">
                    {new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className={`px-10 py-8 text-right font-black text-xl tracking-tight ${t.type === 'CREDIT' ? 'text-emerald-500' : 'text-slate-900'}`}>
                    {t.type === 'CREDIT' ? '+' : ''}₹{t.amount.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
