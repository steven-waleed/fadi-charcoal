import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, Phone, Navigation, Camera, CheckCircle2, AlertTriangle, 
  PlusCircle, Wifi, WifiOff, RefreshCw, Play, ChevronLeft, ArrowRight,
  Package, DollarSign, Clock, ShieldAlert, XCircle, Flame, Store, Lock,
  Calendar, Check, AlertCircle, Eye, Compass, Flag, LogIn, LogOut, User as UserIcon, KeyRound, RotateCcw,
  BarChart3, Users
} from 'lucide-react';
import L from 'leaflet';
import { db, type SyncQueueItem } from './db';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export default function App() {
  // Authentication & Session
  const [currentUser, setCurrentUser] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('fadi_charcoal_rep_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [loggingIn, setLoggingIn] = useState<boolean>(false);

  // Connection & Data
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [reps, setReps] = useState<any[]>([]);
  const selectedRepId = currentUser?.id || 0;
  const [zones, setZones] = useState<any[]>([]);
  
  // Views: 'ADMIN_OVERVIEW' (لوحة الإحصائيات) | 'ROUTE' (إظهار مساري لليوم) | 'LOCKED_MAP' (خريطة المتاجر المقفلة) | 'NEW_STORE' (تسجيل متجر جديد)
  const [activeTab, setActiveTab] = useState<'ADMIN_OVERVIEW' | 'ROUTE' | 'LOCKED_MAP' | 'NEW_STORE'>(() => {
    try {
      const saved = localStorage.getItem('fadi_charcoal_rep_user');
      const u = saved ? JSON.parse(saved) : null;
      return u?.role === 'ADMIN' ? 'ADMIN_OVERVIEW' : 'ROUTE';
    } catch {
      return 'ROUTE';
    }
  });

  // Route & Stores Data
  const [routeData, setRouteData] = useState<any>(null);
  const [lockedStores, setLockedStores] = useState<any[]>([]);
  const [adminStats, setAdminStats] = useState<any>(null);
  const [adminReps, setAdminReps] = useState<any[]>([]);
  const [inspectedRepId, setInspectedRepId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [workdayStarted, setWorkdayStarted] = useState<boolean>(true);

  // Live GPS Coordinates
  const [liveGps, setLiveGps] = useState<{ lat: number; lng: number }>({ lat: 33.3152, lng: 44.3661 });
  const [gpsAccuracy, setGpsAccuracy] = useState<number>(5);

  // Modals
  const [skipModalOpen, setSkipModalOpen] = useState<boolean>(false);
  const [skipReason, setSkipReason] = useState<string>('محل مغلق');
  const [targetStopToSkip, setTargetStopToSkip] = useState<any>(null);

  const [visitModalOpen, setVisitModalOpen] = useState<boolean>(false);
  const [targetStoreForVisit, setTargetStoreForVisit] = useState<any>(null);
  const [targetStopIdForVisit, setTargetStopIdForVisit] = useState<number | null>(null);
  const [visitNotes, setVisitNotes] = useState<string>('');
  const [optionalPhotoBase64, setOptionalPhotoBase64] = useState<string>('');

  const [completionModalOpen, setCompletionModalOpen] = useState<boolean>(false);
  const [completionSummary, setCompletionSummary] = useState<any>(null);

  // New Store Form State
  const [newStoreName, setNewStoreName] = useState<string>('');
  const [newStoreZoneId, setNewStoreZoneId] = useState<number>(6);
  const [newStoreOwner, setNewStoreOwner] = useState<string>('');
  const [newStorePhone, setNewStorePhone] = useState<string>('');
  const [newStoreCharcoal, setNewStoreCharcoal] = useState<string>('فحم شيشة درجة أولى');
  const [newStorePhotoBase64, setNewStorePhotoBase64] = useState<string>('');
  const [newStoreRevisitCycle, setNewStoreRevisitCycle] = useState<number>(14);
  const [newStoreDuplicateError, setNewStoreDuplicateError] = useState<string>('');
  const [newStoreSuccessMsg, setNewStoreSuccessMsg] = useState<string>('');

  // Toast
  const [toastMessage, setToastMessage] = useState<string>('');
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 5000);
  };

  // Map Ref
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);

  // Camera Input Refs
  const newStoreCameraRef = useRef<HTMLInputElement>(null);
  const revisitCameraRef = useRef<HTMLInputElement>(null);

  // Calculate Haversine Distance in meters
  function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371e3;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  // 1. Initial Load & GPS Watcher
  useEffect(() => {
    fetchRepsList();
    if (currentUser) {
      fetchInitialData();
      fetchLockedStores();
    }

    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setLiveGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setGpsAccuracy(Math.round(pos.coords.accuracy));
        },
        (err) => console.log('GPS error:', err.message),
        { enableHighAccuracy: true, maximumAge: 3000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [currentUser, inspectedRepId]);

  const fetchRepsList = async () => {
    try {
      const res = await fetch(`${API_BASE}/reps`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setReps(json.data.filter((r: any) => r.role === 'REP'));
      }
    } catch (e) {
      console.log('Error fetching reps:', e);
    }
  };

  // Fetch initial data
  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const isUserAdmin = currentUser?.role === 'ADMIN';
      const currentRepId = isUserAdmin ? inspectedRepId : (currentUser?.id || selectedRepId);
      
      if (isUserAdmin) {
        fetch(`${API_BASE}/admin/dashboard`)
          .then(r => r.json())
          .then(d => { if (d.success && d.stats) setAdminStats(d.stats); })
          .catch(() => {});
        fetch(`${API_BASE}/admin/reps`)
          .then(r => r.json())
          .then(d => { if (d.success && d.reps) setAdminReps(d.reps); })
          .catch(() => {});
      }
      const [zonesRes, routeRes] = await Promise.all([
        fetch(`${API_BASE}/zones`).then((r) => r.json()).catch(() => ({ success: false })),
        fetch(`${API_BASE}/routes/today?repId=${currentRepId}&lat=${liveGps.lat}&lng=${liveGps.lng}`)
          .then((r) => r.json())
          .catch(() => ({ success: false })),
      ]);

      if (zonesRes.success && Array.isArray(zonesRes.data) && zonesRes.data.length > 0) {
        setZones(zonesRes.data);
        setNewStoreZoneId((prev) => (zonesRes.data.some((z: any) => z.id === prev) ? prev : zonesRes.data[0].id));
      }
      if (routeRes.success && routeRes.hasRoute) {
        setRouteData(routeRes.route);
        setWorkdayStarted(routeRes.route.status === 'IN_PROGRESS' || routeRes.route.status === 'COMPLETED');
      }
    } catch (e) {
      console.log('Error fetching data:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchLockedStores = async () => {
    try {
      const res = await fetch(`${API_BASE}/stores/locked-map`);
      const json = await res.json();
      if (json.success) setLockedStores(json.data);
    } catch (e) {
      console.log('Error fetching locked stores:', e);
    }
  };

  // Helper: Compress phone camera images to fast lightweight JPEG using HTML Canvas
  const compressImageFile = (file: File, maxWidth = 1200, quality = 0.75): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve('');
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => resolve((e.target?.result as string) || '');
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth || height > maxWidth) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxWidth) / height);
              height = maxWidth;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve((e.target?.result as string) || '');
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = (e.target?.result as string) || '';
      };
      reader.readAsDataURL(file);
    });
  };

  // Helper: Reset all input forms and errors cleanly on logout or rep switch
  const resetAllSessionState = () => {
    setActiveTab('ROUTE');
    setNewStoreName('');
    setNewStoreOwner('');
    setNewStorePhone('');
    setNewStoreCharcoal('فحم شيشة درجة أولى');
    setNewStorePhotoBase64('');
    setNewStoreRevisitCycle(14);
    setNewStoreDuplicateError('');
    setNewStoreSuccessMsg('');
    setVisitNotes('');
    setOptionalPhotoBase64('');
    setTargetStoreForVisit(null);
    setTargetStopIdForVisit(null);
    setTargetStopToSkip(null);
    setSkipModalOpen(false);
    setVisitModalOpen(false);
    setCompletionModalOpen(false);
  };

  // Login Handler
  const handleLogin = async (usernameOverride?: string, passwordOverride?: string) => {
    setLoginError('');
    setLoggingIn(true);
    const u = usernameOverride || loginUsername;
    const p = passwordOverride || loginPassword;

    if (!u.trim() || !p.trim()) {
      setLoginError('يرجى إدخال اسم المستخدم وكلمة المرور');
      setLoggingIn(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      });
      const json = await res.json();
      if (json.success && json.user) {
        resetAllSessionState();
        setCurrentUser(json.user);
        if (json.user.role === 'ADMIN') {
          setActiveTab('ADMIN_OVERVIEW');
        } else {
          setActiveTab('ROUTE');
        }
        localStorage.setItem('fadi_charcoal_rep_user', JSON.stringify(json.user));
        showToast(json.message);
      } else {
        setLoginError(json.message || 'فشل تسجيل الدخول: تحقق من البيانات');
      }
    } catch (e) {
      setLoginError('خطأ في الاتصال بالخادم، يرجى المحاولة لاحقاً');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('fadi_charcoal_rep_user');
    setCurrentUser(null);
    setRouteData(null);
    resetAllSessionState();
    showToast('تم تسجيل الخروج بنجاح وتفريغ البيانات');
  };

  // Next Stop Calculation:
  // Strictly prioritize unvisited PENDING/CURRENT stops in sequence order!
  // When all unvisited stops are SKIPPED, cycle through SKIPPED stops in sequence order!
  const unvisitedStops = routeData?.stops?.filter((s: any) => s.status === 'PENDING' || s.status === 'CURRENT') || [];
  const skippedStops = routeData?.stops?.filter((s: any) => s.status === 'SKIPPED') || [];

  let nextStop = routeData?.nextStop || null;
  if (unvisitedStops.length > 0) {
    if (!nextStop || nextStop.status === 'SKIPPED' || nextStop.status === 'VISITED') {
      nextStop = unvisitedStops[0];
    }
  } else if (skippedStops.length > 0) {
    if (!nextStop || nextStop.status === 'VISITED') {
      nextStop = skippedStops[0];
    }
  } else {
    nextStop = null;
  }

  const distanceToNextStop = nextStop?.store
    ? getDistanceMeters(liveGps.lat, liveGps.lng, nextStop.store.latitude, nextStop.store.longitude)
    : 0;

  // 2. Leaflet Map Initialization & Rendering
  useEffect(() => {
    if (!currentUser || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [liveGps.lat, liveGps.lng],
        zoom: 13,
        zoomControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    renderMapMarkers();
  }, [activeTab, routeData, lockedStores, liveGps, currentUser]);

  const renderMapMarkers = () => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    const map = mapInstanceRef.current;
    const layer = markersLayerRef.current;
    layer.clearLayers();

    if (routePolylineRef.current) {
      map.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }

    // Rep Live Position Marker
    const repIcon = L.divIcon({
      className: 'custom-rep-icon',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-8 h-8 bg-blue-500 rounded-full animate-ping opacity-60"></div>
          <div class="w-6 h-6 bg-blue-600 border-2 border-white rounded-full shadow-lg flex items-center justify-center text-white font-bold text-xs">
            📍
          </div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    L.marker([liveGps.lat, liveGps.lng], { icon: repIcon })
      .bindPopup(`<div class="text-right font-cairo"><b>موقعك الميداني الحي</b><br>الدقة: ${gpsAccuracy}م</div>`)
      .addTo(layer);

    if (activeTab === 'ROUTE' && routeData?.stops) {
      const latlngs: L.LatLngTuple[] = [[liveGps.lat, liveGps.lng]];

      routeData.stops.forEach((stop: any, idx: number) => {
        const isVisited = stop.status === 'VISITED';
        const isSkipped = stop.status === 'SKIPPED';
        const isCurrent = nextStop?.id === stop.id;

        // Colors: Green for Visited, Red for Remaining/Skipped
        const pinBg = isVisited ? 'bg-emerald-600' : (isSkipped ? 'bg-rose-700' : 'bg-rose-500');
        const badgeText = isVisited ? '✓' : `${stop.sequenceOrder}`;

        const storeIcon = L.divIcon({
          className: 'store-pin-icon',
          html: `
            <div class="relative flex flex-col items-center">
              <div class="w-8 h-8 ${pinBg} ${isCurrent ? 'ring-4 ring-amber-400 animate-bounce' : ''} text-white font-bold rounded-full shadow-xl flex items-center justify-center border-2 border-white text-xs">
                ${badgeText}
              </div>
              <div class="bg-slate-900 text-slate-100 text-[10px] px-1.5 py-0.5 rounded shadow mt-1 whitespace-nowrap font-bold max-w-[100px] truncate border border-slate-700">
                ${stop.store.name}
              </div>
            </div>
          `,
          iconSize: [32, 48],
          iconAnchor: [16, 24],
        });

        const marker = L.marker([stop.store.latitude, stop.store.longitude], { icon: storeIcon }).addTo(layer);

        const dist = getDistanceMeters(liveGps.lat, liveGps.lng, stop.store.latitude, stop.store.longitude);
        marker.bindPopup(`
          <div class="text-right font-cairo p-1">
            <h4 class="font-bold text-slate-900 text-sm mb-1">${stop.store.name}</h4>
            <div class="text-xs text-slate-600 mb-1">المنطقة: <b>${stop.store.zone?.name || 'بغداد'}</b></div>
            <div class="text-xs text-slate-600 mb-2">المسافة منك: <b>${dist} متراً</b></div>
            <div class="text-xs mb-2">
              الحالة: <span class="font-bold ${isVisited ? 'text-emerald-600' : 'text-rose-600'}">
                ${isVisited ? 'تمت الزيارة بنجاح 🟢' : (isSkipped ? 'متخطى (مؤجل لنهاية اليوم) 🔴' : 'بانتظار الزيارة 🔴')}
              </span>
            </div>
            <a href="https://waze.com/ul?ll=${stop.store.latitude},${stop.store.longitude}&navigate=yes" target="_blank" class="block text-center bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs py-1.5 px-3 rounded shadow mb-1">
              🚗 الذهاب عبر تطبيق Waze
            </a>
          </div>
        `);

        if (!isVisited) {
          latlngs.push([stop.store.latitude, stop.store.longitude]);
        }
      });

      // Draw polyline connecting stops
      if (latlngs.length > 1) {
        routePolylineRef.current = L.polyline(latlngs, {
          color: '#06b6d4',
          weight: 4,
          opacity: 0.8,
          dashArray: '6, 8',
        }).addTo(map);
      }
    } else if (activeTab === 'LOCKED_MAP') {
      // Locked Stores Map (All stores locked - NO REP NAMES)
      lockedStores.forEach((st: any) => {
        const lockedIcon = L.divIcon({
          className: 'locked-store-pin',
          html: `
            <div class="relative flex flex-col items-center">
              <div class="w-7 h-7 bg-slate-700 text-amber-300 font-bold rounded-full shadow-lg flex items-center justify-center border-2 border-slate-500 text-xs">
                🔒
              </div>
              <div class="bg-slate-900 text-slate-200 text-[10px] px-1 rounded shadow mt-0.5 whitespace-nowrap font-bold max-w-[90px] truncate border border-slate-700">
                ${st.name}
              </div>
            </div>
          `,
          iconSize: [28, 42],
          iconAnchor: [14, 21],
        });

        L.marker([st.latitude, st.longitude], { icon: lockedIcon })
          .bindPopup(`
            <div class="text-right font-cairo p-1">
              <div class="flex items-center gap-1 text-amber-600 font-bold text-xs mb-1">
                <span>🔒 متجر متعاقد معه ومقفل</span>
              </div>
              <h4 class="font-bold text-slate-900 text-sm mb-1">${st.name}</h4>
              <div class="text-xs text-slate-600 mb-1">المنطقة: <b>${st.zoneName}</b></div>
              <div class="text-xs text-slate-600 mb-1">المالك: ${st.ownerName || '---'}</div>
              <div class="text-xs text-slate-500 mt-2 bg-slate-100 p-1.5 rounded border border-slate-200">
                🚫 لا يمكن لمندوب آخر عقد صفقة مع هذا المتجر.
              </div>
            </div>
          `)
          .addTo(layer);
      });
    }
  };

  // 3. Actions: Waze Navigation
  const handleOpenWaze = (lat: number, lng: number) => {
    const wazeUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    window.open(wazeUrl, '_blank');
    showToast('🚗 تم فتح تطبيق Waze لتوجيهك الصوتي للمحل!');
  };

  // 4. Actions: Skip Stop (Moves to end, keeps RED, and immediately updates next stop!)
  const handleConfirmSkip = async () => {
    if (!targetStopToSkip) return;
    try {
      const res = await fetch(`${API_BASE}/routes/skip-stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId: routeData.id,
          stopId: targetStopToSkip.id,
          skipReason,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.message);
        setSkipModalOpen(false);
        setTargetStopToSkip(null);
        // Refresh route data so next stop updates immediately!
        await fetchInitialData();
      }
    } catch (e) {
      showToast('حدث خطأ أثناء تسجيل التخطي');
    }
  };

  // 4b. Actions: Unskip / Reactivate Stop (Cancels postponement & re-activates stop)
  const handleUnskipStop = async (stopId: number) => {
    try {
      const res = await fetch(`${API_BASE}/routes/unskip-stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stopId }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`🔄 ${json.message}`);
        await fetchInitialData();
      } else {
        showToast(json.message || 'تعذر إلغاء التأجيل');
      }
    } catch (e) {
      showToast('خطأ في الاتصال بالخادم لإلغاء التأجيل');
    }
  };

  // 5. Actions: Visit & Strict 20m Check-in
  const openVisitModalForStop = (stop: any) => {
    const dist = getDistanceMeters(liveGps.lat, liveGps.lng, stop.store.latitude, stop.store.longitude);
    if (dist > 20) {
      showToast(`⛔ أنت تبعد ${dist} متراً. يجب أن تكون ضمن نطاق 20 متراً من المتجر لتسجيل الزيارة.`);
      return;
    }
    setTargetStoreForVisit(stop.store);
    setTargetStopIdForVisit(stop.id);
    setVisitNotes('');
    setOptionalPhotoBase64('');
    setVisitModalOpen(true);
  };

  const handleConfirmVisit = async () => {
    if (!targetStoreForVisit) return;
    const dist = getDistanceMeters(liveGps.lat, liveGps.lng, targetStoreForVisit.latitude, targetStoreForVisit.longitude);

    if (dist > 20) {
      showToast(`⛔ تم رفض التوثيق: المسافة الحالية ${dist} متراً (> 20م).`);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: targetStoreForVisit.id,
          repId: selectedRepId,
          routeStopId: targetStopIdForVisit,
          repLat: liveGps.lat,
          repLng: liveGps.lng,
          notes: visitNotes || 'زيارة دورية ناجحة',
          photoBase64: optionalPhotoBase64 || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`🎉 ${json.message}`);
        setVisitModalOpen(false);
        setTargetStoreForVisit(null);
        await fetchInitialData();
        await fetchLockedStores();
      } else {
        showToast(json.message || 'حدث خطأ في التسجيل');
      }
    } catch (e) {
      showToast('خطأ في إرسال الزيارة');
    }
  };

  // Handle optional photo snapshot for revisit
  const handleRevisitPhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        showToast('⏳ جاري ضغط الصورة المحدثة...');
        const compressed = await compressImageFile(file, 1200, 0.75);
        if (compressed) {
          setOptionalPhotoBase64(compressed);
          showToast('📷 تم التقاط صورة المتجر المحدثة بنجاح');
        }
      } catch (err) {
        showToast('تعذر معالجة الصورة');
      }
    }
  };

  // 6. Register New Store & Deal (Automatically adds to rep's route list!)
  const handleNewStorePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        showToast('⏳ جاري ضغط صورة الكاميرا وتثبيت الموقع...');
        const compressed = await compressImageFile(file, 1200, 0.75);
        if (compressed) {
          setNewStorePhotoBase64(compressed);
          showToast('📸 تم تصوير واجهة المحل بنجاح وتثبيت الموقع الجغرافي');
        }
      } catch (err) {
        showToast('تعذر معالجة صورة الكاميرا');
      }
    }
  };

  const handleRegisterNewStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewStoreDuplicateError('');
    setNewStoreSuccessMsg('');

    if (!newStoreName.trim()) {
      setNewStoreDuplicateError('يرجى إدخال اسم المتجر');
      return;
    }
    if (!newStorePhotoBase64) {
      setNewStoreDuplicateError('تصوير واجهة المحل إلزامي لعقد الصفقة الأولى وتثبيت الموقع');
      return;
    }

    try {
      showToast('⏳ جاري حفظ المتجر وعقد الصفقة...');
      const res = await fetch(`${API_BASE}/stores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStoreName.trim(),
          ownerName: newStoreOwner.trim(),
          phone: newStorePhone.trim(),
          latitude: liveGps.lat,
          longitude: liveGps.lng,
          zoneId: newStoreZoneId,
          preferredCharcoal: newStoreCharcoal,
          repId: currentUser?.id || selectedRepId,
          photoBase64: newStorePhotoBase64,
          revisitCycleDays: newStoreRevisitCycle,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        setNewStoreDuplicateError(json.message || 'فشل في حفظ المتجر');
      } else {
        setNewStoreSuccessMsg(json.message);
        showToast('🎉 تم تسجيل العميل وعقد الصفقة وتثبيت موقعه في خط سيرك بنجاح!');
        // Reset form
        setNewStoreName('');
        setNewStoreOwner('');
        setNewStorePhone('');
        setNewStorePhotoBase64('');
        setNewStoreRevisitCycle(14);
        // Immediately fetch data to display new store in the rep's route list!
        await fetchLockedStores();
        await fetchInitialData();
        setTimeout(() => setActiveTab('ROUTE'), 1500);
      }
    } catch (e: any) {
      setNewStoreDuplicateError('خطأ في الاتصال بالخادم');
    }
  };

  // 7. Complete Workday
  const handleCompleteWorkday = async () => {
    if (!routeData?.id) return;
    try {
      const res = await fetch(`${API_BASE}/routes/complete-day`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId: routeData.id }),
      });
      const json = await res.json();
      if (json.success) {
        setCompletionSummary(json.summary);
        setCompletionModalOpen(true);
        fetchInitialData();
      }
    } catch (e) {
      showToast('خطأ في إنهاء يوم العمل');
    }
  };

  // Simulate Teleport to target store (Helpful tool for testing 20m check on desktop/browser!)
  const teleportNearStore = (lat: number, lng: number) => {
    setLiveGps({ lat: lat + 0.00005, lng: lng + 0.00005 }); // ~7 meters away
    showToast('📍 تم محاكاة وصولك لموقع المتجر (أقل من 10 أمتار)!');
  };

  // =========================================================================
  // LOGIN SCREEN (برنامج النقوصات Style)
  // =========================================================================
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-opdc-radial bg-opdc-dots text-slate-900 font-cairo flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-[24px] shadow-opdc border border-[#edf1f3] overflow-hidden">
          
          {/* Executive Header matching برنامج النقوصات */}
          <div className="bg-gradient-to-br from-[#0a3325] via-[#0E4D38] to-[#16654a] px-6 pt-7 pb-6 text-white text-center relative overflow-hidden border-b-4 border-[#D4AF37]">
            <div className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />
            <div className="absolute -left-8 -top-8 w-32 h-32 rounded-full bg-sky-500/10 blur-2xl pointer-events-none" />
            
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border-2 border-[#D4AF37] mb-3 shadow-gold-glow">
              <Flame className="w-8 h-8 text-amber-400" />
            </div>

            <h1 className="text-xl font-black tracking-tight text-white">برنامج إدارة وتوزيع الفحم</h1>
            <p className="text-[#D4AF37] text-xs font-bold max-w-xs mx-auto leading-relaxed mt-1">
              نظام إدارة المبيعات وتتبع خطوط السير • بوابة المندوب
            </p>
          </div>

          <div className="p-6">
            {loginError && (
              <div className="bg-rose-50 border border-rose-300 text-rose-800 text-xs p-3 rounded-2xl mb-4 flex items-center gap-2 animate-shake font-bold">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1.5 flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-sky-600" />
                  <span>اسم المستخدم أو رقم الهاتف</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ادخل اسم المستخدم أو رقم الهاتف"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none shadow-2xs placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1.5 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                  <span>كلمة المرور</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none shadow-2xs placeholder:text-slate-400"
                />
              </div>

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full py-3.5 bg-gradient-to-r from-[#0E4D38] via-[#115e45] to-[#16654a] hover:from-[#0a3325] hover:to-[#0E4D38] text-white font-black rounded-xl shadow-opdc-btn flex items-center justify-center gap-2 transition text-sm mt-3 border-t border-emerald-400/30"
              >
                {loggingIn ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                <span>{loggingIn ? 'جاري التحقق...' : 'تسجيل الدخول'}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MAIN APP INTERFACE (WHEN LOGGED IN - برنامج النقوصات Style)
  // =========================================================================
  return (
    <div className="flex flex-col min-h-screen bg-[#f8fafc] text-slate-900 font-cairo select-none pb-20">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-3 left-3 right-3 z-50 bg-slate-900 text-white font-bold px-4 py-3 rounded-2xl shadow-xl flex items-center justify-between border border-slate-800 animate-slide-down">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-400 animate-bounce" />
            <span className="text-sm">{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage('')} className="text-white/80 hover:text-white">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Top Header matching Header.jsx from برنامج النقوصات */}
      <header
        className="sticky top-0 z-40 bg-gradient-to-r from-[#0a3325] via-[#0E4D38] to-[#16654a] text-white border-b-4 border-[#D4AF37] shadow-lg"
        style={{
          paddingTop: 'max(0.625rem, env(safe-area-inset-top, 0px))',
          paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))'
        }}
      >
        <div className="max-w-4xl mx-auto px-2 sm:px-4 py-2 flex items-center justify-between gap-2">
          {/* Brand & System Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-[#D4AF37] shadow-xs border border-[#D4AF37]/50 shrink-0">
              <Flame className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm font-black text-white tracking-tight leading-none truncate">
                إدارة وتوزيع الفحم
              </h1>
              <p className="text-[10px] font-bold text-[#D4AF37] mt-0.5 truncate">
                نظام تتبع وحفظ العملاء الميداني
              </p>
            </div>
          </div>

          {/* User Badge, GPS Telemetry & Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Live GPS Telemetry Badge - Compact */}
            <div className="flex items-center gap-1 bg-black/25 backdrop-blur-md px-1.5 py-1 sm:px-2 sm:py-1 rounded-xl border border-white/20 text-[10px] font-bold text-white shadow-2xs" title="GPS نشط">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              <span className="text-[10px] text-emerald-300 font-bold hidden sm:inline">GPS</span>
            </div>

            {/* Rep User Badge - Full Name Display (Never Truncated) */}
            <div className="flex items-center gap-1.5 bg-black/30 backdrop-blur-md border border-[#D4AF37] px-2.5 py-1 rounded-xl text-xs font-bold text-white shadow-2xs">
              <UserIcon className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
              <div className="text-right whitespace-nowrap">
                <span className="text-white block font-black leading-tight text-xs whitespace-nowrap">
                  {currentUser.name}
                </span>
              </div>
            </div>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="w-8 h-8 rounded-xl border border-white/20 bg-black/25 hover:bg-rose-600 text-white flex items-center justify-center transition-all shadow-2xs active:scale-95 cursor-pointer shrink-0"
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      
      {/* Segmented Navigation Tabs (Responsive with Horizontal Scroll on Narrow Screens) */}
      <div className="max-w-4xl mx-auto w-full px-3 pt-3">
        <div className="flex bg-[#e8eee9] p-1 gap-1 rounded-2xl border border-[#c2e2d4] shadow-2xs overflow-x-auto scrollbar-none">
          {currentUser?.role === 'ADMIN' ? (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('ADMIN_OVERVIEW')}
                className={`flex-1 min-w-[95px] xs:min-w-0 py-2 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 xs:shrink ${
                  activeTab === 'ADMIN_OVERVIEW'
                    ? 'bg-[#0E4D38] text-white shadow-md border-b-2 border-[#D4AF37]'
                    : 'text-[#0a3325] hover:text-[#0E4D38] font-bold'
                }`}
              >
                <span>📊 لوحة الإحصائيات</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('ROUTE')}
                className={`flex-1 min-w-[95px] xs:min-w-0 py-2 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 xs:shrink ${
                  activeTab === 'ROUTE'
                    ? 'bg-[#0E4D38] text-white shadow-md border-b-2 border-[#D4AF37]'
                    : 'text-[#0a3325] hover:text-[#0E4D38] font-bold'
                }`}
              >
                <Navigation className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>🗺️ مراقبة المندوبين</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('LOCKED_MAP')}
                className={`flex-1 min-w-[95px] xs:min-w-0 py-2 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 xs:shrink ${
                  activeTab === 'LOCKED_MAP'
                    ? 'bg-[#0E4D38] text-white shadow-md border-b-2 border-[#D4AF37]'
                    : 'text-[#0a3325] hover:text-[#0E4D38] font-bold'
                }`}
              >
                <Lock className="w-3.5 h-3.5 text-amber-500" />
                <span>المتاجر المقفلة ({lockedStores.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('NEW_STORE')}
                className={`flex-1 min-w-[85px] xs:min-w-0 py-2 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 xs:shrink ${
                  activeTab === 'NEW_STORE'
                    ? 'bg-[#0E4D38] text-white shadow-md border-b-2 border-[#D4AF37]'
                    : 'text-[#0a3325] hover:text-[#0E4D38] font-bold'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span>➕ متجر جديد</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('ROUTE')}
                className={`flex-1 min-w-[90px] xs:min-w-0 py-2 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 xs:shrink ${
                  activeTab === 'ROUTE'
                    ? 'bg-[#0E4D38] text-white shadow-md border-b-2 border-[#D4AF37]'
                    : 'text-[#0a3325] hover:text-[#0E4D38] font-bold'
                }`}
              >
                <Navigation className="w-3.5 h-3.5 text-sky-400" />
                <span>مساري لليوم</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('LOCKED_MAP')}
                className={`flex-1 min-w-[95px] xs:min-w-0 py-2 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 xs:shrink ${
                  activeTab === 'LOCKED_MAP'
                    ? 'bg-[#0E4D38] text-white shadow-md border-b-2 border-[#D4AF37]'
                    : 'text-[#0a3325] hover:text-[#0E4D38] font-bold'
                }`}
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>المتاجر المقفلة ({lockedStores.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('NEW_STORE')}
                className={`flex-1 min-w-[95px] xs:min-w-0 py-2 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 xs:shrink ${
                  activeTab === 'NEW_STORE'
                    ? 'bg-[#0E4D38] text-white shadow-md border-b-2 border-[#D4AF37]'
                    : 'text-[#0a3325] hover:text-[#0E4D38] font-bold'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>عقد صفقة جديدة</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* VIEW: ADMIN_OVERVIEW (Executive Dashboard with OPDC Theme) */}
      {currentUser?.role === 'ADMIN' && activeTab === 'ADMIN_OVERVIEW' && (
        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col gap-4 px-3 pt-3">
          {/* Welcome Executive Card */}
          <div className="bg-gradient-to-r from-[#0a3325] via-[#0E4D38] to-[#16654a] rounded-3xl p-4 sm:p-6 text-white border-2 border-[#D4AF37] shadow-opdc relative overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#D4AF37] to-[#b89628] text-slate-950 flex items-center justify-center font-black shadow-lg text-2xl">
                  👑
                </span>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white">
                    لوحة تحكم المدير العام
                  </h2>
                  <p className="text-xs text-[#D4AF37] font-bold mt-0.5">
                    الإشراف الميداني المركزي • نظام إدارة وتوزيع الفحم
                  </p>
                </div>
              </div>
              <a
                href="https://fadi-charcoal-admin.web.app"
                target="_blank"
                rel="noreferrer"
                className="bg-gradient-to-r from-[#D4AF37] to-[#b89628] hover:from-[#b89628] hover:to-[#D4AF37] text-slate-950 text-xs font-black px-4 py-2.5 rounded-xl border border-white/30 shadow-md flex items-center gap-2 transition active:scale-95"
              >
                <span>🖥️ فتح لوحة تحكم الكمبيوتر</span>
              </a>
            </div>
          </div>

          {/* 4 OPDC Luxury KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-4 border border-[#c2e2d4] shadow-opdc text-center relative overflow-hidden group hover:border-[#D4AF37] transition">
              <span className="text-[11px] font-bold text-slate-500 block mb-1">إجمالي المتاجر</span>
              <span className="text-2xl font-black text-[#0E4D38]">{adminStats?.totalStores ?? 0}</span>
              <span className="text-[10px] text-slate-500 font-bold block mt-0.5">محل مسجل في بغداد</span>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-[#c2e2d4] shadow-opdc text-center relative overflow-hidden group hover:border-[#D4AF37] transition">
              <span className="text-[11px] font-bold text-slate-500 block mb-1">المندوبون الميدانيون</span>
              <span className="text-2xl font-black text-[#0E4D38]">{adminStats?.totalReps ?? 0}</span>
              <span className="text-[10px] text-slate-500 font-bold block mt-0.5">مندوبين نشطين 🟢</span>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-[#c2e2d4] shadow-opdc text-center relative overflow-hidden group hover:border-[#D4AF37] transition">
              <span className="text-[11px] font-bold text-slate-500 block mb-1">محطات اليوم</span>
              <span className="text-2xl font-black text-[#b89628]">{adminStats?.plannedStops ?? 0}</span>
              <span className="text-[10px] text-[#b89628] font-bold block mt-0.5">محطة مجدولة للزيارة</span>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-[#c2e2d4] shadow-opdc text-center relative overflow-hidden group hover:border-[#D4AF37] transition">
              <span className="text-[11px] font-bold text-slate-500 block mb-1">الزيارات المكتملة</span>
              <span className="text-2xl font-black text-emerald-600">{adminStats?.completedStops ?? 0}</span>
              <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">زيارة موثقة بالـ GPS ✅</span>
            </div>
          </div>

          {/* Fleet Operations & Live Monitoring */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-opdc">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                <h3 className="font-black text-sm text-[#0E4D38]">حالة أسطول المندوبين الميدانيين اليوم</h3>
              </div>
              <button
                onClick={() => fetchInitialData()}
                className="text-[11px] font-bold text-[#0E4D38] hover:text-[#0a3325] flex items-center gap-1 bg-[#f0f7f3] px-2.5 py-1 rounded-lg border border-[#c2e2d4]"
              >
                <RefreshCw className="w-3 h-3" />
                <span>تحديث الحالة</span>
              </button>
            </div>

            {adminReps.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <Users className="w-10 h-10 mx-auto mb-2 text-slate-400 opacity-60" />
                <p className="font-bold text-sm text-slate-800">لا يوجد مناديب مسجلين حالياً (0 مندوب)</p>
                <p className="text-xs text-slate-500 mt-1">البيانات مصفّرة وجاهزة. يمكنك إضافة المناديب الفعليين من لوحة تحكم الكمبيوتر.</p>
                <a
                  href="https://fadi-charcoal-admin.web.app"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-[#0E4D38] hover:bg-[#0a3325] text-white rounded-xl text-xs font-black shadow-xs border border-[#D4AF37]"
                >
                  <span>🖥️ فتح لوحة التحكم وإضافة مناديب</span>
                </a>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {adminReps.map((rep: any) => (
                  <div key={rep.id} className="bg-[#f4f6f8] rounded-xl p-3 border border-slate-200 hover:border-[#D4AF37] transition flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-black text-sm text-slate-900">🚗 {rep.name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${rep.active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                          {rep.active ? 'نشط 🟢' : 'متوقف ⏸️'}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 block mb-1">المحلات: {rep._count?.contractedStores || 0}</span>
                      <span className="text-xs text-slate-600 font-mono block">هاتف: {rep.phone}</span>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-200 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setInspectedRepId(rep.id);
                          setActiveTab('ROUTE');
                        }}
                        className="flex-1 bg-[#0E4D38] hover:bg-[#0a3325] text-white text-xs font-black py-1.5 rounded-lg border border-[#D4AF37] transition shadow-xs"
                      >
                        مراقبة مساره 👁️
                      </button>
                      <a
                        href={`tel:${rep.phone}`}
                        className="bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 transition"
                      >
                        📞
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick System Shortcuts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <button
              type="button"
              onClick={() => setActiveTab('LOCKED_MAP')}
              className="bg-[#f0f7f3] hover:bg-[#e0f0e7] border border-[#c2e2d4] p-3.5 rounded-2xl text-right flex items-center justify-between transition shadow-2xs"
            >
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-[#0E4D38] text-[#D4AF37] flex items-center justify-center font-bold text-lg">
                  🔒
                </span>
                <div>
                  <span className="font-black text-sm text-[#0E4D38] block">خريطة كافة المتاجر المقفلة</span>
                  <span className="text-xs text-slate-500">استعراض كافة المحلات ({lockedStores.length}) المسجلة لحمايتها من التضارب</span>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-[#0E4D38]" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('NEW_STORE')}
              className="bg-[#f0f7f3] hover:bg-[#e0f0e7] border border-[#c2e2d4] p-3.5 rounded-2xl text-right flex items-center justify-between transition shadow-2xs"
            >
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-[#0E4D38] text-[#D4AF37] flex items-center justify-center font-bold text-lg">
                  ➕
                </span>
                <div>
                  <span className="font-black text-sm text-[#0E4D38] block">تسجيل متجر جديد للشركة</span>
                  <span className="text-xs text-slate-500">إضافة نقطة بيع جديدة مباشرة وتحديد موقعها عبر الـ GPS</span>
                </div>
              </div>
              <ChevronLeft className="w-5 h-5 text-[#0E4D38]" />
            </button>
          </div>
        </div>
      )}

      {/* VIEW 1 & 2: MAP VIEW (Route Map or Locked Map) */}
      {(activeTab === 'ROUTE' || activeTab === 'LOCKED_MAP') && (
        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col relative px-3 pt-2">
          {/* Admin Rep Switcher Bar (Only in Route Map View for Admin) */}
          {currentUser?.role === 'ADMIN' && activeTab === 'ROUTE' && (
            <div className="bg-white rounded-2xl p-3 border-2 border-[#D4AF37] shadow-opdc mb-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-[#0E4D38] flex items-center gap-1.5">
                  <span>👑 اختر المندوب لمراقبة خط سيره الميداني:</span>
                </span>
                <span className="text-[10px] font-bold bg-[#f0f7f3] text-[#0E4D38] px-2 py-0.5 rounded-lg border border-[#c2e2d4]">
                  وضع الرقابة الميدانية
                </span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {adminReps.length === 0 ? (
                  <span className="text-xs text-slate-400 font-bold py-1">لا يوجد مناديب مسجلين حالياً</span>
                ) : (
                  adminReps.map((rep: any) => (
                    <button
                      key={rep.id}
                      type="button"
                      onClick={() => setInspectedRepId(rep.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-2xs ${
                        inspectedRepId === rep.id
                          ? 'bg-[#0E4D38] text-white border-2 border-[#D4AF37] shadow-sm'
                          : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
                      }`}
                    >
                      <span>🚗 {rep.name}</span>
                      {inspectedRepId === rep.id && <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]"></span>}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Map Info Banner */}
          {activeTab === 'ROUTE' ? (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-2.5 mb-2.5 flex items-center justify-between text-xs shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-xl border border-emerald-200/70 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>تمت الزيارة: <strong className="font-mono">{routeData?.completedCount || 0}</strong></span>
                </span>
                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-800 px-2.5 py-1 rounded-xl border border-rose-200/70 font-bold">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  <span>المتبقي: <strong className="font-mono">{routeData?.remainingCount || 0}</strong></span>
                </span>
              </div>
              {currentUser?.role === 'ADMIN' ? (
                <button
                  onClick={() => fetchInitialData()}
                  className="bg-[#0E4D38] hover:bg-[#0a3325] text-white text-[11px] font-bold py-1.5 px-3 rounded-xl border border-[#D4AF37] transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <RefreshCw className="w-3 h-3 text-[#D4AF37]" />
                  <span>تحديث المسار</span>
                </button>
              ) : (
                <button
                  onClick={handleCompleteWorkday}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold py-1.5 px-3 rounded-xl border border-rose-200 transition-colors flex items-center gap-1 shadow-2xs"
                >
                  <Flag className="w-3 h-3 text-rose-600" />
                  <span>إنهاء مسار اليوم</span>
                </button>
              )}
            </div>
          ) : (
            <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-2.5 mb-2.5 flex items-center gap-2 text-xs text-amber-900 shadow-2xs">
              <Lock className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>كافة المتاجر المسجلة تظهر مقفلة 🔒 لحماية المنافسة ومنع التضارب بين المندوبين.</span>
            </div>
          )}

          {/* Leaflet Map Canvas */}
          <div className="w-full h-[360px] rounded-3xl overflow-hidden border border-slate-200/90 shadow-sm relative bg-slate-100">
            <div ref={mapContainerRef} className="w-full h-full z-10" />

            {/* Quick Map Controls Overlay */}
            <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
              <button
                onClick={() => {
                  if (mapInstanceRef.current) {
                    mapInstanceRef.current.setView([liveGps.lat, liveGps.lng], 15);
                  }
                }}
                className="w-9 h-9 bg-white/95 text-slate-700 hover:text-sky-600 rounded-xl border border-slate-200 flex items-center justify-center shadow-md backdrop-blur transition active:scale-95"
                title="توسيط موقعي"
              >
                📍
              </button>
            </div>
          </div>

          {/* FLOATING NEXT STOP CARD (Point 7 & Waze turn-by-turn navigation) */}
          {activeTab === 'ROUTE' && nextStop && (
            <div className={`mt-3 bg-white border-2 ${
              nextStop.status === 'SKIPPED' ? 'border-amber-400' : 'border-[#D4AF37] border-t-4'
            } rounded-3xl p-4 sm:p-5 shadow-lg relative overflow-hidden transition-all`}>
              {/* Header */}
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 ${
                    nextStop.status === 'SKIPPED'
                      ? 'bg-amber-50 text-amber-900 border border-amber-200'
                      : 'bg-sky-50 text-sky-800 border border-sky-200'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${nextStop.status === 'SKIPPED' ? 'bg-amber-500' : 'bg-sky-500'} animate-ping`}></span>
                    <span>{nextStop.status === 'SKIPPED' ? 'المحطة المؤجلة التالية' : 'محطتك التالية'}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Simulation Helper button for Desktop testing */}
                  <button
                    onClick={() => teleportNearStore(nextStop.store.latitude, nextStop.store.longitude)}
                    className="text-[10px] bg-slate-100 text-slate-700 hover:bg-slate-200 px-2 py-1 rounded-lg border border-slate-200 font-bold transition cursor-pointer"
                    title="محاكاة الاقتراب لمسافة 7م لاختبار القفل الأمني"
                  >
                    🎯 تجربة قرب 20م
                  </button>
                  <span className="bg-slate-100 text-slate-700 text-xs font-black px-2.5 py-1 rounded-xl border border-slate-200">
                    محطة #{nextStop.sequenceOrder}
                  </span>
                </div>
              </div>

              {/* Postponed Store Banner with Re-activation Button (Point 2) */}
              {nextStop.status === 'SKIPPED' && (
                <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-3 mb-3 text-xs flex items-center justify-between text-amber-900 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <div>
                      <span className="font-bold">المتجر مؤجل سابقاً: </span>
                      <span>{nextStop.skipReason || 'طلب تأجيل'}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnskipStop(nextStop.id)}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-black px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 shadow-xs transition active:scale-95 cursor-pointer"
                    title="إلغاء التأجيل وتفعيل المحطة رسمياً"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>إلغاء التأجيل 🔄</span>
                  </button>
                </div>
              )}

              {/* Store Main Details */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                    {nextStop.store.name}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-slate-500 font-medium mt-1">
                    <span className="flex items-center gap-1 text-sky-700 font-bold">
                      <MapPin className="w-3.5 h-3.5 text-sky-600" />
                      المنطقة: {nextStop.store.zone?.name || 'بغداد'}
                    </span>
                    {nextStop.store.ownerName && (
                      <span>المالك: {nextStop.store.ownerName}</span>
                    )}
                  </div>
                </div>

                {/* Live Distance Badge */}
                <div className={`px-3 py-1.5 rounded-xl font-black text-xs border ${
                  distanceToNextStop <= 20
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-xs animate-pulse'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {distanceToNextStop <= 20 ? `على بعد ${distanceToNextStop}م ✅` : `يبعد ${distanceToNextStop} متراً`}
                </div>
              </div>

              {/* Call Owner Button */}
              {nextStop.store.phone && (
                <div className="mb-3 flex items-center justify-between bg-slate-50 p-2.5 rounded-2xl border border-slate-200/90 text-xs shadow-2xs">
                  <span className="text-slate-600 font-medium">هاتف المتجر: <b className="text-slate-900">{nextStop.store.phone}</b></span>
                  <a
                    href={`tel:${nextStop.store.phone}`}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs shadow-xs transition active:scale-95"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>اتصال</span>
                  </a>
                </div>
              )}

              {/* 20-Meter Check-in Geofence Warning Box (Point 5) */}
              <div className={`p-3 rounded-2xl border mb-3 text-xs flex items-center gap-2.5 ${
                distanceToNextStop <= 20
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                {distanceToNextStop <= 20 ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0" />
                )}
                <div>
                  {distanceToNextStop <= 20 ? (
                    <div className="font-bold">
                      {nextStop.status === 'SKIPPED'
                        ? 'أنت في نطاق المتجر (ضمن 20م)! يمكنك الآن عقد الصفقة وتثبيت الزيارة ✅'
                        : 'أنت الآن في نطاق الـ 20 متراً من المحل! يمكنك تسجيل الزيارة ✅'}
                    </div>
                  ) : (
                    <div>
                      <span className="font-black">القفل الأمني مفعل: </span>
                      أنت على بعد {distanceToNextStop}م. لا يمكن توثيق الزيارة إلا عند الاقتراب لمسافة 20 متراً أو أقل.
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons: الذهاب (Waze) | تخطي؟ | تسجيل الزيارة */}
              <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                {/* Waze Primary Button */}
                <button
                  onClick={() => handleOpenWaze(nextStop.store.latitude, nextStop.store.longitude)}
                  className="bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-black py-3 px-3 rounded-2xl shadow-sm flex items-center justify-center gap-1.5 transition-all text-xs sm:text-sm active:scale-98 cursor-pointer"
                >
                  <Navigation className="w-4 h-4" />
                  <span>الذهاب (تطبيق Waze)</span>
                </button>

                {/* Skip Button (Loops continuously through postponed stops) */}
                <button
                  onClick={() => {
                    setTargetStopToSkip(nextStop);
                    setSkipModalOpen(true);
                  }}
                  className="bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 font-black py-3 px-3 rounded-2xl border border-rose-200 shadow-2xs flex items-center justify-center gap-1.5 transition-all text-xs sm:text-sm active:scale-98 cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>{nextStop.status === 'SKIPPED' ? 'تخطي للمؤجل التالي؟' : 'تخطي المحطة؟'}</span>
                </button>
              </div>

              {/* Check-in / Deal Button (Active ONLY if <= 20 meters) */}
              <button
                disabled={distanceToNextStop > 20}
                onClick={() => openVisitModalForStop(nextStop)}
                className={`w-full py-3.5 px-4 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                  distanceToNextStop <= 20
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-md shadow-emerald-600/20 active:scale-98 cursor-pointer animate-pulse'
                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-75'
                }`}
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  {distanceToNextStop <= 20
                    ? (nextStop.status === 'SKIPPED' ? '🤝 عقد الصفقة وتوثيق الزيارة الآن 🟢' : 'تسجيل وتوثيق زيارة المتجر الآن 🟢')
                    : (nextStop.status === 'SKIPPED' ? `عقد الصفقة مقفل (اقترب ${distanceToNextStop}م للمحل)` : `تسجيل الزيارة مقفل (اقترب ${distanceToNextStop}م للمحل)`)}
                </span>
              </button>
            </div>
          )}

          {/* List of Today's Stops with Red/Green Indicators */}
          {activeTab === 'ROUTE' && routeData?.stops && (
            <div className="mt-4 pb-10">
              <div className="flex items-center justify-between mb-2.5 px-1">
                <h4 className="text-xs font-black text-slate-700">جدول محطات خط سير اليوم</h4>
                <span className="bg-slate-200/80 text-slate-800 text-[11px] font-black px-2 py-0.5 rounded-lg">
                  {routeData.stops.length} محطات
                </span>
              </div>
              <div className="space-y-2.5">
                {routeData.stops.map((stop: any) => {
                  const isVisited = stop.status === 'VISITED';
                  const isSkipped = stop.status === 'SKIPPED';
                  const isCurrent = nextStop?.id === stop.id;
                  const dist = getDistanceMeters(liveGps.lat, liveGps.lng, stop.store.latitude, stop.store.longitude);

                  return (
                    <div
                      key={stop.id}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-2 shadow-2xs ${
                        isVisited
                          ? 'bg-emerald-50/50 border-emerald-200/80 text-slate-700'
                          : isCurrent
                          ? 'bg-white border-2 border-[#D4AF37] shadow-md ring-4 ring-[#D4AF37]/15'
                          : 'bg-white border-slate-200/90 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs text-white shrink-0 shadow-xs ${
                          isVisited ? 'bg-emerald-600' : (isSkipped ? 'bg-rose-600' : 'bg-sky-600')
                        }`}>
                          {isVisited ? '✓' : stop.sequenceOrder}
                        </div>
                        <div className="min-w-0">
                          <div className="font-black text-xs sm:text-sm text-slate-900 flex items-center gap-1.5 flex-wrap">
                            <span className="truncate">{stop.store.name}</span>
                            {isVisited && (
                              <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded-md font-bold">
                                تمت الزيارة
                              </span>
                            )}
                            {isSkipped && (
                              <span className="text-[10px] bg-rose-50 text-rose-800 border border-rose-200 px-1.5 py-0.2 rounded-md font-bold">
                                مؤجل: {stop.skipReason}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                            منطقة {stop.store.zone?.name || 'بغداد'} • يبعد {dist}م
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        {isSkipped && (
                          <button
                            onClick={() => handleUnskipStop(stop.id)}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-black px-2.5 py-1.5 rounded-xl border border-amber-200 shadow-2xs flex items-center gap-1 transition active:scale-95 cursor-pointer"
                            title="إلغاء التأجيل وتفعيل المحطة"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                            <span>تفعيل</span>
                          </button>
                        )}
                        {!isVisited && (
                          <button
                            onClick={() => handleOpenWaze(stop.store.latitude, stop.store.longitude)}
                            className="bg-[#f0f7f3] hover:bg-[#dff0e6] text-[#0E4D38] text-xs font-black px-2.5 py-1.5 rounded-xl border border-[#a4d4bd] shadow-2xs flex items-center gap-1 transition active:scale-95 cursor-pointer"
                          >
                            <Navigation className="w-3.5 h-3.5 text-sky-600" />
                            <span>Waze</span>
                          </button>
                        )}
                        {!isVisited && dist <= 20 && (
                          <button
                            onClick={() => openVisitModalForStop(stop)}
                            className="bg-gradient-to-r from-[#0E4D38] to-[#16654a] hover:from-[#0a3325] hover:to-[#0E4D38] text-white text-xs font-black px-3.5 py-1.5 rounded-xl shadow-opdc-btn border border-[#D4AF37] flex items-center gap-1 transition active:scale-95 animate-pulse cursor-pointer"
                          >
                            <span>{isSkipped ? 'عقد صفقة' : 'توثيق'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: NEW STORE REGISTRATION & DEAL CLOSING (Points 2, 4 & 10) */}
      {activeTab === 'NEW_STORE' && (
        <div className="p-3 sm:p-4 flex-1 max-w-xl mx-auto w-full">
          <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0 shadow-2xs">
                <Store className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="font-black text-sm sm:text-base text-slate-900 tracking-tight">تسجيل متجر جديد وعقد الصفقة</h2>
                <p className="text-xs text-slate-500 font-medium">سيتم ربطه فورياً باسمك ({currentUser.name}) وإضافته لخط سيرك</p>
              </div>
            </div>

            {newStoreDuplicateError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-900 text-xs p-3.5 rounded-2xl mb-3 flex flex-col gap-2.5 shadow-2xs animate-shake">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="font-bold leading-relaxed">{newStoreDuplicateError}</div>
                </div>
                {(newStoreDuplicateError.includes('متر') || newStoreDuplicateError.includes('مسبقاً')) && (
                  <div className="bg-white/90 p-2.5 rounded-xl border border-rose-200 flex items-center justify-between mt-1">
                    <span className="text-[11px] text-amber-900 font-bold">💡 هل تقوم بالاختبار من نفس الغرفة/الموقع؟</span>
                    <button
                      type="button"
                      onClick={() => {
                        const offset = (Math.random() * 0.002 + 0.001) * (Math.random() > 0.5 ? 1 : -1);
                        setLiveGps((prev) => ({ lat: prev.lat + offset, lng: prev.lng + offset }));
                        setNewStoreDuplicateError('');
                        showToast('📍 تم توليد موقع جديد (+150م) لتجاوز فحص التكرار أثناء الاختبار!');
                      }}
                      className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-black px-2.5 py-1 rounded-lg shadow-xs transition active:scale-95 cursor-pointer"
                    >
                      🎲 تغيير الموقع +150م
                    </button>
                  </div>
                )}
              </div>
            )}

            {newStoreSuccessMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs p-3.5 rounded-2xl mb-3 flex items-start gap-2 shadow-2xs">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="font-bold leading-relaxed">{newStoreSuccessMsg}</div>
              </div>
            )}

            <form onSubmit={handleRegisterNewStore} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-black mb-1.5">اسم المتجر / الكافيه *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: متجر البركة لمستلزمات الشيشة"
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium text-xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none shadow-2xs transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-700 font-black mb-1.5">المنطقة (بغداد) *</label>
                  <select
                    value={newStoreZoneId}
                    onChange={(e) => setNewStoreZoneId(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-slate-900 font-medium text-xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none shadow-2xs transition"
                  >
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-black mb-1.5">اسم صاحب المتجر</label>
                  <input
                    type="text"
                    placeholder="مثال: أبو فهد"
                    value={newStoreOwner}
                    onChange={(e) => setNewStoreOwner(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium text-xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none shadow-2xs transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-black mb-1.5">رقم الهاتف</label>
                <input
                  type="tel"
                  placeholder="0770XXXXXXX"
                  value={newStorePhone}
                  onChange={(e) => setNewStorePhone(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 font-medium text-xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none shadow-2xs transition"
                />
              </div>

              {/* Locked Coordinates Info with Simulator */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex flex-col gap-1.5 text-xs shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                    <Lock className="w-3.5 h-3.5 text-amber-600" />
                    <span>الموقع المثبت: <b className="font-mono text-slate-900">{liveGps.lat.toFixed(5)}, {liveGps.lng.toFixed(5)}</b></span>
                  </div>
                  <span className="text-amber-800 bg-amber-100 border border-amber-300 text-[10px] font-black px-2 py-0.5 rounded-lg">
                    تثبيت GPS تلقائي
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/80">
                  <span className="text-[11px] text-slate-500">للاختبار المكتبي من نفس الغرفة:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const offset = (Math.random() * 0.002 + 0.001) * (Math.random() > 0.5 ? 1 : -1);
                      setLiveGps((prev) => ({ lat: prev.lat + offset, lng: prev.lng + offset }));
                      setNewStoreDuplicateError('');
                      showToast('📍 تم توليد إحداثيات جديدة (+150م) للاختبار المكتبي');
                    }}
                    className="py-1 px-2.5 bg-white hover:bg-slate-100 text-amber-800 border border-amber-300 rounded-xl text-[11px] font-bold shadow-2xs transition active:scale-95 cursor-pointer"
                  >
                    🎲 تغيير الإحداثيات (+150م)
                  </button>
                </div>
              </div>

              {/* Live Camera Capture (Mandatory for first deal) */}
              <div>
                <label className="block text-slate-700 font-black mb-1.5">
                  📸 تصوير واجهة المحل بالكاميرا الحية (إلزامي) *
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={newStoreCameraRef}
                  onChange={handleNewStorePhotoCapture}
                  className="hidden"
                />

                {newStorePhotoBase64 ? (
                  <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-sm">
                    <img src={newStorePhotoBase64} alt="Storefront" className="w-full h-44 object-cover" />
                    <button
                      type="button"
                      onClick={() => newStoreCameraRef.current?.click()}
                      className="absolute bottom-2.5 right-2.5 bg-slate-900/90 hover:bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm transition active:scale-95 cursor-pointer"
                    >
                      إعادة التقاط
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => newStoreCameraRef.current?.click()}
                    className="w-full py-5 bg-slate-50 hover:bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-600 transition-all cursor-pointer shadow-2xs active:scale-99"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 border border-sky-200 flex items-center justify-center">
                      <Camera className="w-5 h-5 text-sky-600 animate-pulse" />
                    </div>
                    <span className="font-black text-xs text-slate-800">فتح الكاميرا لتصوير واجهة المحل</span>
                    <span className="text-[10px] text-slate-400">يلزم التصوير لتوثيق الصفقة وتثبيت الموقع</span>
                  </button>
                )}
              </div>

              {/* Custom Revisit Cycle Input & Fast Presets (e.g. 4, 20 days) */}
              <div className="bg-[#f0f7f3] p-3.5 rounded-2xl border border-[#c2e2d4] text-xs shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <label className="font-black text-[#0E4D38] flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-[#D4AF37]" />
                    <span>تحديد دورة إعادة الزيارة (بالأيام):</span>
                  </label>
                  <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-[#c2e2d4] shadow-2xs">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={newStoreRevisitCycle}
                      onChange={(e) => setNewStoreRevisitCycle(Math.max(1, Number(e.target.value) || 1))}
                      className="w-14 text-center font-black text-[#0E4D38] text-sm focus:outline-none"
                    />
                    <span className="text-[11px] font-bold text-slate-500">يوم</span>
                  </div>
                </div>

                <div className="text-[11px] text-[#0E4D38] font-bold bg-white/70 p-2 rounded-xl border border-[#c2e2d4]/60">
                  🗓️ الزيارة القادمة ستتم تلقائياً بعد <b>{newStoreRevisitCycle} يوماً</b> (بتاريخ:{' '}
                  {new Date(Date.now() + newStoreRevisitCycle * 24 * 60 * 60 * 1000).toLocaleDateString('ar-IQ')})
                </div>
              </div>

              {/* Submit Deal Button & Clear Form */}
              <div className="flex items-center gap-2 pt-1.5">
                <button
                  type="button"
                  onClick={resetAllSessionState}
                  className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs border border-slate-200 shadow-2xs transition active:scale-95 whitespace-nowrap cursor-pointer"
                >
                  مسح الحقول
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black rounded-2xl shadow-md shadow-emerald-600/20 text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>عقد الصفقة وتثبيت المتجر في النظام</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: SKIP STOP (Point 7) */}
      {skipModalOpen && targetStopToSkip && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-5 shadow-2xl">
            <h3 className="text-base font-black text-slate-900 mb-1">تخطي محطة ({targetStopToSkip.store.name})؟</h3>
            <p className="text-xs text-slate-500 font-medium mb-3 leading-relaxed">
              سيتم نقل المتجر لنهاية قائمة مسار اليوم، ويبقى باللون 🔴 الأحمر لاقتراح المتجر التالي فوراً.
            </p>

            <div className="space-y-2 mb-4 text-xs font-bold">
              <label className="block text-slate-700 font-black mb-1.5">سبب التخطي:</label>
              {[
                'محل مغلق',
                'ازدحام مروري خانق',
                'طلب العميل تأجيل الزيارة',
                'عدم توفر صاحب المتجر حالياً'
              ].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setSkipReason(reason)}
                  className={`w-full text-right p-3 rounded-xl border text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                    skipReason === reason
                      ? 'bg-rose-50 border-2 border-rose-400 text-rose-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleConfirmSkip}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl text-xs shadow-sm transition active:scale-95 cursor-pointer"
              >
                تأكيد التخطي
              </button>
              <button
                onClick={() => setSkipModalOpen(false)}
                className="py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs border border-slate-200 shadow-2xs transition active:scale-95 cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: VISIT CHECK-IN (Point 5 & 10) */}
      {visitModalOpen && targetStoreForVisit && (() => {
        const isPostponedStop = routeData?.stops?.find((s: any) => s.id === targetStopIdForVisit)?.status === 'SKIPPED';
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-5 shadow-2xl text-xs">
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-black text-slate-900">{targetStoreForVisit.name}</h3>
                  <div className="mt-1">
                    <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg border ${
                      isPostponedStop
                        ? 'bg-amber-50 text-amber-900 border-amber-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}>
                      {isPostponedStop ? '🤝 عقد صفقة المتجر المؤجل (نطاق 20م ✅)' : 'توثيق الزيارة الدورية (نطاق 20م ✅)'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setVisitModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3.5 mb-4">
                <div>
                  <label className="block text-slate-700 font-black mb-1.5">
                    {isPostponedStop ? 'تفاصيل الاتفاق وعقد الصفقة (اختياري)' : 'ملاحظات الزيارة (اختياري)'}
                  </label>
                  <textarea
                    rows={2}
                    placeholder={isPostponedStop ? 'مثال: تم لقاء صاحب المحل بنجاح وعقد الصفقة لتوريد فحم...' : 'مثال: تم لقاء صاحب المحل واستلام الدفعة النقدية وجدولة الزيارة القادمة...'}
                    value={visitNotes}
                    onChange={(e) => setVisitNotes(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900 font-medium text-xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none shadow-2xs transition"
                  />
                </div>

                {/* Optional Photo Update */}
                <div>
                  <label className="block text-slate-700 font-black mb-1.5">تحديث صورة المحل (اختياري)</label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    ref={revisitCameraRef}
                    onChange={handleRevisitPhotoCapture}
                    className="hidden"
                  />
                  {optionalPhotoBase64 ? (
                    <div className="relative rounded-2xl overflow-hidden border border-emerald-300 shadow-2xs">
                      <img src={optionalPhotoBase64} alt="Revisit" className="w-full h-28 object-cover" />
                      <button
                        type="button"
                        onClick={() => revisitCameraRef.current?.click()}
                        className="absolute bottom-2 right-2 bg-slate-900/80 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg backdrop-blur-xs shadow cursor-pointer"
                      >
                        تغيير الصورة
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => revisitCameraRef.current?.click()}
                      className="w-full py-3 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl flex items-center justify-center gap-2 text-slate-700 font-bold shadow-2xs transition active:scale-98 cursor-pointer"
                    >
                      <Camera className="w-4 h-4 text-sky-600" />
                      <span>التقاط صورة حديثة (إن رغبت)</span>
                    </button>
                  )}
                </div>

                <div className="bg-sky-50 p-2.5 rounded-xl border border-sky-200 text-[11px] text-sky-900 font-medium leading-relaxed shadow-2xs">
                  🔄 بعد الحفظ: يتحول المتجر على الخريطة إلى اللون <b className="text-emerald-700 font-black">الأخضر 🟢</b> وتتم جدولة الزيارة القادمة تلقائياً بعد 14 يوماً.
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleConfirmVisit}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black rounded-2xl text-xs shadow-md shadow-emerald-600/20 transition active:scale-95 cursor-pointer"
                >
                  {isPostponedStop ? '🤝 تأكيد عقد الصفقة والتوثيق ✅' : 'تأكيد تسجيل الزيارة ✅'}
                </button>
                <button
                  onClick={() => setVisitModalOpen(false)}
                  className="py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs border border-slate-200 shadow-2xs transition active:scale-95 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 3: WORKDAY COMPLETION (Point 9) */}
      {completionModalOpen && completionSummary && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-2xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-base font-black text-slate-900 mb-1">تم اكتمال العمل لهذا اليوم بنجاح! 🎉</h3>
            <p className="text-xs text-slate-500 font-medium mb-4">شكراً لجهودك الميدانية في برنامج إدارة وتوزيع الفحم.</p>

            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 mb-5 text-xs shadow-2xs">
              <div>
                <div className="text-slate-500 font-bold text-[10px]">إجمالي المتاجر</div>
                <div className="text-xl font-black text-slate-900 mt-0.5">{completionSummary.totalStops}</div>
              </div>
              <div>
                <div className="text-emerald-700 font-bold text-[10px]">المزارة (أخضر)</div>
                <div className="text-xl font-black text-emerald-700 mt-0.5">{completionSummary.completedCount}</div>
              </div>
              <div>
                <div className="text-rose-700 font-bold text-[10px]">المتخطاة (أحمر)</div>
                <div className="text-xl font-black text-rose-700 mt-0.5">{completionSummary.skippedCount}</div>
              </div>
            </div>

            <button
              onClick={() => setCompletionModalOpen(false)}
              className="w-full py-3 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-black rounded-2xl text-xs shadow-md shadow-sky-600/20 transition active:scale-98 cursor-pointer"
            >
              إغلاق ومتابعة
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MOBILE BOTTOM NAVIGATION BAR                              */}
      {/* ========================================================= */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 py-1.5 px-3 flex items-center justify-around shadow-2xl safe-area-pb">
        {currentUser?.role === 'ADMIN' ? (
          <>
            <button
              onClick={() => setActiveTab('ADMIN_OVERVIEW')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition cursor-pointer ${
                activeTab === 'ADMIN_OVERVIEW' ? 'text-[#0E4D38] font-black scale-105' : 'text-slate-500 font-bold'
              }`}
            >
              <BarChart3 className={`w-5 h-5 ${activeTab === 'ADMIN_OVERVIEW' ? 'text-[#0E4D38]' : 'text-slate-400'}`} />
              <span className="text-[10px]">الإحصائيات</span>
            </button>

            <button
              onClick={() => setActiveTab('ROUTE')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition cursor-pointer ${
                activeTab === 'ROUTE' ? 'text-[#0E4D38] font-black scale-105' : 'text-slate-500 font-bold'
              }`}
            >
              <Navigation className={`w-5 h-5 ${activeTab === 'ROUTE' ? 'text-[#0E4D38]' : 'text-slate-400'}`} />
              <span className="text-[10px]">المراقبة</span>
            </button>

            <button
              onClick={() => setActiveTab('LOCKED_MAP')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition cursor-pointer ${
                activeTab === 'LOCKED_MAP' ? 'text-[#0E4D38] font-black scale-105' : 'text-slate-500 font-bold'
              }`}
            >
              <Lock className={`w-5 h-5 ${activeTab === 'LOCKED_MAP' ? 'text-[#0E4D38]' : 'text-slate-400'}`} />
              <span className="text-[10px]">المقفلة ({lockedStores.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('NEW_STORE')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition cursor-pointer ${
                activeTab === 'NEW_STORE' ? 'text-[#0E4D38] font-black scale-105' : 'text-slate-500 font-bold'
              }`}
            >
              <PlusCircle className={`w-5 h-5 ${activeTab === 'NEW_STORE' ? 'text-[#0E4D38]' : 'text-slate-400'}`} />
              <span className="text-[10px]">متجر جديد</span>
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setActiveTab('ROUTE')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition cursor-pointer ${
                activeTab === 'ROUTE' ? 'text-[#0E4D38] font-black scale-105' : 'text-slate-500 font-bold'
              }`}
            >
              <Navigation className={`w-5 h-5 ${activeTab === 'ROUTE' ? 'text-[#0E4D38]' : 'text-slate-400'}`} />
              <span className="text-[10px]">مساري</span>
            </button>

            <button
              onClick={() => setActiveTab('LOCKED_MAP')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition cursor-pointer ${
                activeTab === 'LOCKED_MAP' ? 'text-[#0E4D38] font-black scale-105' : 'text-slate-500 font-bold'
              }`}
            >
              <Lock className={`w-5 h-5 ${activeTab === 'LOCKED_MAP' ? 'text-[#0E4D38]' : 'text-slate-400'}`} />
              <span className="text-[10px]">المقفلة ({lockedStores.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('NEW_STORE')}
              className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition cursor-pointer ${
                activeTab === 'NEW_STORE' ? 'text-[#0E4D38] font-black scale-105' : 'text-slate-500 font-bold'
              }`}
            >
              <PlusCircle className={`w-5 h-5 ${activeTab === 'NEW_STORE' ? 'text-[#0E4D38]' : 'text-slate-400'}`} />
              <span className="text-[10px]">عقد صفقة</span>
            </button>
          </>
        )}
      </nav>
    </div>
  );
}
