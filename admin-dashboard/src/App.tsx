import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin, Store, Navigation, ShieldAlert, CheckCircle2, XCircle,
  Clock, AlertTriangle, Users, FileText, BarChart3, Image as ImageIcon,
  Flame, Plus, Search, Filter, RefreshCw, Check, ArrowUpDown, DollarSign,
  TrendingUp, Download, Eye, Layers, Compass, ArrowRight, Calendar, Lock
} from 'lucide-react';
import L from 'leaflet';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

type TabType = 'fleet' | 'planner' | 'audit' | 'conflicts' | 'stores' | 'skips' | 'eod';

export default function AdminApp() {
  const [currentTab, setCurrentTab] = useState<TabType>('fleet');
  const [currentRole, setCurrentRole] = useState<'ADMIN' | 'SUPERVISOR'>('ADMIN');
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
    <div className="flex h-screen bg-[#f4f6f8] text-slate-900 font-cairo overflow-hidden">
      {/* ========================================================= */}
      {/* SIDEBAR NAVIGATION (RTL Layout)                          */}
      {/* ========================================================= */}
      <aside className="w-64 bg-gradient-to-b from-[#0a3325] via-[#0E4D38] to-[#07241a] text-white border-l-4 border-[#D4AF37] flex flex-col justify-between p-4 shadow-2xl select-none relative">
        <div className="flex flex-col gap-6">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md border border-[#D4AF37] flex items-center justify-center font-bold text-[#D4AF37] shadow-gold-glow">
              <Flame className="w-6 h-6 fill-current" />
            </div>
            <div>
              <h1 className="text-base font-black text-[#0E4D38] leading-tight">برنامج الفحم لفادي</h1>
              <p className="text-[11px] text-[#D4AF37] font-bold">لوحة الإدارة والتحكم (Enterprise)</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1.5">
            <button
              onClick={() => setCurrentTab('fleet')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs transition ${
                currentTab === 'fleet'
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#b89628] text-slate-950 font-black shadow-md' : 'text-white/80 hover:bg-white/10 hover:text-slate-900 font-bold'
              }`}
            >
              <Compass className="w-4 h-4" />
              لوحة التتبع المباشر للأسطول
            </button>

            <button
              onClick={() => setCurrentTab('planner')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs transition ${
                currentTab === 'planner'
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#b89628] text-slate-950 font-black shadow-md' : 'text-white/80 hover:bg-white/10 hover:text-slate-900 font-bold'
              }`}
            >
              <Clock className="w-4 h-4" />
              مخطط المسارات الأسبوعي
            </button>

            <button
              onClick={() => setCurrentTab('audit')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs transition ${
                currentTab === 'audit'
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#b89628] text-slate-950 font-black shadow-md' : 'text-white/80 hover:bg-white/10 hover:text-slate-900 font-bold'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              تدقيق الزيارات ومعرض الصور
            </button>

            <button
              onClick={() => setCurrentTab('conflicts')}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs transition ${
                currentTab === 'conflicts'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                مركز تنبيهات التداخل (48h)
              </span>
              {conflicts.length > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {conflicts.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setCurrentTab('skips')}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl font-bold text-xs transition ${
                currentTab === 'skips'
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#b89628] text-slate-950 font-black shadow-md' : 'text-white/80 hover:bg-white/10 hover:text-slate-900 font-bold'
              }`}
            >
              <span className="flex items-center gap-3">
                <ArrowRight className="w-4 h-4 text-rose-400" />
                سجل التخطي الميداني
              </span>
              {skips.length > 0 && (
                <span className="bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {skips.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setCurrentTab('stores')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs transition ${
                currentTab === 'stores'
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#b89628] text-slate-950 font-black shadow-md' : 'text-white/80 hover:bg-white/10 hover:text-slate-900 font-bold'
              }`}
            >
              <Store className="w-4 h-4" />
              إدارة المحلات والمناطق
            </button>

            <button
              onClick={() => setCurrentTab('eod')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-xs transition ${
                currentTab === 'eod'
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#b89628] text-slate-950 font-black shadow-md' : 'text-white/80 hover:bg-white/10 hover:text-slate-900 font-bold'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              تقرير نهاية اليوم الإحصائي
            </button>
          </nav>
        </div>

        {/* User Profile & Role Switcher */}
        <div className="bg-black/25 border border-white/15 rounded-2xl p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-xs">
                ف
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
      <main className="flex-1 flex flex-col overflow-y-auto bg-[#f4f6f8] text-slate-900">
        {/* Top Executive Stats Bar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#edf1f3] px-6 py-3.5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-xs font-bold text-slate-500">نقاط البيع</span>
              <div className="text-base font-black text-[#0E4D38]">{stats?.totalStores || 15} محل</div>
            </div>
            <div className="w-[1px] h-7 bg-[#edf1f3]" />
            <div>
              <span className="text-xs font-bold text-slate-500">المحطات المنجزة اليوم</span>
              <div className="text-base font-black text-[#0E4D38]">
                {stats?.completedStops || 0} من {stats?.plannedStops || 10}
              </div>
            </div>
            <div className="w-[1px] h-7 bg-[#edf1f3]" />
            <div>
              <span className="text-xs font-bold text-slate-500">أكياس الفحم المبيعة</span>
              <div className="text-base font-black text-[#b89628]">{stats?.totalBagsSold || 0} كيس</div>
            </div>
            <div className="w-[1px] h-7 bg-[#edf1f3]" />
            <div>
              <span className="text-xs font-bold text-slate-500">المقبوضات النقدية</span>
              <div className="text-base font-black text-[#0E4D38]">
                {(stats?.totalCashCollected || 0).toLocaleString()} د.ع
              </div>
            </div>
            <div className="w-[1px] h-7 bg-[#edf1f3]" />
            <div>
              <span className="text-xs font-bold text-slate-500">انضباط الـ GPS</span>
              <div className="text-base font-black text-[#0E4D38]">{stats?.complianceRate || 100}%</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchAllData}
              className="bg-[#f0f7f3] hover:bg-[#dff0e6] text-[#0E4D38] p-2 rounded-xl border border-[#c2e2d4] transition shadow-2xs"
              title="تحديث البيانات"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Tab Content Body */}
        <div className="p-6 flex-1">
          {/* ========================================================= */}
          {/* SCREEN 1: LIVE FLEET MAP                                  */}
          {/* ========================================================= */}
          {currentTab === 'fleet' && (
            <div className="flex flex-col gap-4 h-full">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-[#0E4D38]">لوحة التتبع المباشر لأسطول توزيع الفحم</h2>
                  <p className="text-xs font-bold text-slate-500">
                    متابعة حركة المندوبين، المحطات المنجزة، المحطة الحالية النشطة، ومحطات الطوارئ
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 font-bold">فلترة حسب المندوب:</span>
                  <select
                    value={selectedRepFilter}
                    onChange={(e) => setSelectedRepFilter(e.target.value)}
                    className="bg-slate-900 border border-[#edf1f3] text-xs font-bold text-white rounded-xl px-3 py-1.5 outline-none"
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
              <div className="flex items-center gap-4 bg-slate-900/60 border border-[#edf1f3] px-4 py-2 rounded-xl text-xs">
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <span className="w-3 h-3 rounded-full bg-emerald-500" /> مكتملة (تمت الزيارة)
                </span>
                <span className="flex items-center gap-1.5 text-amber-400 font-bold">
                  <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" /> المحطة الحالية النشطة
                </span>
                <span className="flex items-center gap-1.5 text-purple-400 font-bold">
                  <span className="w-3 h-3 rounded-full bg-purple-500" /> محطة طارئة (Ad-Hoc)
                </span>
                <span className="flex items-center gap-1.5 text-slate-400 font-bold">
                  <span className="w-3 h-3 rounded-full bg-slate-600" /> بانتظار الزيارة
                </span>
              </div>

              {/* Leaflet Map Div */}
              <div
                ref={mapRef}
                className="w-full flex-1 min-h-[500px] rounded-2xl border border-[#edf1f3] overflow-hidden shadow-2xl z-10"
              />
            </div>
          )}

          {/* ========================================================= */}
          {/* SCREEN 2: WEEKLY ROUTE PLANNER                            */}
          {/* ========================================================= */}
          {currentTab === 'planner' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-[#0E4D38]">مخطط المسارات الأسبوعي</h2>
                  <p className="text-xs font-bold text-slate-500">
                    جدولة المحلات حسب المناطق الجغرافية، وترتيب المسار الأقرب هندسياً
                  </p>
                </div>
              </div>

              {liveFleet.map((rep) => {
                const route = rep.routes?.[0];
                return (
                  <div key={rep.id} className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm p-5 shadow-xl">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#edf1f3]">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold">
                          {rep.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">{rep.name}</h3>
                          <p className="text-xs font-bold text-slate-500">
                            خط سير: <b className="text-amber-400">{route?.dayName || 'الأحد'}</b> ({route?.date || 'اليوم'})
                          </p>
                        </div>
                      </div>

                      {route && (
                        <button
                          onClick={() => handleOptimizeRoute(route.id)}
                          className="bg-blue-600 hover:bg-blue-500 text-slate-900 font-bold py-2 px-3 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-blue-600/20 transition"
                        >
                          <ArrowUpDown className="w-3.5 h-3.5" />
                          ترتيب المسار الأقرب جغرافياً (Optimize)
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
                          <h3 className="font-extrabold text-white text-sm">{visit.store.name}</h3>
                          <span className="bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            📍 {visit.store.zone?.name || 'بغداد'}
                          </span>
                        </div>

                        <p className="text-xs font-bold text-slate-500">
                          المندوب: <b className="text-slate-200">{visit.rep.name}</b> |{' '}
                          {new Date(visit.createdAt).toLocaleTimeString('ar-IQ')}
                        </p>

                        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-2.5 rounded-xl border border-[#edf1f3] text-xs">
                          <div>
                            <span className="text-slate-400 block text-[11px]">أكياس الفحم:</span>
                            <span className="font-bold text-amber-400">{visit.charcoalBags} كيس</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">المبلغ المستلم:</span>
                            <span className="font-bold text-emerald-400">
                              {visit.cashCollected.toLocaleString()} د.ع
                            </span>
                          </div>
                        </div>

                        {visit.notes && (
                          <p className="text-xs text-slate-300 bg-slate-800/50 p-2 rounded-lg italic">
                            "{visit.notes}"
                          </p>
                        )}

                        {/* Action buttons */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#edf1f3]">
                          <button
                            onClick={() => handleApproveVisit(visit.id, 'APPROVED')}
                            className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" /> اعتماد الزيارة
                          </button>
                          <button
                            onClick={() => handleApproveVisit(visit.id, 'REJECTED')}
                            className="bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1"
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

              <div className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm overflow-hidden shadow-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-950 text-slate-300 border-b border-[#edf1f3]">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">اسم المحل والمنطقة</th>
                      <th className="p-3">المندوب الحالي</th>
                      <th className="p-3">المندوب السابق (خلال 48h)</th>
                      <th className="p-3">تاريخ الزيارة السابقة</th>
                      <th className="p-3">سبب الاستثناء المسجل</th>
                      <th className="p-3">تاريخ التوثيق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {conflicts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-500">
                          لا توجد أي حالات تداخل مسجلة حالياً
                        </td>
                      </tr>
                    ) : (
                      conflicts.map((c, idx) => (
                        <tr key={c.id} className="hover:bg-slate-800/40 transition">
                          <td className="p-3 font-mono">{idx + 1}</td>
                          <td className="p-3">
                            <span className="font-bold text-slate-900 block">{c.store.name}</span>
                            <span className="text-[11px] text-blue-400">📍 {c.store.zone?.name || 'بغداد'}</span>
                          </td>
                          <td className="p-3 font-bold text-amber-400">{c.rep.name}</td>
                          <td className="p-3 font-bold text-rose-400">{c.priorRep.name}</td>
                          <td className="p-3 text-slate-400">
                            {new Date(c.priorVisitDate).toLocaleString('ar-IQ')}
                          </td>
                          <td className="p-3">
                            <span className="bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2.5 py-1 rounded-full font-bold">
                              {c.overrideReason}
                            </span>
                          </td>
                          <td className="p-3 text-slate-400">
                            {new Date(c.createdAt).toLocaleDateString('ar-IQ')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
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

              <div className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm overflow-hidden shadow-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-950 text-slate-300 border-b border-[#edf1f3]">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">اسم المحل</th>
                      <th className="p-3">المنطقة</th>
                      <th className="p-3">المسؤول والهاتف</th>
                      <th className="p-3">المندوب المتعاقد</th>
                      <th className="p-3">دورة التكرار (Admin Only)</th>
                      <th className="p-3">الزيارة القادمة</th>
                      <th className="p-3">الديون المستحقة</th>
                      <th className="p-3">نوع الفحم المفضل</th>
                      <th className="p-3">الإحداثيات GPS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {stores.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-slate-800/40 transition">
                        <td className="p-3 font-mono">{idx + 1}</td>
                        <td className="p-3 font-bold text-white">{s.name}</td>
                        <td className="p-3">
                          <span className="bg-blue-500/15 text-blue-400 border border-blue-500/30 font-bold px-2.5 py-0.5 rounded-full text-[10px]">
                            📍 {s.zone?.name || 'بغداد'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="text-slate-200 block">{s.ownerName || '-'}</span>
                          <span className="text-slate-400 font-mono text-[11px]">{s.phone || '-'}</span>
                        </td>
                        <td className="p-3 font-bold text-cyan-300">
                          {s.contractedRep?.name || 'غير محدد'}
                        </td>
                        <td className="p-3">
                          <select
                            value={s.revisitCycleDays || 14}
                            onChange={(e) => handleUpdateCycle(s.id, Number(e.target.value))}
                            className="bg-slate-950 border border-slate-700 text-amber-300 font-bold px-2 py-1 rounded text-xs focus:ring-1 focus:ring-amber-500"
                          >
                            <option value={7}>كل 7 أيام (أسبوعي)</option>
                            <option value={14}>كل 14 يوماً (أسبوعين)</option>
                            <option value={21}>كل 21 يوماً (3 أسابيع)</option>
                            <option value={30}>كل 30 يوماً (شهري)</option>
                          </select>
                        </td>
                        <td className="p-3 font-bold text-emerald-400 font-mono">
                          {s.nextVisitDate ? new Date(s.nextVisitDate).toLocaleDateString('ar-IQ') : 'اليوم'}
                        </td>
                        <td className="p-3 font-bold text-rose-400">
                          {s.debt > 0 ? `${s.debt.toLocaleString()} د.ع` : 'لا يوجد'}
                        </td>
                        <td className="p-3 text-amber-300">{s.preferredCharcoal}</td>
                        <td className="p-3 font-mono text-slate-400 text-[10px]">
                          {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

              <div className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm overflow-hidden shadow-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-950 text-slate-300 border-b border-[#edf1f3]">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">اسم المحل والمنطقة</th>
                      <th className="p-3">المندوب</th>
                      <th className="p-3">سبب التخطي</th>
                      <th className="p-3">تاريخ ووقت التخطي</th>
                      <th className="p-3">حالة المحطة في المسار</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {skips.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500">
                          لا توجد أي محطات متخطاة مسجلة حالياً
                        </td>
                      </tr>
                    ) : (
                      skips.map((sk, idx) => (
                        <tr key={sk.id} className="hover:bg-slate-800/40 transition">
                          <td className="p-3 font-mono">{idx + 1}</td>
                          <td className="p-3">
                            <span className="font-bold text-slate-900 block">{sk.store.name}</span>
                            <span className="text-[11px] text-blue-400">📍 {sk.store.zone?.name || 'بغداد'}</span>
                          </td>
                          <td className="p-3 font-bold text-amber-400">{sk.route?.rep?.name || '-'}</td>
                          <td className="p-3">
                            <span className="bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2.5 py-1 rounded-full font-bold">
                              {sk.skipReason || 'طلب تأجيل'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-400 font-mono">
                            {sk.skippedAt ? new Date(sk.skippedAt).toLocaleString('ar-IQ') : '-'}
                          </td>
                          <td className="p-3">
                            <span className="text-rose-400 font-black flex items-center gap-1">
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
                  className="bg-slate-800 hover:bg-slate-700 text-slate-900 font-bold py-2 px-3 rounded-xl text-xs flex items-center gap-1.5 border border-slate-700 transition"
                >
                  <Download className="w-3.5 h-3.5" /> طباعة / تصدير التقرير
                </button>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm p-4">
                  <span className="text-xs font-bold text-slate-500 block mb-1">نسبة إنجاز خط السير</span>
                  <div className="text-2xl font-black text-emerald-400">
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
                  <div className="text-2xl font-black text-purple-400">{stats?.adHocStops || 0}</div>
                  <span className="text-[11px] text-slate-500 mt-1 block">محطات أضيفت ميدانياً خارج الجدول</span>
                </div>

                <div className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm p-4">
                  <span className="text-xs font-bold text-slate-500 block mb-1">مبيعات أكياس الفحم</span>
                  <div className="text-2xl font-black text-amber-400">{stats?.totalBagsSold || 0} كيس</div>
                  <span className="text-[11px] text-slate-500 mt-1 block">شيشة ليمون + مشاوي خشن</span>
                </div>

                <div className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm p-4">
                  <span className="text-xs font-bold text-slate-500 block mb-1">إجمالي النقدية المقبوضة</span>
                  <div className="text-2xl font-black text-emerald-400">
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
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateStore}
            className="bg-white border border-[#edf1f3] rounded-2xl shadow-sm p-6 max-w-md w-full shadow-2xl flex flex-col gap-3"
          >
            <div className="flex items-center justify-between border-b border-[#edf1f3] pb-3">
              <h3 className="text-base font-extrabold text-white">إضافة نقطة بيع جديدة إلى الخريطة</h3>
              <button
                type="button"
                onClick={() => setNewStoreModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="text-xs text-slate-300 block mb-1">اسم المحل *</label>
              <input
                type="text"
                required
                value={storeForm.name}
                onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-300 block mb-1">المنطقة (إلزامي) *</label>
                <select
                  value={storeForm.zoneId}
                  onChange={(e) => setStoreForm({ ...storeForm, zoneId: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                >
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">اليوم الدوري *</label>
                <select
                  value={storeForm.assignedDay}
                  onChange={(e) => setStoreForm({ ...storeForm, assignedDay: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
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
                <label className="text-xs text-slate-300 block mb-1">اسم المسؤول</label>
                <input
                  type="text"
                  value={storeForm.ownerName}
                  onChange={(e) => setStoreForm({ ...storeForm, ownerName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">رقم الهاتف</label>
                <input
                  type="text"
                  value={storeForm.phone}
                  onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-300 block mb-1">خط العرض (Latitude)</label>
                <input
                  type="number"
                  step="any"
                  value={storeForm.latitude}
                  onChange={(e) => setStoreForm({ ...storeForm, latitude: parseFloat(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none font-mono"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">خط الطول (Longitude)</label>
                <input
                  type="number"
                  step="any"
                  value={storeForm.longitude}
                  onChange={(e) => setStoreForm({ ...storeForm, longitude: parseFloat(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#edf1f3]">
              <button
                type="button"
                onClick={() => setNewStoreModal(false)}
                className="bg-slate-800 text-slate-300 px-4 py-2 rounded-xl text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-5 py-2 rounded-xl text-xs font-black shadow-lg shadow-amber-500/20"
              >
                تأكيد وحفظ المحل
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-6 left-6 z-50 bg-slate-900 border border-amber-500/40 text-amber-300 px-4 py-2.5 rounded-xl text-xs font-bold shadow-2xl">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
