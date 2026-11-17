import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Users, CreditCard, Activity, Search, Edit2, Ban, CheckCircle, Ticket, HardDrive, Cpu, AlertTriangle, Plus, Trash2, Save, X, RefreshCw, MessageSquare, Send, LayoutTemplate, Code2 } from 'lucide-react';
import api from '../services/api';
import Toast from '../components/Toast';

const SuperAdmin = () => {
  const [activeTab, setActiveTab] = useState('super-admin');
  const [data, setData] = useState({ pricing: [], coupons: [], users: [], tickets: [], bot_overview: [] });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState({ message: '', variant: 'error' });
  const [editingPlan, setEditingPlan] = useState(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [newPlan, setNewPlan] = useState({ plan_name: '', price_monthly: 0, max_bots: 1, duration_days: 30, features: {} });
  const [newCoupon, setNewCoupon] = useState({ code: '', discount_percent: 20, expires_at: '' });
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    platform: 'telegram',
    description: '',
    starter_code: ''
  });
  const chatEndRef = useRef(null);

  const fetchOverview = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const res = await api.get('/admin/overview');
      setData(res.data);
      setSelectedTicket((current) => {
        if (!current) return current;
        const updatedTicket = (res.data.tickets || []).find((t) => t.id === current.id);
        return updatedTicket || current;
      });
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to load admin data');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadTemplates = useCallback(async () => {
    try {
      setTemplatesLoading(true);
      const res = await api.get('/templates');
      setTemplates(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      showToast('Failed to load bot templates');
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [selectedTicket?.replies]);

  useEffect(() => {
    if (!selectedTicket) return undefined;
    const interval = setInterval(() => fetchOverview({ silent: true }), 5000);
    return () => clearInterval(interval);
  }, [selectedTicket?.id]);

  const showToast = (message, variant = 'error') => {
    setToast({ message, variant });
  };

  const handleCreatePlan = async () => {
    try {
      await api.post('/admin/pricing', newPlan);
      showToast('Plan created successfully', 'success');
      setShowPlanModal(false);
      setNewPlan({ plan_name: '', price_monthly: 0, max_bots: 1, duration_days: 30, features: {} });
      fetchOverview();
    } catch (err) {
      showToast('Failed to create plan');
    }
  };

  const handleUpdatePlan = async () => {
    try {
      await api.put(`/admin/pricing/${editingPlan.plan_name}`, {
        price_monthly: editingPlan.price_monthly,
        max_bots: editingPlan.max_bots,
        duration_days: editingPlan.duration_days,
        features: editingPlan.features
      });
      showToast('Plan updated successfully', 'success');
      setEditingPlan(null);
      fetchOverview();
    } catch (err) {
      showToast('Failed to update plan');
    }
  };

  const handleDeletePlan = async (planName) => {
    if (!window.confirm(`Are you sure you want to delete ${planName}?`)) return;
    try {
      await api.delete(`/admin/pricing/${planName}`);
      showToast('Plan deleted', 'success');
      fetchOverview();
    } catch (err) {
      showToast('Failed to delete plan');
    }
  };

  const handleCreateCoupon = async () => {
    try {
      await api.post('/admin/coupons', newCoupon);
      showToast('Coupon created successfully', 'success');
      setShowCouponModal(false);
      setNewCoupon({ code: '', discount_percent: 20, expires_at: '' });
      fetchOverview();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to create coupon');
    }
  };

  const handleToggleCoupon = async (id) => {
    try {
      await api.patch(`/admin/coupons/${id}/toggle`);
      fetchOverview();
    } catch (err) {
      showToast('Failed to toggle coupon');
    }
  };

  const handleCreateTemplate = async (e) => {
    e?.preventDefault();
    if (!newTemplate.name.trim()) {
      showToast('Template name is required');
      return;
    }
    setCreatingTemplate(true);
    try {
      await api.post('/admin/templates', {
        name: newTemplate.name.trim(),
        platform: newTemplate.platform,
        description: newTemplate.description.trim(),
        starter_code: newTemplate.starter_code
      });
      showToast('Template created successfully', 'success');
      setShowTemplateModal(false);
      setNewTemplate({ name: '', platform: 'telegram', description: '', starter_code: '' });
      loadTemplates();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to create template');
    } finally {
      setCreatingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (template) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) return;
    try {
      await api.delete(`/admin/templates/${template.id}`);
      showToast('Template deleted', 'success');
      loadTemplates();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete template');
    }
  };

  const handleUpdateUser = async (id, updates) => {
    try {
      await api.patch(`/admin/users/${id}`, updates);
      showToast('User updated successfully', 'success');
      fetchOverview();
    } catch (err) {
      showToast('Failed to update user');
    }
  };

  const handleToggleTicketStatus = async (ticket) => {
    if (!ticket) return;
    const nextStatus = ticket.status === 'resolved' ? 'open' : 'resolved';
    try {
      await api.patch(`/support/tickets/${ticket.id}/status`, { status: nextStatus });
      showToast(nextStatus === 'resolved' ? 'Ticket resolved' : 'Ticket reopened', 'success');
      fetchOverview({ silent: true });
    } catch (err) {
      showToast('Failed to update ticket status');
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;
    setReplying(true);
    try {
      const res = await api.post(`/support/tickets/${selectedTicket.id}/reply`, { message: replyText.trim() });
      setReplyText('');
      if (res.data) setSelectedTicket(res.data);
      fetchOverview({ silent: true });
    } catch (err) {
      showToast('Failed to send reply');
    } finally {
      setReplying(false);
    }
  };

  const filteredUsers = (data.users || []).filter(u => 
    (u.email || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (u.id || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading && !data.users?.length) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw size={40} className="animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
      <Toast message={toast.message} variant={toast.variant} onClose={() => setToast({ message: '', variant: 'error' })} />
      
      <div className="flex items-center gap-4 mb-12">
         <div className="w-12 h-12 shrink-0 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
            <Shield size={28} />
         </div>
         <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold">RBAC Control Panel</h1>
            <p className="text-zinc-500 text-sm">Central management for Botnoob infrastructure and users.</p>
         </div>
      </div>

      <div className="flex gap-1 bg-zinc-900 p-1 rounded-xl w-full sm:w-fit mb-12 border border-zinc-800 overflow-x-auto">
         <button onClick={() => setActiveTab('super-admin')} className={`px-4 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${activeTab === 'super-admin' ? 'bg-zinc-800 text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'}`}>Super Admin Tab</button>
         <button onClick={() => setActiveTab('employee')} className={`px-4 sm:px-6 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${activeTab === 'employee' ? 'bg-zinc-800 text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}>Employee Support Tab</button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'super-admin' ? (
          <motion.div key="super-admin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="frosted-card rounded-2xl p-6 border-zinc-800 relative">
                   <div className="flex justify-between items-center mb-6">
                      <CreditCard size={20} className="text-zinc-500" />
                      <button onClick={() => setShowPlanModal(true)} className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest hover:underline">Add Custom Plan</button>
                   </div>
                   <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Pricing Plans</h3>
                   <div className="space-y-3">
                      {(data.pricing || []).map(plan => (
                        <div key={plan.plan_name} className="flex justify-between items-center bg-obsidian p-2 rounded-lg border border-zinc-800">
                           <div>
                              <div className="text-xs font-bold text-zinc-300 capitalize">{plan.plan_name.replace('_', ' ')}</div>
                              <div className="text-sm font-bold text-cyan-400">₹{plan.price_monthly ?? 0} <span className="text-[10px] font-normal text-zinc-500">/ {plan.duration_days ?? 30} days</span></div>
                           </div>
                           <div className="flex gap-1">
                              <button onClick={() => setEditingPlan(plan)} className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-cyan-400"><Edit2 size={14} /></button>
                              <button onClick={() => handleDeletePlan(plan.plan_name)} className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-red-400"><Trash2 size={14} /></button>
                           </div>
                        </div>
                      ))}
                   </div>

                   {editingPlan && (
                     <div className="absolute inset-0 bg-zinc-950/95 rounded-2xl p-6 z-10 flex flex-col justify-center">
                        <h4 className="font-bold text-sm mb-4 capitalize">Edit {editingPlan.plan_name.replace('_', ' ')}</h4>
                        <div className="space-y-3 mb-4">
                           <input type="number" value={editingPlan.price_monthly ?? ''} onChange={(e) => setEditingPlan({...editingPlan, price_monthly: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-sm outline-none focus:border-cyan-500" placeholder="Price" />
                           <input type="number" value={editingPlan.max_bots ?? ''} onChange={(e) => setEditingPlan({...editingPlan, max_bots: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-sm outline-none focus:border-cyan-500" placeholder="Max Bots" />
                           <input type="number" min="1" value={editingPlan.duration_days ?? 30} onChange={(e) => setEditingPlan({...editingPlan, duration_days: e.target.value})} className="w-full bg-zinc-900 border border-zinc-800 rounded p-2 text-sm outline-none focus:border-cyan-500" placeholder="Duration (Days)" />
                        </div>
                        <div className="flex gap-2">
                           <button onClick={handleUpdatePlan} className="flex-1 bg-cyan-500 text-black font-bold py-2 rounded text-xs">Save</button>
                           <button onClick={() => setEditingPlan(null)} className="flex-1 bg-zinc-800 font-bold py-2 rounded text-xs">Cancel</button>
                        </div>
                     </div>
                   )}
                </div>

                <div className="frosted-card rounded-2xl p-6 border-zinc-800">
                   <div className="flex justify-between items-center mb-6">
                      <Ticket size={20} className="text-zinc-500" />
                      <button onClick={() => setShowCouponModal(true)} className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest hover:underline">Create New</button>
                   </div>
                   <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Discount Coupons</h3>
                   <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {(data.coupons || []).map(coupon => (
                        <div key={coupon.id} className="flex justify-between items-center text-xs p-2 bg-obsidian rounded border border-zinc-800">
                           <div>
                              <span className="font-mono font-bold text-zinc-300">{coupon.code}</span>
                              <span className="ml-2 text-green-500">{coupon.discount_percent ?? 0}% off</span>
                           </div>
                           <button onClick={() => handleToggleCoupon(coupon.id)} className={`w-8 h-4 rounded-full transition-colors relative ${coupon.is_active ? 'bg-cyan-500' : 'bg-zinc-800'}`}>
                              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${coupon.is_active ? 'left-4.5' : 'left-0.5'}`} />
                           </button>
                        </div>
                      ))}
                   </div>
                </div>

                <div className="frosted-card rounded-2xl p-6 border-zinc-800">
                   <Users size={20} className="text-zinc-500 mb-6" />
                   <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-1">Infrastructure</h3>
                   <div className="grid grid-cols-2 gap-4 mt-6">
                      <div className="bg-obsidian p-3 rounded-xl border border-zinc-800"><div className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Total Users</div><div className="text-xl font-bold">{data.users?.length ?? 0}</div></div>
                      <div className="bg-obsidian p-3 rounded-xl border border-zinc-800"><div className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Total Bots</div><div className="text-xl font-bold">{data.bot_overview?.length ?? 0}</div></div>
                   </div>
                </div>
             </div>

             <div className="frosted-card rounded-3xl p-6 sm:p-8 border-zinc-800">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
                   <h3 className="text-xl font-bold">Bot Templates</h3>
                   <button onClick={() => setShowTemplateModal(true)} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-obsidian rounded-xl text-xs font-bold transition-all">
                      <Plus size={14} /> Add Template
                   </button>
                </div>
                {templatesLoading ? (
                   <div className="flex items-center justify-center py-8 text-sm text-zinc-500"><RefreshCw size={16} className="animate-spin mr-2" /> Loading templates...</div>
                ) : (
                   <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                      {templates.map((template) => (
                        <div key={template.id} className="bg-obsidian border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
                           <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                 <div className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${template.platform === 'discord' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-cyan-500/10 text-cyan-400'}`}>
                                    {template.platform === 'discord' ? <MessageSquare size={16} /> : <LayoutTemplate size={16} />}
                                 </div>
                                 <div className="min-w-0">
                                    <h4 className="text-sm font-bold truncate">{template.name}</h4>
                                    <span className="text-[9px] uppercase tracking-widest font-bold text-zinc-500">{template.platform}</span>
                                 </div>
                              </div>
                              {!template.is_default && (
                                <button onClick={() => handleDeleteTemplate(template)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                              )}
                           </div>
                           <p className="text-xs text-zinc-500 line-clamp-2 min-h-[2rem]">{template.description || 'No description provided.'}</p>
                           <div className="flex items-center justify-between pt-2 border-t border-zinc-900">
                              <span className="text-[10px] text-zinc-600 flex items-center gap-1"><Code2 size={11} /> {(template.starter_code || '').length} chars</span>
                              {template.is_default && <span className="text-[9px] font-bold uppercase tracking-widest text-amber-500">Built-in</span>}
                           </div>
                        </div>
                      ))}
                   </div>
                )}
             </div>

             <div className="frosted-card rounded-3xl p-6 sm:p-8 border-zinc-800">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
                   <h3 className="text-xl font-bold">User Management</h3>
                   <div className="relative w-full sm:w-80">
                      <input type="text" placeholder="Search..." value={searchQuery ?? ''} onChange={(e) => setSearchQuery(e.target.value)} className="w-full h-10 pl-10 pr-4 bg-obsidian border border-zinc-800 rounded-lg outline-none focus:border-cyan-500 text-xs" />
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                   </div>
                </div>
                <div className="overflow-x-auto">
                   <table className="w-full text-left">
                      <thead>
                         <tr className="border-b border-zinc-900 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                            <th className="pb-4">User</th><th className="pb-4">Role</th><th className="pb-4">Plan</th><th className="pb-4">Status</th><th className="pb-4 text-right">Actions</th>
                         </tr>
                      </thead>
                      <tbody className="text-sm">
                         {filteredUsers.map((u) => (
                           <tr key={u.id} className="border-b border-zinc-900/50 last:border-0">
                              <td className="py-4"><div>{u.email ?? 'Unknown'}</div><div className="text-[10px] text-zinc-600 font-mono">{u.id}</div></td>
                              <td className="py-4"><select value={u.role ?? 'user'} onChange={(e) => handleUpdateUser(u.id, { role: e.target.value })} className="bg-zinc-900 border border-zinc-800 rounded text-[10px] p-1 outline-none"><option value="user">User</option><option value="employee">Employee</option><option value="super_admin">Super Admin</option></select></td>
                              <td className="py-4"><select value={u.plan_tier ?? 'free_byok'} onChange={(e) => handleUpdateUser(u.id, { plan_tier: e.target.value })} className={`bg-zinc-900 border border-zinc-800 rounded text-[10px] p-1 outline-none ${u.plan_tier !== 'free_byok' ? 'text-cyan-400' : 'text-zinc-500'}`}>
                                {(data.pricing || []).length === 0 && <option value="free_byok">Free</option>}
                                {u.plan_tier && !(data.pricing || []).some((plan) => plan.plan_name === u.plan_tier) && (
                                  <option value={u.plan_tier}>{u.plan_tier.replace(/_/g, ' ')}</option>
                                )}
                                {(data.pricing || []).map((plan) => (
                                  <option key={plan.plan_name} value={plan.plan_name}>
                                    {plan.plan_name === 'free_byok' ? 'Free' : plan.plan_name.replace(/_/g, ' ')}
                                  </option>
                                ))}
                              </select></td>
                              <td className="py-4"><span className={`text-xs font-medium ${!u.is_banned ? 'text-green-500' : 'text-red-500'}`}>{u.is_banned ? 'Banned' : 'Active'}</span></td>
                              <td className="py-4 text-right"><button onClick={() => handleUpdateUser(u.id, { is_banned: !u.is_banned })} className={`p-1.5 hover:bg-zinc-800 rounded transition-colors ${u.is_banned ? 'text-green-500' : 'text-red-500'}`}>{u.is_banned ? <CheckCircle size={14} /> : <Ban size={14} />}</button></td>
                           </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
             </div>

             {showPlanModal && (
               <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] px-4 backdrop-blur-sm">
                   <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 w-full max-w-md">
                     <h3 className="text-xl font-bold mb-6">Add Custom Plan</h3>
                     <div className="space-y-4 mb-8">
                        <input type="text" placeholder="Plan ID (e.g. starter_7d)" value={newPlan.plan_name} onChange={(e) => setNewPlan({...newPlan, plan_name: e.target.value})} className="w-full bg-obsidian border border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-cyan-500" />
                        <input type="number" placeholder="Price (₹)" value={newPlan.price_monthly ?? ''} onChange={(e) => setNewPlan({...newPlan, price_monthly: parseInt(e.target.value)})} className="w-full bg-obsidian border border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-cyan-500" />
                        <input type="number" placeholder="Max Bots" value={newPlan.max_bots ?? ''} onChange={(e) => setNewPlan({...newPlan, max_bots: parseInt(e.target.value)})} className="w-full bg-obsidian border border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-cyan-500" />
                        <div>
                           <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Duration (Days)</label>
                           <input type="number" min="1" placeholder="e.g. 7, 15, 30, 365" value={newPlan.duration_days ?? 30} onChange={(e) => setNewPlan({...newPlan, duration_days: parseInt(e.target.value)})} className="w-full bg-obsidian border border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-cyan-500" />
                           <div className="flex gap-2 mt-2">
                              {[7, 15, 30, 365].map((days) => (
                                <button key={days} type="button" onClick={() => setNewPlan({ ...newPlan, duration_days: days })} className={`px-3 py-1 rounded-lg text-[10px] font-bold border transition-all ${Number(newPlan.duration_days) === days ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>{days}d</button>
                              ))}
                           </div>
                        </div>
                     </div>
                     <div className="flex gap-4">
                        <button onClick={handleCreatePlan} className="flex-1 bg-cyan-500 text-black font-bold py-3 rounded-xl">Create</button>
                        <button onClick={() => setShowPlanModal(false)} className="px-6 bg-zinc-800 font-bold py-3 rounded-xl">Cancel</button>
                     </div>
                   </motion.div>
               </div>
             )}

             {showCouponModal && (
               <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] px-4 backdrop-blur-sm">
                  <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 w-full max-w-md">
                     <h3 className="text-xl font-bold mb-6">Create Discount Coupon</h3>
                     <div className="space-y-4 mb-8">
                        <input type="text" placeholder="Coupon Code" value={newCoupon.code ?? ''} onChange={(e) => setNewCoupon({...newCoupon, code: e.target.value.toUpperCase()})} className="w-full bg-obsidian border border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-cyan-500" />
                        <input type="number" placeholder="Discount (%)" value={newCoupon.discount_percent ?? ''} onChange={(e) => setNewCoupon({...newCoupon, discount_percent: parseInt(e.target.value)})} className="w-full bg-obsidian border border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-cyan-500" />
                     </div>
                      <div className="flex gap-4">
                         <button onClick={handleCreateCoupon} className="flex-1 bg-cyan-500 text-black font-bold py-3 rounded-xl">Create</button>
                         <button onClick={() => setShowCouponModal(false)} className="px-6 bg-zinc-800 font-bold py-3 rounded-xl">Cancel</button>
                      </div>
                   </motion.div>
                </div>
             )}

             {showTemplateModal && (
               <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] px-4 py-6 backdrop-blur-sm">
                  <motion.form onSubmit={handleCreateTemplate} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar">
                     <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-bold">Add Bot Template</h3>
                        <button type="button" onClick={() => setShowTemplateModal(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
                     </div>
                     <div className="space-y-4 mb-8">
                        <input type="text" placeholder="Template name" value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} className="w-full bg-obsidian border border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-cyan-500" />
                        <select value={newTemplate.platform} onChange={(e) => setNewTemplate({ ...newTemplate, platform: e.target.value })} className="w-full bg-obsidian border border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-cyan-500">
                           <option value="telegram">Telegram</option>
                           <option value="discord">Discord</option>
                        </select>
                        <textarea placeholder="Short description" value={newTemplate.description} onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })} className="w-full bg-obsidian border border-zinc-800 rounded-xl p-3 text-sm outline-none focus:border-cyan-500 h-20 resize-none" />
                        <div>
                           <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Starter code (bot.js)</label>
                           <textarea placeholder="process.env.BOT_TOKEN ..." value={newTemplate.starter_code} onChange={(e) => setNewTemplate({ ...newTemplate, starter_code: e.target.value })} className="w-full bg-obsidian border border-zinc-800 rounded-xl p-3 text-xs font-mono outline-none focus:border-cyan-500 h-56 resize-y" />
                        </div>
                     </div>
                     <div className="flex gap-4">
                        <button type="submit" disabled={creatingTemplate} className="flex-1 bg-cyan-500 text-black font-bold py-3 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2">{creatingTemplate && <RefreshCw size={14} className="animate-spin" />} Create</button>
                        <button type="button" onClick={() => setShowTemplateModal(false)} className="px-6 bg-zinc-800 font-bold py-3 rounded-xl">Cancel</button>
                     </div>
                  </motion.form>
               </div>
             )}
          </motion.div>
        ) : (
          <motion.div key="employee" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
             <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex gap-4 mb-8"><AlertTriangle className="text-amber-500 shrink-0" size={24} /><div className="text-xs text-amber-200/70 leading-relaxed"><p className="font-bold text-amber-500 uppercase tracking-widest mb-1">Strict Zero-Knowledge Notice</p>As an employee, user Bot Tokens, BYOK keys, and private source code are encrypted and hidden.</div></div>
             <div className="frosted-card rounded-3xl p-8 border-zinc-800">
                <h3 className="text-xl font-bold mb-8">Support Queue</h3>
                <div className="space-y-4">
                   {(data.tickets || []).map((t) => (
                     <div key={t.id} onClick={() => setSelectedTicket(t)} className={`bg-obsidian border rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 cursor-pointer transition-all ${t.status === 'resolved' ? 'border-zinc-900 opacity-60' : 'border-zinc-800 hover:border-indigo-500/50'}`}>
                        <div className="min-w-0"><h4 className="font-bold text-sm mb-1 truncate">{t.subject}</h4><p className="text-xs text-zinc-500 truncate">{t.user_email}</p></div>
                         <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                            <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${t.status === 'resolved' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>{t.status}</span>
                            <button onClick={(e) => { e.stopPropagation(); handleToggleTicketStatus(t); }} className="px-4 py-2 bg-zinc-900 text-xs font-bold rounded-lg border border-zinc-800 text-cyan-400 hover:bg-zinc-800">{t.status === 'resolved' ? 'Reopen' : 'Resolve'}</button>
                         </div>
                     </div>
                   ))}
                </div>
             </div>

             <AnimatePresence>
                {selectedTicket && (
                  <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                     <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedTicket(null)} className="absolute inset-0 bg-obsidian/85 backdrop-blur-sm"></motion.div>
                     <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative w-full max-w-2xl frosted-card rounded-3xl flex flex-col h-[80vh] shadow-2xl overflow-hidden border-zinc-800">
                        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 gap-3">
                           <div className="min-w-0">
                              <h3 className="text-xl font-bold truncate">{selectedTicket.subject}</h3>
                              <div className="flex items-center gap-2 mt-1">
                                 <p className="text-xs text-zinc-500 truncate">{selectedTicket.user_email}</p>
                                 <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${selectedTicket.status === 'resolved' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>{selectedTicket.status}</span>
                              </div>
                           </div>
                           <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => handleToggleTicketStatus(selectedTicket)} className={`px-3 py-2 rounded-lg text-[10px] font-bold border transition-all ${selectedTicket.status === 'resolved' ? 'border-amber-500/30 text-amber-300 hover:bg-amber-500/10' : 'border-green-500/30 text-green-300 hover:bg-green-500/10'}`}>
                                 {selectedTicket.status === 'resolved' ? 'Reopen' : 'Mark Resolved'}
                              </button>
                              <button onClick={() => setSelectedTicket(null)} className="p-2 hover:bg-zinc-800 rounded-full"><X /></button>
                           </div>
                        </div>
                        <div className="flex-grow overflow-y-auto p-6 space-y-4 custom-scrollbar bg-black/20">
                           <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl max-w-[85%] self-start">
                              <p className="text-sm text-zinc-300">{selectedTicket.message}</p>
                              <p className="text-[10px] text-zinc-500 mt-2">Original Message</p>
                           </div>
                           {(selectedTicket.replies || []).map((r) => (
                             <div key={r.id} className={`flex flex-col ${['super_admin', 'employee'].includes(r.sender_role) ? 'items-end' : 'items-start'}`}>
                                <div className={`p-4 rounded-2xl max-w-[85%] border ${['super_admin', 'employee'].includes(r.sender_role) ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-100' : 'bg-zinc-900/50 border-zinc-800 text-zinc-300'}`}>
                                   <p className="text-sm">{r.message}</p>
                                </div>
                                <span className="text-[10px] text-zinc-600 mt-1 px-2 uppercase font-bold">{['super_admin', 'employee'].includes(r.sender_role) ? 'Support' : 'User'} · {new Date(r.created_at).toLocaleTimeString()}</span>
                             </div>
                           ))}
                           <div ref={chatEndRef} />
                        </div>
                        <form onSubmit={handleSendReply} className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex gap-2">
                           <input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Type your response..." className="flex-grow bg-obsidian border border-zinc-800 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500" />
                           <button type="submit" disabled={replying || !replyText.trim()} className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-obsidian p-3 rounded-xl transition-all"><Send size={20} /></button>
                        </form>
                     </motion.div>
                  </div>
                )}
             </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SuperAdmin;
