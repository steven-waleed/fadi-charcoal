import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin, Store, Navigation, ShieldAlert, CheckCircle2, XCircle,
  Clock, AlertTriangle, Users, FileText, BarChart3, Image as ImageIcon,
  Flame, Plus, Search, Filter, RefreshCw, Check, ArrowUpDown, DollarSign,
  TrendingUp, Download, Eye, Layers, Compass, ArrowRight, Calendar, Lock,
  Menu, X, Smartphone
} from 'lucide-react';
import L from 'leaflet';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

type TabType = 'fleet' | 'planner' | 'audit' | 'conflicts' | 'stores' | 'skips' | 'eod';

export default function AdminApp() {
  const [currentTab, setCurrentTab] = useState<TabType>('fleet');
  const [currentRole, setCurrentRole] = useState<'ADMIN' | 'SUPERVISOR'>('ADMIN');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Data states
  const [stats, setStats] = useState<any>(null);
  const [reps, setReps] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [visitsFeed, setVisitsFeed] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [liveFleet, setLiveFleet] = useState<any[]>([]);
  const [skips, setSkips] = useState<any[]>([]);
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>('');

  // Modals & Forms
  const [newStoreModal, setNewStoreModal] = useState<boolean>(false);
  const [storeForm, setStoreForm] = useState({
    name: '',
    ownerName: '',
    phone: '',
    zoneId: 6,
    latitude: 33.3152,
    longitude: 44.425,
    debt: 0,
    preferredCharcoal: 'فحم شيشة درجة أولى',
    assignedDay: 'Sunday',
  });

  const [toastMessage, setToastMessage] = useState<string>('');
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markersGroup = useRef<L.LayerGroup | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const safeFetch = (url: string) =>
        fetch(url)
          .then((r) => r.json())
          .catch((e) => {
            console.log('safeFetch failed for', url, e);
            return { success: false, data: [] };
          });

      const [statsRes, repsRes, zonesRes, storesRes, visitsRes, conflictsRes, fleetRes, skipsRes] = await Promise.all([
        safeFetch(`${API_BASE}/admin/dashboard`),
        safeFetch(`${API_BASE}/reps`),
        safeFetch(`${API_BASE}/zones`),
        safeFetch(`${API_BASE}/stores`),
        safeFetch(`${API_BASE}/admin/visits-feed`),
        safeFetch(`${API_BASE}/admin/conflicts`),
        safeFetch(`${API_BASE}/admin/live-map`),
        safeFetch(`${API_BASE}/admin/skips`),
      ]);

      if (statsRes.success) setStats(statsRes.stats);
      if (repsRes.success && Array.isArray(repsRes.data)) setReps(repsRes.data);
      if (zonesRes.success && Array.isArray(zonesRes.data)) {
        setZones(zonesRes.data);
        if (zonesRes.data.length > 0) {
          setStoreForm((prev) => ({ ...prev, zoneId: zonesRes.data[0].id }));
        }
      }
      if (storesRes.success && Array.isArray(storesRes.data)) setStores(storesRes.data);
      if (visitsRes.success && Array.isArray(visitsRes.data)) setVisitsFeed(visitsRes.data);
      if (conflictsRes.success && Array.isArray(conflictsRes.data)) setConflicts(conflictsRes.data);
      if (fleetRes.success && Array.isArray(fleetRes.data)) setLiveFleet(fleetRes.data);
      if (skipsRes.success && Array.isArray(skipsRes.data)) setSkips(skipsRes.data);
    } catch (err) {
      console.log('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Revisit Cycle Customization (Admin Only)
  const handleUpdateCycle = async (storeId: number, days: number) => {
    try {
      const res = await fetch(`${API_BASE}/admin/stores/${storeId}/cycle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revisitCycleDays: days }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.message);
        fetchAllData();
      }
    } catch (e) {
      showToast('فشل تعديل دورة التكرار');
    }
  };

  // Initialize & Update Map when on 'fleet' tab
  useEffect(() => {
    if (currentTab === 'fleet' && mapRef.current) {
      if (!leafletMap.current) {
        leafletMap.current = L.map(mapRef.current).setView([33.3152, 44.3920], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(leafletMap.current);
        markersGroup.current = L.layerGroup().addTo(leafletMap.current);
      }

      renderFleetMarkers();
    }
  }, [currentTab, liveFleet, selectedRepFilter]);

  const renderFleetMarkers = () => {
    if (!markersGroup.current || !leafletMap.current) return;
    markersGroup.current.clearLayers();

    const bounds: L.LatLngExpression[] = [];

    liveFleet.forEach((rep) => {
      if (selectedRepFilter && String(rep.id) !== selectedRepFilter) return;

      const currentRoute = rep.routes?.[0];
      if (!currentRoute?.stops) return;

      currentRoute.stops.forEach((stop: any, idx: number) => {
        const store = stop.store;
        if (!store) return;

        let color = '#e11d48'; // Red: Remaining / Pending (🔴)
        let label = 'بانتظار الزيارة (أحمر 🔴)';

        if (stop.status === 'VISITED') {
          color = '#10b981'; // Green: Completed (🟢)
          label = 'تمت الزيارة بنجاح (أخضر 🟢)';
        } else if (stop.status === 'CURRENT') {
          color = '#f59e0b'; // Yellow: Current stop
          label = 'المحطة النشطة الحالية ⏳';
        } else if (stop.status === 'SKIPPED') {
          color = '#be123c'; // Dark Red: Skipped
          label = `متخطى ومؤجل للنهاية: ${stop.skipReason || ''} 🔴`;
        }

        if (stop.isAdHoc) {
          color = '#8b5cf6'; // Purple: Ad-Hoc
          label = 'محطة طارئة مضافة (Ad-Hoc) 🚨';
        }

        const marker = L.circleMarker([store.latitude, store.longitude], {
          radius: stop.status === 'CURRENT' ? 12 : 9,
          fillColor: color,
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9,
        });

        marker.bindPopup(`
          <div style="direction: rtl; text-align: right; min-width: 170px;">
            <div style="font-weight: 800; color: #0f172a; margin-bottom: 2px;">${store.name}</div>
            <div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">
              📍 المنطقة: <b>${store.zone?.name || 'بغداد'}</b>
            </div>
            <div style="font-size: 11px; color: #334155; margin-bottom: 2px;">
              المندوب: <b>${rep.name}</b> (محطة #${idx + 1})
            </div>
            <div style="font-size: 11px; font-weight: bold; color: ${color}; margin-top: 4px;">
              ${label}
            </div>
            <div style="margin-top: 6px;">
              <a href="https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}" 
                 target="_blank" style="color: #2563eb; font-size: 11px; text-decoration: underline;">
                فتح المسار في خرائط Google
              </a>
            </div>
          </div>
        `);

        markersGroup.current?.addLayer(marker);
        bounds.push([store.latitude, store.longitude]);
      });
    });

    if (bounds.length > 0) {
      leafletMap.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  };

  // Route Optimizer
  const handleOptimizeRoute = async (routeId: number) => {
    try {
      const res = await fetch(`${API_BASE}/routes/${routeId}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentLat: 33.3152, currentLng: 44.3661 }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.message);
        fetchAllData();
      }
    } catch (e) {
      showToast('حدث خطأ أثناء تحسين المسار');
    }
  };

  // Visit Status Approval
  const handleApproveVisit = async (visitId: number, status: 'APPROVED' | 'REJECTED') => {
    try {
      const res = await fetch(`${API_BASE}/admin/visits/${visitId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`تم ${status === 'APPROVED' ? 'اعتماد' : 'رفض'} الزيارة`);
        fetchAllData();
      }
    } catch (e) {
      showToast('فشل تحديث حالة الزيارة');
    }
  };

  // Create Store
  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/stores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storeForm),
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.message);
        setNewStoreModal(false);
        fetchAllData();
      }
    } catch (e) {
      showToast('حدث خطأ في حفظ المحل');
    }
  };

  return (
    <div className="flex h-screen bg-[#f4f6f8] text-slate-900 font-cairo overflow-hidden relative">
      {/* ========================================================= */}
      {/* MOBILE DRAWER BACKDROP (Only active on mobile when open)  */}
      {/* ========================================================= */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ========================================================= */}
      {/* SIDEBAR NAVIGATION (Slide-over drawer on mobile, static on desktop) */}
      {/* ========================================================= */}
      <aside
        className={`
          fixed inset-y-0 right-0 z-50 w-72 max-w-[85vw] bg-gradient-to-b from-[#0a3325] via-[#0E4D38] to-[#07241a] text-white border-l-4 border-[#D4AF37] flex flex-col justify-between p-4 shadow-2xl select-none transition-transform duration-300 ease-in-out
          lg:static lg:w-64 lg:translate-x-0 lg:z-auto lg:shrink-0
          ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col gap-5 overflow-y-auto">
          {/* Brand Logo & Close Button */}
          <div className="flex items-center justify-between px-1 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-[#D4AF37] flex items-center justify-center font-bold text-[#D4AF37] shadow-gold-glow shrink-0">
                <Flame className="w-6 h-6 fill-current text-[#D4AF37]" />
              </div>
              <div>
                <h1 className="text-sm font-black text-white leading-tight">برنامج الفحم لفادي</h1>
                <p className="text-[10px] text-[#D4AF37] font-bold">لوحة الإدارة والتحكم (Enterprise)</p>
              </div>
            </div>

            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition active:scale-95 cursor-pointer"
              title="إغلاق القائمة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links with auto-close on mobile */}
          <nav className="flex flex-col gap-1.5">
            <button
              onClick={() => { setCurrentTab('fleet'); setMobileMenuOpen(false); }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs transition ${
                currentTab === 'fleet'
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#b89628] text-slate-950 font-black shadow-md'
                  : 'text-white/80 hover:bg-white/10 hover:text-white font-bold'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>لوحة التتبع المباشر للأسطول</span>
            </button>

            <button
              onClick={() => { setCurrentTab('planner'); setMobileMenuOpen(false); }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs transition ${
                currentTab === 'planner'
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#b89628] text-slate-950 font-black shadow-md'
                  : 'text-white/80 hover:bg-white/10 hover:text-white font-bold'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>مخطط المسارات الأسبوعي</span>
            </button>

            <button
              onClick={() => { setCurrentTab('audit'); setMobileMenuOpen(false); }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs transition ${
                currentTab === 'audit'
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#b89628] text-slate-950 font-black shadow-md'
                  : 'text-white/80 hover:bg-white/10 hover:text-white font-bold'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              <span>تدقيق الزيارات ومعرض الصور</span>
            </button>

            <button
              onClick={() => { setCurrentTab('conflicts'); setMobileMenuOpen(false); }}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs transition ${
                currentTab === 'conflicts'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-white/80 hover:bg-white/10 hover:text-white font-bold'
              }`}
            >
              <span className="flex items-center gap-3">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>مركز تنبيهات التداخل (48h)</span>
              </span>
              {conflicts.length > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {conflicts.length}
                </span>
              )}
            </button>

            <button
              onClick={() => { setCurrentTab('skips'); setMobileMenuOpen(false); }}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs transition ${
                currentTab === 'skips'
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#b89628] text-slate-950 font-black shadow-md'
                  : 'text-white/80 hover:bg-white/10 hover:text-white font-bold'
              }`}
            >
              <span className="flex items-center gap-3">
                <ArrowRight className="w-4 h-4 text-rose-400" />
                <span>سجل التخطي الميداني</span>
              </span>
              {skips.length > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {skips.length}
                </span>
              )}
            </button>

            <button
              onClick={() => { setCurrentTab('stores'); setMobileMenuOpen(false); }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs transition ${
                currentTab === 'stores'
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#b89628] text-slate-950 font-black shadow-md'
                  : 'text-white/80 hover:bg-white/10 hover:text-white font-bold'
              }`}
            >
              <Store className="w-4 h-4" />
              <span>إدارة المحلات والمناطق</span>
            </button>

            <button
              onClick={() => { setCurrentTab('eod'); setMobileMenuOpen(false); }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs transition ${
                currentTab === 'eod'
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#b89628] text-slate-950 font-black shadow-md'
                  : 'text-white/80 hover:bg-white/10 hover:text-white font-bold'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>تقرير نهاية اليوم الإحصائي</span>
            </button>
          </nav>
        </div>

        {/* User Profile & Role Switcher */}
        <div className="bg-black/25 border border-white/15 rounded-2xl p-3 flex flex-col gap-2 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-700 border border-[#D4AF37] flex items-center justify-center font-bold text-xs text-[#D4AF37]">
                👑
              </div>
              <div>
                <span className="text-xs font-bold block text-white">فادي المدير</span>
                <span className="text-[10px] text-slate-400 block">مشرف عام الأسطول</span>
              </div>
            </div>
          </div>

          <div className="flex gap-1 text-[10px] font-bold bg-black/30 p-1 rounded-lg border border-white/10">
            <button
              onClick={() => setCurrentRole('ADMIN')}
              className={`flex-1 py-1 rounded transition ${
                currentRole === 'ADMIN' ? 'bg-[#D4AF37] text-slate-950 font-black' : 'text-white/70 hover:text-white'
              }`}
            >
              مدير نظام
            </button>
            <button
              onClick={() => setCurrentRole('SUPERVISOR')}
              className={`flex-1 py-1 rounded transition ${
                currentRole === 'SUPERVISOR' ? 'bg-[#D4AF37] text-slate-950 font-black' : 'text-white/70 hover:text-white'
              }`}
            >
              مشرف ميداني
            </button>
          </div>
        </div>
      </aside>

      {/* ========================================================= */}
      {/* MAIN CONTENT AREA                                         */}
      {/* ========================================================= */}
      <main className="flex-1 flex flex-col overflow-y-auto bg-[#f4f6f8] text-slate-900 min-w-0 w-full pb-20 lg:pb-6">
        {/* Top Executive Stats Bar & Responsive Navbar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#edf1f3] px-3 sm:px-6 py-2.5 sm:py-3 flex flex-col gap-2 shadow-xs">
          {/* Row 1: Brand, Current View, Mobile Hamburger Toggle & Actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {/* Mobile Hamburger Toggle Button */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden w-9 h-9 rounded-xl bg-[#0E4D38] text-[#D4AF37] border border-[#D4AF37] flex items-center justify-center shadow-xs active:scale-95 cursor-pointer shrink-0"
                title="فتح القائمة الجانبية الكاملة"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#0E4D38] text-[#D4AF37] flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                  🔥
                </div>
                <div className="min-w-0">
                  <h1 className="text-xs sm:text-sm font-black text-[#0E4D38] leading-tight truncate">فادي الفهد</h1>
                  <span className="text-[10px] text-slate-500 font-bold block truncate">
                    {currentTab === 'fleet' && '🧭 تتبع الأسطول'}
                    {currentTab === 'planner' && '⏰ مخطط المسارات'}
                    {currentTab === 'audit' && '📸 تدقيق الزيارات'}
                    {currentTab === 'conflicts' && '🛡️ تنبيهات التداخل'}
                    {currentTab === 'skips' && '➡️ سجل التخطي'}
                    {currentTab === 'stores' && '🏬 إدارة المحلات'}
                    {currentTab === 'eod' && '📊 تقرير اليوم'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions (Mobile App Link & Data Refresh) */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <a
                href="https://fadi-charcoal-app.web.app"
                target="_blank"
                rel="noreferrer"
                className="bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-1.5 transition active:scale-95"
                title="فتح تطبيق الموبايل PWA"
              >
                <Smartphone className="w-3.5 h-3.5 text-sky-600" />
                <span className="hidden xs:inline">الموبايل</span>
              </a>

              <button
                onClick={fetchAllData}
                className="bg-[#f0f7f3] hover:bg-[#dff0e6] text-[#0E4D38] p-2 rounded-xl border border-[#c2e2d4] transition shadow-2xs active:scale-95 cursor-pointer"
                title="تحديث البيانات"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Row 2: Responsive Navbar Tab Chips (Scrollable Horizontally on Mobile, Flex on Desktop) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-t border-slate-100 pt-1.5">
            <button
              onClick={() => setCurrentTab('fleet')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shrink-0 transition active:scale-95 cursor-pointer ${
                currentTab === 'fleet'
                  ? 'bg-[#0E4D38] text-[#D4AF37] font-black border border-[#D4AF37] shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-[#f0f7f3] border border-slate-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>تتبع الأسطول</span>
            </button>

            <button
              onClick={() => setCurrentTab('planner')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shrink-0 transition active:scale-95 cursor-pointer ${
                currentTab === 'planner'
                  ? 'bg-[#0E4D38] text-[#D4AF37] font-black border border-[#D4AF37] shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-[#f0f7f3] border border-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>مخطط المسارات</span>
            </button>

            <button
              onClick={() => setCurrentTab('audit')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shrink-0 transition active:scale-95 cursor-pointer ${
                currentTab === 'audit'
                  ? 'bg-[#0E4D38] text-[#D4AF37] font-black border border-[#D4AF37] shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-[#f0f7f3] border border-slate-200'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>تدقيق الزيارات</span>
            </button>

            <button
              onClick={() => setCurrentTab('conflicts')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shrink-0 transition active:scale-95 cursor-pointer ${
                currentTab === 'conflicts'
                  ? 'bg-rose-600 text-white font-black border border-rose-700 shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-rose-50 border border-slate-200'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
              <span>التداخل</span>
              {conflicts.length > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                  {conflicts.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setCurrentTab('skips')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shrink-0 transition active:scale-95 cursor-pointer ${
                currentTab === 'skips'
                  ? 'bg-[#0E4D38] text-[#D4AF37] font-black border border-[#D4AF37] shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-[#f0f7f3] border border-slate-200'
              }`}
            >
              <ArrowRight className="w-3.5 h-3.5 text-rose-500" />
              <span>سجل التخطي</span>
              {skips.length > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full">
                  {skips.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setCurrentTab('stores')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shrink-0 transition active:scale-95 cursor-pointer ${
                currentTab === 'stores'
                  ? 'bg-[#0E4D38] text-[#D4AF37] font-black border border-[#D4AF37] shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-[#f0f7f3] border border-slate-200'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>المحلات</span>
            </button>

            <button
              onClick={() => setCurrentTab('eod')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shrink-0 transition active:scale-95 cursor-pointer ${
                currentTab === 'eod'
                  ? 'bg-[#0E4D38] text-[#D4AF37] font-black border border-[#D4AF37] shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-[#f0f7f3] border border-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>تقرير اليوم</span>
            </button>
          </div>

          {/* Row 3: 5 Luxury KPI Cards (Horizontal Scroll on Mobile, Flex on Desktop) */}
          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 scrollbar-none">
            <div className="bg-[#f8faf9] border border-[#e2e8f0] px-3 py-1.5 rounded-xl shrink-0 shadow-2xs text-center min-w-[95px]">
              <span className="text-[10px] font-bold text-slate-500 block">نقاط البيع</span>
              <div className="text-sm font-black text-[#0E4D38]">{stats?.totalStores || 15} محل</div>
            </div>

            <div className="bg-[#f8faf9] border border-[#e2e8f0] px-3 py-1.5 rounded-xl shrink-0 shadow-2xs text-center min-w-[125px]">
              <span className="text-[10px] font-bold text-slate-500 block">المحطات المنجزة اليوم</span>
              <div className="text-sm font-black text-[#0E4D38]">
                {stats?.completedStops || 0} من {stats?.plannedStops || 10}
              </div>
            </div>

            <div className="bg-[#f8faf9] border border-[#e2e8f0] px-3 py-1.5 rounded-xl shrink-0 shadow-2xs text-center min-w-[110px]">
              <span className="text-[10px] font-bold text-slate-500 block">أكياس الفحم المبيعة</span>
              <div className="text-sm font-black text-[#b89628]">{stats?.totalBagsSold || 0} كيس</div>
            </div>

            <div className="bg-[#f8faf9] border border-[#e2e8f0] px-3 py-1.5 rounded-xl shrink-0 shadow-2xs text-center min-w-[115px]">
              <span className="text-[10px] font-bold text-slate-500 block">المقبوضات النقدية</span>
              <div className="text-sm font-black text-[#0E4D38]">
                {(stats?.totalCashCollected || 0).toLocaleString()} د.ع
              </div>
            </div>

            <div className="bg-[#f8faf9] border border-[#e2e8f0] px-3 py-1.5 rounded-xl shrink-0 shadow-2xs text-center min-w-[100px]">
              <span className="text-[10px] font-bold text-slate-500 block">انضباط الـ GPS</span>
              <div className="text-sm font-black text-emerald-600">{stats?.complianceRate || 100}%</div>
            </div>
          </div>
        </header>

        {/* Tab Content Body */}
        <div className="p-3 sm:p-5 lg:p-6 flex-1 min-w-0">
          {/* ========================================================= */}
          {/* SCREEN 1: LIVE FLEET MAP                                  */}
          {/* ========================================================= */}
          {currentTab === 'fleet' && (
            <div className="flex flex-col gap-4 h-full">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-[#0E4D38]">لوحة التتبع المباشر لأسطول توزيع الفحم</h2>
                  <p className="text-xs font-bold text-slate-500">
                    متابعة حركة المندوبين، المحطات المنجزة، المحطة الحالية النشطة، ومحطات الطوارئ
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-xs font-bold text-slate-500 shrink-0">فلترة المندوب:</span>
                  <select
                    value={selectedRepFilter}
                    onChange={(e) => setSelectedRepFilter(e.target.value)}
                    className="bg-slate-900 border border-[#edf1f3] text-xs font-bold text-white rounded-xl px-3 py-1.5 outline-none flex-1 sm:flex-none"
                  >
                    <option value="">جميع المندوبين</option>
                    {reps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Map Legend */}
              <div className="flex items-center gap-2 sm:gap-4 bg-slate-900/90 text-white border border-[#edf1f3] px-3 sm:px-4 py-2 rounded-xl text-xs flex-wrap">
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> مكتملة
                </span>
                <span className="flex items-center gap-1.5 text-amber-400 font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" /> المحطة النشطة
                </span>
                <span className="flex items-center gap-1.5 text-purple-400 font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> محطة طارئة
                </span>
                <span className="flex items-center gap-1.5 text-slate-400 font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500" /> بانتظار الزيارة
                </span>
              </div>

              {/* Leaflet Map Div */}
              <div
                ref={mapRef}
                className="w-full h-[360px] sm:h-[480px] lg:h-[550px] rounded-2xl border border-[#edf1f3] overflow-hidden shadow-xl z-10"
              />
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN 2: WEEKLY ROUTE PLANNER                            */}
          {/* ========================================================= */}
          {currentTab === 'planner' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-[#0E4D38]">مخطط المسارات الأسبوعي</h2>
                  <p className="text-xs font-bold text-slate-500">
                    جدولة المحلات حسب المناطق الجغرافية، وترتيب المسار الأقرب هندسياً
                  </p>
                </div>
              </div>

              {liveFleet.map((rep) => {
                const route = rep.routes?.[0];
                return (
                  <div key={rep.id} className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm p-3.5 sm:p-5 shadow-xl">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#edf1f3]">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center font-bold text-base shrink-0">
                          {rep.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-slate-900">{rep.name}</h3>
                          <p className="text-xs font-bold text-slate-500">
                            خط سير: <b className="text-amber-600">{route?.dayName || 'الأحد'}</b> ({route?.date || 'اليوم'})
                          </p>
                        </div>
                      </div>

                      {route && (
                        <button
                          onClick={() => handleOptimizeRoute(route.id)}
                          className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-3.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-blue-600/20 transition active:scale-95 w-full sm:w-auto justify-center"
                        >
                          <ArrowUpDown className="w-3.5 h-3.5" />
                          <span>ترتيب المسار الأقرب جغرافياً (Optimize)</span>
                        </button>
                      )}
                    </div>

                    {/* Stops sequence */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {route?.stops?.map((stop: any, idx: number) => (
                        <div
                          key={stop.id}
                          className="bg-[#f8faf9] border border-[#e2e8f0] rounded-xl shadow-2xs p-3 flex flex-col justify-between text-xs"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <span className="font-bold text-slate-900 block">{stop.store.name}</span>
                              <span className="text-[11px] text-slate-400">
                                مسؤول المحل: {stop.store.ownerName || 'غير مسجل'}
                              </span>
                            </div>
                            <span className="bg-blue-500/15 text-blue-400 border border-blue-500/30 font-bold px-2 py-0.5 rounded-full text-[10px]">
                              📍 {stop.store.zone?.name || 'الكرادة'}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-[#edf1f3]">
                            <span className="text-slate-400 font-mono">تسلسل #{idx + 1}</span>
                            <span
                              className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                                stop.status === 'VISITED'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : stop.status === 'CURRENT'
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {stop.status === 'VISITED' ? 'مكتملة ✅' : stop.status === 'CURRENT' ? 'حالية ⏳' : 'متبقية'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN 3: VISITS AUDIT & PHOTO FEED                       */}
          {/* ========================================================= */}
          {currentTab === 'audit' && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-black text-[#0E4D38]">تدقيق الزيارات ومعرض الصور الحي</h2>
                <p className="text-xs font-bold text-slate-500">
                  فحص واجهات المحلات المصورة، تدقيق دقة الـ GPS، والتحقق المالي من أكياس الفحم والنقدية
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {visitsFeed.map((visit) => {
                  const isFar = visit.isOutOfRange;
                  return (
                    <div
                      key={visit.id}
                      className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm overflow-hidden shadow-xl flex flex-col justify-between"
                    >
                      {/* Photo Header */}
                      <div className="relative h-48 bg-slate-950 flex items-center justify-center">
                        {visit.photoUrl ? (
                          <img
                            src={visit.photoUrl.startsWith('http') ? visit.photoUrl : `http://localhost:5000${visit.photoUrl}`}
                            alt="Storefront"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-slate-600 flex flex-col items-center">
                            <ImageIcon className="w-8 h-8 mb-1" />
                            <span className="text-xs">لم يتم التقاط صورة</span>
                          </div>
                        )}

                        {/* GPS Accuracy Badge */}
                        <div className="absolute top-2 right-2">
                          {isFar ? (
                            <span className="bg-rose-600/90 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow flex items-center gap-1">
                              ⚠️ بعيد عن المحل ({visit.distanceMeters} م)
                            </span>
                          ) : (
                            <span className="bg-emerald-600/90 text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow flex items-center gap-1">
                              ✓ دقة GPS مطابقة ({visit.distanceMeters} م)
                            </span>
                          )}
                        </div>

                        {/* Status Badge */}
                        <div className="absolute top-2 left-2">
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                              visit.status === 'APPROVED'
                                ? 'bg-emerald-500 text-slate-950'
                                : visit.status === 'REJECTED'
                                ? 'bg-rose-600 text-white'
                                : 'bg-amber-500 text-slate-950'
                            }`}
                          >
                            {visit.status === 'APPROVED' ? 'معتمدة' : visit.status === 'REJECTED' ? 'مرفوضة' : 'قيد التدقيق'}
                          </span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-4 flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                          <h3 className="font-black text-slate-900 text-sm">{visit.store.name}</h3>
                          <span className="bg-[#f0f7f3] text-[#0E4D38] border border-[#c2e2d4] text-[10px] font-bold px-2 py-0.5 rounded-full">
                            📍 {visit.store.zone?.name || 'بغداد'}
                          </span>
                        </div>

                        <p className="text-xs font-bold text-slate-500">
                          المندوب: <b className="text-slate-800">{visit.rep.name}</b> |{' '}
                          {new Date(visit.createdAt).toLocaleTimeString('ar-IQ')}
                        </p>

                        <div className="grid grid-cols-2 gap-2 bg-[#f8faf9] p-2.5 rounded-xl border border-slate-200 text-xs">
                          <div>
                            <span className="text-slate-500 block text-[11px] font-bold">أكياس الفحم:</span>
                            <span className="font-black text-[#b89628]">{visit.charcoalBags} كيس</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[11px] font-bold">المبلغ المستلم:</span>
                            <span className="font-black text-[#0E4D38]">
                              {visit.cashCollected.toLocaleString()} د.ع
                            </span>
                          </div>
                        </div>

                        {visit.notes && (
                          <p className="text-xs text-slate-700 bg-amber-50/70 border border-amber-200 p-2 rounded-lg italic">
                            "{visit.notes}"
                          </p>
                        )}

                        {/* Action buttons */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                          <button
                            onClick={() => handleApproveVisit(visit.id, 'APPROVED')}
                            className="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" /> اعتماد الزيارة
                          </button>
                          <button
                            onClick={() => handleApproveVisit(visit.id, 'REJECTED')}
                            className="bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" /> رفض ومساءلة
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN 4: CONFLICT & OVERLAP CENTER (48h)                 */}
          {/* ========================================================= */}
          {currentTab === 'conflicts' && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-black text-rose-400 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5" />
                  مركز تنبيهات تداخل زيارات المندوبين (Conflict Center)
                </h2>
                <p className="text-xs font-bold text-slate-500">
                  سجل المحلات التي قام أكثر من مندوب بزيارتها خلال 48 ساعة وأسباب الاستثناء المقدمة
                </p>
              </div>

              <div className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto w-full">
                  <table className="w-full min-w-[750px] text-right text-xs">
                    <thead className="bg-[#0E4D38] text-white">
                      <tr>
                        <th className="p-3 font-black">#</th>
                        <th className="p-3 font-black">اسم المحل والمنطقة</th>
                        <th className="p-3 font-black">المندوب الحالي</th>
                        <th className="p-3 font-black">المندوب السابق (خلال 48h)</th>
                        <th className="p-3 font-black">تاريخ الزيارة السابقة</th>
                        <th className="p-3 font-black">سبب الاستثناء المسجل</th>
                        <th className="p-3 font-black">تاريخ التوثيق</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {conflicts.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                            لا توجد أي حالات تداخل مسجلة حالياً
                          </td>
                        </tr>
                      ) : (
                        conflicts.map((c, idx) => (
                          <tr key={c.id} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-mono font-bold text-slate-500">{idx + 1}</td>
                            <td className="p-3">
                              <span className="font-black text-slate-900 block">{c.store.name}</span>
                              <span className="text-[11px] text-[#0E4D38] font-bold">📍 {c.store.zone?.name || 'بغداد'}</span>
                            </td>
                            <td className="p-3 font-bold text-amber-700">{c.rep.name}</td>
                            <td className="p-3 font-bold text-rose-600">{c.priorRep.name}</td>
                            <td className="p-3 text-slate-500 font-medium">
                              {new Date(c.priorVisitDate).toLocaleString('ar-IQ')}
                            </td>
                            <td className="p-3">
                              <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-full font-bold">
                                {c.overrideReason}
                              </span>
                            </td>
                            <td className="p-3 text-slate-500 font-medium">
                              {new Date(c.createdAt).toLocaleDateString('ar-IQ')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN 5: STORES & ZONES CRUD                             */}
          {/* ========================================================= */}
          {currentTab === 'stores' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-[#0E4D38]">إدارة المحلات والمناطق الجغرافية</h2>
                  <p className="text-xs font-bold text-slate-500">
                    إضافة وتعديل نقاط البيع في مناطق بغداد وضبط الديون ونوع الفحم المفضل
                  </p>
                </div>

                <button
                  onClick={() => setNewStoreModal(true)}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition"
                >
                  <Plus className="w-4 h-4" /> إضافة محل جديد
                </button>
              </div>

              <div className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto w-full">
                  <table className="w-full min-w-[950px] text-right text-xs">
                    <thead className="bg-[#0E4D38] text-white">
                      <tr>
                        <th className="p-3 font-black">#</th>
                        <th className="p-3 font-black">اسم المحل</th>
                        <th className="p-3 font-black">المنطقة</th>
                        <th className="p-3 font-black">المسؤول والهاتف</th>
                        <th className="p-3 font-black">المندوب المتعاقد</th>
                        <th className="p-3 font-black">دورة التكرار (Admin Only)</th>
                        <th className="p-3 font-black">الزيارة القادمة</th>
                        <th className="p-3 font-black">الديون المستحقة</th>
                        <th className="p-3 font-black">نوع الفحم المفضل</th>
                        <th className="p-3 font-black">الإحداثيات GPS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {stores.map((s, idx) => (
                        <tr key={s.id} className="hover:bg-slate-50 transition">
                          <td className="p-3 font-mono font-bold text-slate-500">{idx + 1}</td>
                          <td className="p-3 font-black text-slate-900">{s.name}</td>
                          <td className="p-3">
                            <span className="bg-[#f0f7f3] text-[#0E4D38] border border-[#c2e2d4] font-bold px-2.5 py-0.5 rounded-full text-[10px]">
                              📍 {s.zone?.name || 'بغداد'}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-slate-900 font-bold block">{s.ownerName || '-'}</span>
                            <span className="text-slate-500 font-mono text-[11px]">{s.phone || '-'}</span>
                          </td>
                          <td className="p-3 font-bold text-sky-700">
                            {s.contractedRep?.name || 'غير محدد'}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col gap-1.5 min-w-[135px]">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={1}
                                  max={365}
                                  defaultValue={s.revisitCycleDays || 14}
                                  id={`cycle-input-${s.id}`}
                                  className="w-14 bg-white border border-[#c2e2d4] text-[#0E4D38] font-black px-1.5 py-1 rounded-lg text-xs text-center focus:ring-2 focus:ring-[#0E4D38] shadow-2xs"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const val = Number((e.target as HTMLInputElement).value);
                                      if (val > 0) handleUpdateCycle(s.id, val);
                                    }
                                  }}
                                />
                                <span className="text-[11px] font-bold text-slate-600">يوم</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const input = document.getElementById(`cycle-input-${s.id}`) as HTMLInputElement;
                                    if (input && Number(input.value) > 0) {
                                      handleUpdateCycle(s.id, Number(input.value));
                                    }
                                  }}
                                  className="bg-[#0E4D38] hover:bg-[#0a3325] text-[#D4AF37] px-2 py-1 rounded-lg text-[10px] font-black border border-[#D4AF37] transition active:scale-95 shadow-2xs cursor-pointer"
                                  title="حفظ عدد الأيام المخصص"
                                >
                                  حفظ 💾
                                </button>
                              </div>
                              {/* Fast Presets: 4, 7, 14, 20, 30 days */}
                              <div className="flex items-center gap-1 flex-wrap">
                                {[4, 7, 14, 20, 30].map((d) => (
                                  <button
                                    key={d}
                                    type="button"
                                    onClick={() => handleUpdateCycle(s.id, d)}
                                    className={`text-[9px] px-1.5 py-0.5 rounded font-black border transition cursor-pointer ${
                                      (s.revisitCycleDays || 14) === d
                                        ? 'bg-[#0E4D38] text-white border-[#D4AF37]'
                                        : 'bg-[#f0f7f3] text-slate-700 hover:bg-[#c2e2d4] border-slate-300'
                                    }`}
                                    title={`تعيين كل ${d} أيام`}
                                  >
                                    {d}ي
                                  </button>
                                ))}
                              </div>
                            </div>
                          </td>
                          <td className="p-3 font-bold text-emerald-700 font-mono">
                            {s.nextVisitDate ? new Date(s.nextVisitDate).toLocaleDateString('ar-IQ') : 'اليوم'}
                          </td>
                          <td className="p-3 font-bold text-rose-600">
                            {s.debt > 0 ? `${s.debt.toLocaleString()} د.ع` : 'لا يوجد'}
                          </td>
                          <td className="p-3 text-amber-700 font-bold">{s.preferredCharcoal}</td>
                          <td className="p-3 font-mono text-slate-500 text-[10px]">
                            {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN 5.5: SKIPS AUDIT FEED                              */}
          {/* ========================================================= */}
          {currentTab === 'skips' && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-black text-rose-400 flex items-center gap-2">
                  <ArrowRight className="w-5 h-5" />
                  سجل التخطي الميداني (Skipped Stops Feed)
                </h2>
                <p className="text-xs font-bold text-slate-500">
                  المحطات التي قام المناديب بتخطيها مع الأسباب وبقائها باللون الأحمر 🔴
                </p>
              </div>

              <div className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto w-full">
                  <table className="w-full min-w-[750px] text-right text-xs">
                    <thead className="bg-[#0E4D38] text-white">
                      <tr>
                        <th className="p-3 font-black">#</th>
                        <th className="p-3 font-black">اسم المحل والمنطقة</th>
                        <th className="p-3 font-black">المندوب</th>
                        <th className="p-3 font-black">سبب التخطي</th>
                        <th className="p-3 font-black">تاريخ ووقت التخطي</th>
                        <th className="p-3 font-black">حالة المحطة في المسار</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {skips.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400 font-bold">
                            لا توجد أي محطات متخطاة مسجلة حالياً
                          </td>
                        </tr>
                      ) : (
                        skips.map((sk, idx) => (
                          <tr key={sk.id} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-mono font-bold text-slate-500">{idx + 1}</td>
                            <td className="p-3">
                              <span className="font-black text-slate-900 block">{sk.store.name}</span>
                              <span className="text-[11px] text-[#0E4D38] font-bold">📍 {sk.store.zone?.name || 'بغداد'}</span>
                            </td>
                            <td className="p-3 font-bold text-amber-700">{sk.route?.rep?.name || '-'}</td>
                            <td className="p-3">
                              <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-full font-bold">
                                {sk.skipReason || 'طلب تأجيل'}
                              </span>
                            </td>
                            <td className="p-3 text-slate-500 font-mono font-medium">
                              {sk.skippedAt ? new Date(sk.skippedAt).toLocaleString('ar-IQ') : '-'}
                            </td>
                            <td className="p-3">
                              <span className="text-rose-600 font-black flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                منقول للنهاية (أحمر 🔴)
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN 6: END-OF-DAY REPORT                               */}
          {/* ========================================================= */}
          {currentTab === 'eod' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-[#0E4D38]">تقرير نهاية اليوم الإحصائي (End-of-Day)</h2>
                  <p className="text-xs font-bold text-slate-500">
                    مقارنة المخطط بالفعلي، إجمالي مبيعات الفحم، المقبوضات النقدية، والمحطات الطارئة
                  </p>
                </div>

                <button
                  onClick={() => window.print()}
                  className="bg-[#0E4D38] hover:bg-[#0a3325] text-[#D4AF37] font-black py-2 px-3.5 rounded-xl text-xs flex items-center gap-1.5 border border-[#D4AF37] transition shadow-xs cursor-pointer active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" /> طباعة / تصدير التقرير
                </button>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm p-4">
                  <span className="text-xs font-bold text-slate-500 block mb-1">نسبة إنجاز خط السير</span>
                  <div className="text-2xl font-black text-[#0E4D38]">
                    {stats?.plannedStops > 0
                      ? Math.round((stats.completedStops / stats.plannedStops) * 100)
                      : 0}
                    %
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    {stats?.completedStops} زيارة من أصل {stats?.plannedStops} مخطط لها
                  </span>
                </div>

                <div className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm p-4">
                  <span className="text-xs font-bold text-slate-500 block mb-1">المحطات الطارئة (Ad-Hoc)</span>
                  <div className="text-2xl font-black text-purple-700">{stats?.adHocStops || 0}</div>
                  <span className="text-[11px] text-slate-500 mt-1 block">محطات أضيفت ميدانياً خارج الجدول</span>
                </div>

                <div className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm p-4">
                  <span className="text-xs font-bold text-slate-500 block mb-1">مبيعات أكياس الفحم</span>
                  <div className="text-2xl font-black text-[#b89628]">{stats?.totalBagsSold || 0} كيس</div>
                  <span className="text-[11px] text-slate-500 mt-1 block">شيشة ليمون + مشاوي خشن</span>
                </div>

                <div className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm p-4">
                  <span className="text-xs font-bold text-slate-500 block mb-1">إجمالي النقدية المقبوضة</span>
                  <div className="text-2xl font-black text-[#0E4D38]">
                    {(stats?.totalCashCollected || 0).toLocaleString()} د.ع
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">تم تسديدها لصندوق الشركة</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ========================================================= */}
      {/* MODAL: ADD STORE WITH ZONE                                */}
      {/* ========================================================= */}
      {newStoreModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateStore}
            className="bg-white border border-[#c2e2d4] rounded-2xl shadow-2xl p-5 sm:p-6 max-w-md w-full flex flex-col gap-3.5"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-[#0E4D38]">إضافة نقطة بيع جديدة إلى الخريطة</h3>
              <button
                type="button"
                onClick={() => setNewStoreModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">اسم المحل *</label>
              <input
                type="text"
                required
                value={storeForm.name}
                onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                className="w-full bg-[#f8faf9] border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-[#0E4D38]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">المنطقة (إلزامي) *</label>
                <select
                  value={storeForm.zoneId}
                  onChange={(e) => setStoreForm({ ...storeForm, zoneId: Number(e.target.value) })}
                  className="w-full bg-[#f8faf9] border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-[#0E4D38]"
                >
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">اليوم الدوري *</label>
                <select
                  value={storeForm.assignedDay}
                  onChange={(e) => setStoreForm({ ...storeForm, assignedDay: e.target.value })}
                  className="w-full bg-[#f8faf9] border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-[#0E4D38]"
                >
                  <option value="Sunday">الأحد</option>
                  <option value="Monday">الإثنين</option>
                  <option value="Tuesday">الثلاثاء</option>
                  <option value="Wednesday">الأربعاء</option>
                  <option value="Thursday">الخميس</option>
                  <option value="Friday">الجمعة</option>
                  <option value="Saturday">السبت</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">اسم المسؤول</label>
                <input
                  type="text"
                  value={storeForm.ownerName}
                  onChange={(e) => setStoreForm({ ...storeForm, ownerName: e.target.value })}
                  className="w-full bg-[#f8faf9] border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-[#0E4D38]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">رقم الهاتف</label>
                <input
                  type="text"
                  value={storeForm.phone}
                  onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })}
                  className="w-full bg-[#f8faf9] border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-[#0E4D38]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">خط العرض (Latitude)</label>
                <input
                  type="number"
                  step="any"
                  value={storeForm.latitude}
                  onChange={(e) => setStoreForm({ ...storeForm, latitude: parseFloat(e.target.value) })}
                  className="w-full bg-[#f8faf9] border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none font-mono focus:ring-2 focus:ring-[#0E4D38]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">خط الطول (Longitude)</label>
                <input
                  type="number"
                  step="any"
                  value={storeForm.longitude}
                  onChange={(e) => setStoreForm({ ...storeForm, longitude: parseFloat(e.target.value) })}
                  className="w-full bg-[#f8faf9] border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 outline-none font-mono focus:ring-2 focus:ring-[#0E4D38]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setNewStoreModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="bg-[#0E4D38] hover:bg-[#0a3325] text-[#D4AF37] px-5 py-2 rounded-xl text-xs font-black border border-[#D4AF37] shadow-sm transition active:scale-95 cursor-pointer"
              >
                تأكيد وحفظ المحل
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================= */}
      {/* MOBILE BOTTOM NAVIGATION BAR                              */}
      {/* ========================================================= */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 py-1.5 px-3 flex items-center justify-around shadow-2xl safe-area-pb">
        <button
          onClick={() => setCurrentTab('fleet')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition ${
            currentTab === 'fleet' ? 'text-[#0E4D38] font-black scale-105' : 'text-slate-500 font-bold'
          }`}
        >
          <Compass className={`w-5 h-5 ${currentTab === 'fleet' ? 'text-[#0E4D38]' : 'text-slate-400'}`} />
          <span className="text-[10px]">الأسطول</span>
        </button>

        <button
          onClick={() => setCurrentTab('planner')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition ${
            currentTab === 'planner' ? 'text-[#0E4D38] font-black scale-105' : 'text-slate-500 font-bold'
          }`}
        >
          <Clock className={`w-5 h-5 ${currentTab === 'planner' ? 'text-[#0E4D38]' : 'text-slate-400'}`} />
          <span className="text-[10px]">المسارات</span>
        </button>

        <button
          onClick={() => setCurrentTab('stores')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition ${
            currentTab === 'stores' ? 'text-[#0E4D38] font-black scale-105' : 'text-slate-500 font-bold'
          }`}
        >
          <Store className={`w-5 h-5 ${currentTab === 'stores' ? 'text-[#0E4D38]' : 'text-slate-400'}`} />
          <span className="text-[10px]">المحلات</span>
        </button>

        <button
          onClick={() => setCurrentTab('audit')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition ${
            currentTab === 'audit' ? 'text-[#0E4D38] font-black scale-105' : 'text-slate-500 font-bold'
          }`}
        >
          <ImageIcon className={`w-5 h-5 ${currentTab === 'audit' ? 'text-[#0E4D38]' : 'text-slate-400'}`} />
          <span className="text-[10px]">التدقيق</span>
        </button>

        <button
          onClick={() => setMobileMenuOpen(true)}
          className="flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl text-slate-500 font-bold relative"
        >
          {(conflicts.length > 0 || skips.length > 0) && (
            <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          )}
          <Menu className="w-5 h-5 text-slate-600" />
          <span className="text-[10px]">المزيد ☰</span>
        </button>
      </nav>

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-16 lg:bottom-6 left-6 z-50 bg-slate-900 border border-amber-500/40 text-amber-300 px-4 py-2.5 rounded-xl text-xs font-bold shadow-2xl">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
