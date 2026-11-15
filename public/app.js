// حالة التطبيق
let currentTab = 'rep';
let currentOwnerSubTab = 'map';
let currentAuditFilter = 'all';
let repsList = [];
let currentRepId = 1;
let mapInstance = null;
let mapMarkersGroup = null;
let auditLineLayer = null;
let searchTimer = null;
let pickerMapInstance = null;
let pickerMarker = null;
let accuracyCircle = null;
let deferredInstallPrompt = null;

// تشغيل عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  initPWA();
});

// تهيئة تطبيق الهاتف والـ Service Worker
function initPWA() {
  // 1. تسجيل السيرفس ووركر للعمل دون إنترنت
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(() => {
      console.log('✅ تم تسجيل تطبيق الهاتف والعمل بدون إنترنت (PWA Service Worker)');
    }).catch(err => {
      console.log('SW registration error:', err);
    });
  }

  // 2. التحقق من هواتف أندرويد لظهور زر التثبيت
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const btn = document.getElementById('btnInstallApp');
    if (btn) btn.style.display = 'inline-flex';
  });

  // 3. التحقق من أجهزة آيفون
  const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (isIos && !isStandalone) {
    const btn = document.getElementById('btnInstallApp');
    if (btn) btn.style.display = 'inline-flex';
  }

  // 4. استماع لعودة الإنترنت للمزامنة التلقائية
  window.addEventListener('online', () => {
    showToast('📶 عاد الاتصال بالإنترنت! جاري مزامنة السجلات...');
    syncOfflineQueue();
  });
}

// تنفيذ التثبيت عند الضغط على الزر
function promptInstallApp() {
  const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
  if (isIos) {
    document.getElementById('iosInstallModal').style.display = 'flex';
    return;
  }

  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('🎉 تم تثبيت التطبيق بنجاح!');
      }
      deferredInstallPrompt = null;
    });
  } else {
    showToast('💡 لتثبيت التطبيق على الكمبيوتر: اضغط على أيقونة الشاشة (🖥️↓) الموجودة في شريط الرابط بالأعلى!');
  }
}

function showQrModal() {
  document.getElementById('qrModal').style.display = 'flex';
}

function closeQrModal() {
  document.getElementById('qrModal').style.display = 'none';
}

function closeIosModal() {
  document.getElementById('iosInstallModal').style.display = 'none';
}

async function initApp() {
  await loadReps();
  await loadRepData();
  setupDefaultAssignedDay();
  syncOfflineQueue();
}

// 1. التبديل بين واجهة المندوب ولوحة تحكم المالك
function switchTab(tab) {
  currentTab = tab;
  const tabBtnRep = document.getElementById('tabBtnRep');
  const tabBtnOwner = document.getElementById('tabBtnOwner');
  const repSection = document.getElementById('repSection');
  const ownerSection = document.getElementById('ownerSection');

  if (tab === 'rep') {
    tabBtnRep.classList.add('active');
    tabBtnOwner.classList.remove('active');
    repSection.classList.add('active');
    ownerSection.classList.remove('active');
    loadRepData();
  } else {
    tabBtnOwner.classList.add('active');
    tabBtnRep.classList.remove('active');
    ownerSection.classList.add('active');
    repSection.classList.remove('active');
    initOwnerView();
  }
}

// 2. جلب المندوبين وتعبئة القوائم
async function loadReps() {
  try {
    const res = await fetch('/api/reps');
    const json = await res.json();
    if (json.success) {
      repsList = json.data;
      
      const repSelect = document.getElementById('repSelect');
      const filterRep = document.getElementById('filterRep');
      
      repSelect.innerHTML = '';
      filterRep.innerHTML = '<option value="">جميع المندوبين</option>';

      repsList.forEach(rep => {
        const opt1 = document.createElement('option');
        opt1.value = rep.id;
        opt1.textContent = `${rep.name} (${rep.phone || 'بدون هاتف'})`;
        repSelect.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = rep.id;
        opt2.textContent = rep.name;
        filterRep.appendChild(opt2);
      });

      if (repsList.length > 0) {
        currentRepId = repsList[0].id;
      }
    }
  } catch (err) {
    console.error('خطأ في جلب المندوبين:', err);
  }
}

// ضبط اليوم الافتراضي في استمارة الإضافة ليكون نفس اليوم الحالي
function setupDefaultAssignedDay() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDay = days[new Date().getDay()];
  const select = document.getElementById('storeAssignedDay');
  if (select) {
    select.value = todayDay;
  }
}

// 3. واجهة المندوب: جلب خط سير اليوم
async function loadRepData() {
  const repSelect = document.getElementById('repSelect');
  if (repSelect && repSelect.value) {
    currentRepId = repSelect.value;
  }

  const container = document.getElementById('todayStoresList');
  container.innerHTML = '<div style="text-align: center; color: #64748b; padding: 2rem;">جاري تحميل محلات خط السير...</div>';

  try {
    const res = await fetch(`/api/stores/today?rep_id=${currentRepId}`);
    const json = await res.json();

    if (json.success) {
      const { today, stores } = json;

      document.getElementById('todayBannerTitle').textContent = `📅 خط سير اليوم: يوم ${today.dayNameAr}`;
      document.getElementById('todayBannerDate').textContent = `تاريخ اليوم: ${today.date}`;
      document.getElementById('todayTotalCount').textContent = today.totalRequired;
      document.getElementById('todayVisitedCount').textContent = today.visitedCount;
      document.getElementById('todayPendingCount').textContent = today.totalRequired - today.visitedCount;

      renderTodayStores(stores);
    }
  } catch (err) {
    container.innerHTML = '<div style="color: red; text-align: center;">تعذر تحميل محلات اليوم. تأكد من تشغيل السيرفر.</div>';
  }
}

// رسم بطاقات محلات اليوم
function renderTodayStores(stores) {
  const container = document.getElementById('todayStoresList');
  if (!stores || stores.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🎉</div>
        <h4 style="color: #334155;">لا توجد محلات مجدولة لزيارة هذا اليوم لهذا المندوب</h4>
        <p style="color: #64748b; font-size: 0.85rem; margin-top: 0.3rem;">
          يمكنك الضغط على زر "تسجيل محل جديد" أعلاه لحفظ أي محل تزوره اليوم، وسيصبح مجدولاً تلقائياً في نفس هذا اليوم أسبوعياً!
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  stores.forEach((store, index) => {
    const isVisited = store.visited_today > 0;
    const card = document.createElement('div');
    card.className = `store-card ${isVisited ? 'visited' : 'pending'}`;

    card.innerHTML = `
      <div class="store-card-header">
        <div>
          <span style="font-size: 0.8rem; color: #64748b; font-weight: bold; margin-left: 0.3rem;">#${index + 1}</span>
          <span class="store-name">${store.name}</span>
        </div>
        <span class="badge-status ${isVisited ? 'visited' : 'pending'}">
          ${isVisited ? `تمت الزيارة الساعة ${store.last_visit_time}` : 'بانتظار الزيارة اليوم ⏳'}
        </span>
      </div>

      <div class="store-details">
        <div>👤 المسؤول: ${store.owner_name || 'غير محدد'} | 📞 الهاتف: ${store.phone ? `<a href="tel:${store.phone}">${store.phone}</a>` : 'لا يوجد'}</div>
        <div>📍 العنوان: ${store.address_notes || 'مسجل عبر الـ GPS'}</div>
        <div style="font-family: monospace; font-size: 0.8rem; color: #475569;">
          الإحداثيات: Lat: ${store.latitude.toFixed(6)}, Lng: ${store.longitude.toFixed(6)}
        </div>
      </div>

      <div class="store-actions">
        ${!isVisited ? `
          <button class="btn btn-success" onclick="checkInStore(${store.id}, '${store.name}', ${store.latitude}, ${store.longitude})">
            ✅ تسجيل وصول (Check-in GPS)
          </button>
        ` : `
          <span style="color: #059669; font-weight: 600; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.3rem;">
            ✓ تم تسجيل الوصول وحفظ التاريخ
          </span>
        `}

        <a href="https://www.google.com/maps/dir/?api=1&destination=${store.latitude},${store.longitude}" 
           target="_blank" class="btn btn-outline">
          🗺️ فتح في الخريطة والتوجيه
        </a>
      </div>
    `;

    container.appendChild(card);
  });
}

// 4. التقاط موقع GPS الحالي للمندوب
function captureCurrentLocation() {
  const statusBox = document.getElementById('gpsStatusBox');
  const statusText = document.getElementById('gpsStatusText');
  const display = document.getElementById('gpsCoordsDisplay');
  const btnSubmit = document.getElementById('btnSubmitStore');
  const latInput = document.getElementById('storeLat');
  const lngInput = document.getElementById('storeLng');

  statusText.textContent = '⏳ جاري الاتصال بالأقمار الصناعية وحساس الـ GPS...';
  statusBox.classList.remove('captured');

  if (!navigator.geolocation) {
    statusText.textContent = '❌ جهازك أو متصفحك لا يدعم خاصية تحديد المواقع GPS';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy = Math.round(position.coords.accuracy);

      latInput.value = lat;
      lngInput.value = lng;

      statusBox.classList.add('captured');
      
      // فحص دقة الإشارة: إذا كانت أكثر من 100 متر (مثل الكمبيوتر أو ضعف الـ GPS)
      if (accuracy > 100) {
        statusText.innerHTML = `⚠️ <b>دقة الإشارة ضعيفة (±${accuracy} متر)</b>: هذا يحدث على الكمبيوتر لعدم وجود حساس GPS فضائي. تم فتح الخريطة لتسحب الدبوس إلى مكانك الصحيح.`;
        statusBox.style.borderColor = '#f59e0b';
        statusBox.style.background = '#fffbeb';
      } else {
        statusText.innerHTML = `✅ <b>دقة ممتازة (±${accuracy} متر)</b>: متصل بالأقمار الصناعية GPS مباشرة.`;
        statusBox.style.borderColor = '#10b981';
        statusBox.style.background = '#ecfdf5';
      }

      display.innerHTML = `خط العرض: <b>${lat.toFixed(6)}</b> | خط الطول: <b>${lng.toFixed(6)}</b>`;
      btnSubmit.removeAttribute('disabled');
      
      if (accuracy > 100) {
        showToast(`تنبيه: الدقة تقريبية (±${accuracy} م)، اسحب الدبوس لموقعك الدقيق.`);
      } else {
        showToast('تم التقاط إحداثيات الـ GPS بدقة عالية!');
      }

      // إظهار الخريطة المصغرة لتمكين المندوب من تدقيق وتعديل المكان بدقة
      showPickerMap(lat, lng, accuracy);
    },
    (error) => {
      let errMsg = 'تعذر التقاط الموقع.';
      if (error.code === error.PERMISSION_DENIED) {
        errMsg = 'يرجى السماح للتطبيق بالوصول لموقعك الجغرافي (Location Permission).';
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        errMsg = 'إشارة الـ GPS غير متوفرة حالياً، تأكد من تشغيل الموقع بالهاتف.';
      } else if (error.code === error.TIMEOUT) {
        errMsg = 'استغرق جلب الموقع وقتاً طويلاً، حاول مجدداً.';
      }
      statusText.textContent = `⚠️ ${errMsg}`;
      showToast(errMsg);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

// عرض الخريطة المصغرة لتعديل وتدقيق مكان المحل
function showPickerMap(lat, lng, accuracy = 0) {
  const mapEl = document.getElementById('pickerMap');
  const hintEl = document.getElementById('pickerMapHint');
  const searchEl = document.getElementById('pickerSearchWrapper');
  mapEl.style.display = 'block';
  hintEl.style.display = 'block';
  if (searchEl) searchEl.style.display = 'block';

  if (!pickerMapInstance) {
    pickerMapInstance = L.map('pickerMap').setView([lat, lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }).addTo(pickerMapInstance);

    pickerMarker = L.marker([lat, lng], { draggable: true }).addTo(pickerMapInstance);

    pickerMarker.on('dragend', function (e) {
      const pos = e.target.getLatLng();
      updateSelectedCoords(pos.lat, pos.lng);
      if (accuracyCircle) {
        pickerMapInstance.removeLayer(accuracyCircle);
        accuracyCircle = null;
      }
    });

    pickerMapInstance.on('click', function (e) {
      pickerMarker.setLatLng(e.latlng);
      updateSelectedCoords(e.latlng.lat, e.latlng.lng);
      if (accuracyCircle) {
        pickerMapInstance.removeLayer(accuracyCircle);
        accuracyCircle = null;
      }
    });
  } else {
    pickerMapInstance.setView([lat, lng], 15);
    pickerMarker.setLatLng([lat, lng]);
  }

  // رسم دائرة دقة الخطأ إن كانت كبيرة (مثل 5000 متر أو 2500 متر على الكمبيوتر)
  if (accuracyCircle && pickerMapInstance) {
    pickerMapInstance.removeLayer(accuracyCircle);
    accuracyCircle = null;
  }
  if (accuracy > 100) {
    accuracyCircle = L.circle([lat, lng], {
      radius: accuracy,
      color: '#f59e0b',
      fillColor: '#f59e0b',
      fillOpacity: 0.12,
      weight: 1
    }).addTo(pickerMapInstance);
    pickerMapInstance.fitBounds(accuracyCircle.getBounds(), { padding: [20, 20], maxZoom: 15 });
  }

  setTimeout(() => {
    pickerMapInstance.invalidateSize();
  }, 250);
}

function updateSelectedCoords(lat, lng) {
  document.getElementById('storeLat').value = lat;
  document.getElementById('storeLng').value = lng;
  document.getElementById('gpsCoordsDisplay').innerHTML = `خط العرض: <b>${lat.toFixed(6)}</b> | خط الطول: <b>${lng.toFixed(6)}</b> <span style="color:#2563eb;">(تم ضبطه يدوياً)</span>`;
}

async function searchMapLocation() {
  const query = document.getElementById('mapSearchInput').value.trim();
  if (!query) return;
  showToast('🔍 جاري البحث في الخريطة...');
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ' بغداد')}&format=json&limit=1`, {
      headers: { 'Accept-Language': 'ar' }
    });
    const data = await res.json();
    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      pickerMapInstance.setView([lat, lng], 16);
      pickerMarker.setLatLng([lat, lng]);
      updateSelectedCoords(lat, lng);
      if (accuracyCircle) {
        pickerMapInstance.removeLayer(accuracyCircle);
        accuracyCircle = null;
      }
      showToast(`تم الانتقال إلى: ${data[0].name || query}`);
    } else {
      showToast('لم يتم العثور على المكان، يمكنك تحريك الخريطة يدوياً.');
    }
  } catch (err) {
    showToast('حدث خطأ أثناء البحث في الخريطة.');
  }
}

// تبديل إظهار استمارة إضافة محل جديد
function toggleAddStoreForm() {
  const formWrapper = document.getElementById('addStoreFormWrapper');
  const isHidden = formWrapper.style.display === 'none' || formWrapper.style.display === '';
  formWrapper.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    setupDefaultAssignedDay();
  }
}

// 5. حفظ المحل الجديد في قاعدة البيانات
async function handleSaveStore(e) {
  e.preventDefault();
  const name = document.getElementById('storeName').value.trim();
  const owner_name = document.getElementById('storeOwner').value.trim();
  const phone = document.getElementById('storePhone').value.trim();
  const assigned_day = document.getElementById('storeAssignedDay').value;
  const address_notes = document.getElementById('storeNotes').value.trim();
  const latitude = document.getElementById('storeLat').value;
  const longitude = document.getElementById('storeLng').value;

  if (!latitude || !longitude) {
    showToast('يرجى التقاط إحداثيات الـ GPS أولاً بالضغط على الزر الأخضر!');
    return;
  }

  try {
    const payload = {
      name,
      owner_name,
      phone,
      assigned_day,
      address_notes,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      rep_id: parseInt(currentRepId)
    };

    if (!navigator.onLine) {
      queueOfflineStore(payload);
      return;
    }

    const res = await fetch('/api/stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (json.success) {
      showToast(json.message);
      resetStoreForm();
      loadRepData();
    } else {
      showToast(json.message || 'حدث خطأ أثناء الحفظ');
    }
  } catch (err) {
    // في حال تعذر الاتصال، نحفظ محلياً
    queueOfflineStore({
      name,
      owner_name,
      phone,
      assigned_day,
      address_notes,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      rep_id: parseInt(currentRepId)
    });
  }
}

function resetStoreForm() {
  document.getElementById('addStoreForm').reset();
  document.getElementById('gpsStatusText').textContent = '📍 لم يتم التقاط إحداثيات GPS بعد';
  document.getElementById('gpsCoordsDisplay').innerHTML = '';
  document.getElementById('gpsStatusBox').classList.remove('captured');
  document.getElementById('btnSubmitStore').setAttribute('disabled', 'true');
  document.getElementById('pickerMap').style.display = 'none';
  document.getElementById('pickerMapHint').style.display = 'none';
  if (document.getElementById('pickerSearchWrapper')) document.getElementById('pickerSearchWrapper').style.display = 'none';
  toggleAddStoreForm();
}

function queueOfflineStore(payload) {
  const queue = JSON.parse(localStorage.getItem('offline_stores') || '[]');
  queue.push(payload);
  localStorage.setItem('offline_stores', JSON.stringify(queue));
  showToast('💾 لا يوجد إنترنت: تم حفظ المحل وموقعه في ذاكرة الهاتف وسيُرسل تلقائياً عند عودة النت!');
  resetStoreForm();
}

function queueOfflineVisit(payload) {
  const queue = JSON.parse(localStorage.getItem('offline_visits') || '[]');
  queue.push(payload);
  localStorage.setItem('offline_visits', JSON.stringify(queue));
  showToast('💾 لا يوجد إنترنت: تم تسجيل الوصول في الهاتف وسيُرسل للأونر فور توفر النت!');
}

async function syncOfflineQueue() {
  // 1. مزامنة المحلات
  const storesQueue = JSON.parse(localStorage.getItem('offline_stores') || '[]');
  if (storesQueue.length > 0) {
    for (const item of storesQueue) {
      try {
        await fetch('/api/stores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        });
      } catch (e) {
        console.error('فشل مزامنة محل:', e);
      }
    }
    localStorage.removeItem('offline_stores');
    showToast(`✓ تم رفع ${storesQueue.length} محلات كانت مسجلة بدون إنترنت!`);
    loadRepData();
  }

  // 2. مزامنة الزيارات
  const visitsQueue = JSON.parse(localStorage.getItem('offline_visits') || '[]');
  if (visitsQueue.length > 0) {
    for (const item of visitsQueue) {
      try {
        await fetch('/api/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        });
      } catch (e) {
        console.error('فشل مزامنة زيارة:', e);
      }
    }
    localStorage.removeItem('offline_visits');
    showToast(`✓ تم رفع ${visitsQueue.length} زيارات مؤجلة!`);
    loadRepData();
  }
}

// 6. تسجيل وصول لمحل قائم (Check-in) مع التحقق من إحداثيات المندوب الحالية
function checkInStore(storeId, storeName, targetLat, targetLng) {
  if (!navigator.geolocation) {
    confirmCheckIn(storeId, storeName, null, null);
    return;
  }

  showToast('📡 جاري التحقق من موقعك الحالي لتسجيل الوصول...');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      confirmCheckIn(storeId, storeName, pos.coords.latitude, pos.coords.longitude);
    },
    () => {
      // في حال تعذر أخذ الإحداثيات الحالية، نسجل الزيارة بالإحداثيات المتاحة
      confirmCheckIn(storeId, storeName, null, null);
    },
    { enableHighAccuracy: true, timeout: 7000 }
  );
}

async function confirmCheckIn(storeId, storeName, repLat, repLng) {
  const payload = {
    store_id: storeId,
    rep_id: parseInt(currentRepId),
    rep_lat: repLat,
    rep_lng: repLng,
    notes: 'زيارة ميدانية دورية'
  };

  if (!navigator.onLine) {
    queueOfflineVisit(payload);
    return;
  }

  try {
    const res = await fetch('/api/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (json.success) {
      showToast(json.message);
      loadRepData();
    } else {
      showToast(json.message || 'فشل تسجيل الوصول');
    }
  } catch (err) {
    queueOfflineVisit(payload);
  }
}

// ==============================================
// 7. لوحة تحكم المالك (OWNER DASHBOARD)
// ==============================================
async function initOwnerView() {
  await loadOwnerStats();
  initOrUpdateMap();
  await loadOwnerStores();
  await loadVisitsAudit();
}

async function loadOwnerStats() {
  try {
    const res = await fetch('/api/dashboard/stats');
    const json = await res.json();
    if (json.success) {
      const { stats } = json;
      document.getElementById('metricTotalStores').textContent = stats.totalStores;
      document.getElementById('metricTodayTarget').textContent = stats.todayTarget;
      document.getElementById('metricTodayCompleted').textContent = stats.todayCompleted;
      
      const compEl = document.getElementById('metricComplianceRate');
      if (compEl) compEl.textContent = `${stats.complianceRate || 100}%`;

      const suspEl = document.getElementById('metricSuspiciousVisits');
      if (suspEl) suspEl.textContent = stats.suspiciousVisits || 0;
    }
  } catch (err) {
    console.error('خطأ في تحميل إحصائيات المالك:', err);
  }
}

// التبديل بين تبويبات المالك الفرعية (الخريطة vs سجل التدقيق الجغرافي)
function switchOwnerSubTab(subTab) {
  currentOwnerSubTab = subTab;
  const mapBtn = document.getElementById('subTabMapBtn');
  const auditBtn = document.getElementById('subTabAuditBtn');
  const mapView = document.getElementById('ownerMapView');
  const auditView = document.getElementById('ownerAuditView');

  if (subTab === 'map') {
    mapBtn.classList.add('active');
    auditBtn.classList.remove('active');
    mapView.style.display = 'block';
    auditView.style.display = 'none';
    if (mapInstance) {
      setTimeout(() => mapInstance.invalidateSize(), 200);
    }
  } else {
    auditBtn.classList.add('active');
    mapBtn.classList.remove('active');
    auditView.style.display = 'block';
    mapView.style.display = 'none';
    loadVisitsAudit(currentAuditFilter);
  }
}

// فلترة سجل التدقيق
function setAuditFilter(filter) {
  currentAuditFilter = filter;
  document.getElementById('auditFilterAll').classList.toggle('active', filter === 'all');
  document.getElementById('auditFilterValid').classList.toggle('active', filter === 'valid');
  document.getElementById('auditFilterSuspicious').classList.toggle('active', filter === 'suspicious');
  loadVisitsAudit(filter);
}

// جلب وعرض سجل تدقيق الزيارات وكشف التلاعب (الخيار الذكي)
async function loadVisitsAudit(filter = 'all') {
  const tbody = document.getElementById('ownerVisitsAuditTableBody');
  if (!tbody) return;

  try {
    let url = '/api/visits';
    if (filter === 'suspicious') url += '?suspicious=true';

    const res = await fetch(url);
    const json = await res.json();

    if (json.success) {
      let visits = json.data;
      if (filter === 'valid') {
        visits = visits.filter(v => v.distance_meters <= 150);
      }
      renderVisitsAuditTable(visits);
    }
  } catch (err) {
    console.error('خطأ في جلب سجل التدقيق:', err);
  }
}

function renderVisitsAuditTable(visits) {
  const tbody = document.getElementById('ownerVisitsAuditTableBody');
  tbody.innerHTML = '';

  if (!visits || visits.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #64748b; padding: 2rem;">لا توجد سجلات زيارات مطابقة</td></tr>';
    return;
  }

  visits.forEach((v, idx) => {
    const isOut = v.distance_meters > 150;
    const distanceKm = (v.distance_meters / 1000).toFixed(1);
    const tr = document.createElement('tr');
    if (isOut) tr.className = 'tr-fraud';

    const distanceDisplay = isOut 
      ? `<span class="badge-status fraud">🚨 خارج النطاق (${distanceKm} كم / ${v.distance_meters} م)</span>`
      : `<span class="badge-status visited">✓ داخل النطاق (${v.distance_meters} م)</span>`;

    const statusDisplay = isOut
      ? `<span style="color: #dc2626; font-weight: 800; font-size: 0.82rem;">⚠️ زيارة مشبوهة (بعيد عن المحل)</span>`
      : `<span style="color: #059669; font-weight: 700; font-size: 0.82rem;">✓ موثقة جغرافياً</span>`;

    const canInspect = v.store_lat && v.store_lng && v.rep_lat && v.rep_lng;

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><b>${v.store_name}</b></td>
      <td>🧑‍💼 ${v.rep_name || 'غير محدد'}</td>
      <td>${v.visit_day_ar} <small style="color: #64748b;">(${v.visit_date})</small></td>
      <td style="font-family: monospace; font-weight: bold;">${v.visit_time}</td>
      <td>${distanceDisplay}</td>
      <td>${statusDisplay}</td>
      <td>
        ${canInspect ? `
          <button class="btn btn-outline" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;" 
                  onclick="inspectVisitOnMap(${v.store_lat}, ${v.store_lng}, ${v.rep_lat}, ${v.rep_lng}, '${v.store_name}', '${v.rep_name || 'المندوب'}', ${v.distance_meters})">
            🔍 فحص مكان المندوب
          </button>
        ` : `
          <span style="color: #94a3b8; font-size: 0.75rem;">-</span>
        `}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// رسم خط الفحص الجغرافي وكشف التلاعب بين مكان المحل ومكان المندوب الحقيقي
function inspectVisitOnMap(storeLat, storeLng, repLat, repLng, storeName, repName, distanceMeters) {
  switchOwnerSubTab('map');
  document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' });

  if (!mapInstance) return;

  if (auditLineLayer) {
    mapInstance.removeLayer(auditLineLayer);
  }

  auditLineLayer = L.layerGroup().addTo(mapInstance);

  // 1. دبوس المحل الحقيقي
  const storeMarker = L.marker([storeLat, storeLng]).bindPopup(`
    <div style="direction: rtl; text-align: right;">
      <h4 style="color: #1e3a8a; margin: 0 0 4px 0;">🏪 ${storeName}</h4>
      <p style="font-size: 0.85rem; color: #475569; margin: 0;">هذا هو الموقع الحقيقي للمحل المعتمد بقاعدة البيانات</p>
    </div>
  `).addTo(auditLineLayer);

  // 2. دبوس موقع المندوب الحقيقي لحظة ضغطه الزر
  const repMarker = L.circleMarker([repLat, repLng], {
    radius: 10,
    color: '#dc2626',
    fillColor: '#ef4444',
    fillOpacity: 0.9,
    weight: 3
  }).bindPopup(`
    <div style="direction: rtl; text-align: right;">
      <h4 style="color: #dc2626; margin: 0 0 4px 0;">📍 موقع ${repName} الفعلي</h4>
      <p style="font-size: 0.85rem; color: #1e293b; margin: 0;">
        <b>المندوب ضغط "تسجيل وصول" من هنا!</b><br>
        المسافة عن المحل: <b>${distanceMeters > 1000 ? (distanceMeters/1000).toFixed(2) + ' كم' : distanceMeters + ' متر'}</b>
      </p>
    </div>
  `).addTo(auditLineLayer);

  // 3. رسم خط منقط بين النقطتين
  const line = L.polyline([[storeLat, storeLng], [repLat, repLng]], {
    color: '#dc2626',
    weight: 3,
    dashArray: '6, 8',
    opacity: 0.85
  }).addTo(auditLineLayer);

  mapInstance.fitBounds(line.getBounds(), { padding: [60, 60], maxZoom: 15 });
  repMarker.openPopup();
  showToast(`⚠️ تم كشف المسافة: المندوب يبعد ${distanceMeters} متر عن المحل!`);
}

function initOrUpdateMap() {
  if (!mapInstance) {
    // مركز افتراضي (مثلاً بغداد: 33.3152, 44.3661)
    mapInstance = L.map('map').setView([33.3152, 44.3661], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(mapInstance);

    mapMarkersGroup = L.layerGroup().addTo(mapInstance);
  }

  setTimeout(() => {
    mapInstance.invalidateSize();
  }, 200);
}

function refreshOwnerMap() {
  loadOwnerStores();
}

function debounceSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    loadOwnerStores();
  }, 300);
}

async function loadOwnerStores() {
  const day = document.getElementById('filterDay').value;
  const repId = document.getElementById('filterRep').value;
  const search = document.getElementById('filterSearch').value.trim();

  let url = `/api/stores?`;
  if (day) url += `day=${encodeURIComponent(day)}&`;
  if (repId) url += `rep_id=${encodeURIComponent(repId)}&`;
  if (search) url += `search=${encodeURIComponent(search)}&`;

  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.success) {
      const stores = json.data;
      document.getElementById('storesCountBadge').textContent = `${stores.length} محل`;
      renderOwnerTable(stores);
      renderMapMarkers(stores);
    }
  } catch (err) {
    console.error('خطأ في جلب بيانات المحلات للمالك:', err);
  }
}

function renderMapMarkers(stores) {
  if (!mapMarkersGroup) return;
  mapMarkersGroup.clearLayers();
  if (auditLineLayer) {
    mapInstance.removeLayer(auditLineLayer);
    auditLineLayer = null;
  }

  if (stores.length === 0) return;

  const latLngs = [];

  stores.forEach(s => {
    if (s.latitude && s.longitude) {
      const marker = L.marker([s.latitude, s.longitude]);
      
      const popupHtml = `
        <div style="direction: rtl; text-align: right; min-width: 180px;">
          <h4 style="margin: 0 0 5px 0; color: #1e3a8a;">${s.name}</h4>
          <div style="font-size: 0.85rem; color: #334155;">
            <div>👤 المسؤول: ${s.owner_name || 'غير مسجل'}</div>
            <div>📞 الهاتف: ${s.phone || 'غير مسجل'}</div>
            <div>📅 يوم الزيارة: <b>${s.assigned_day_ar}</b></div>
            <div>🧑‍💼 المندوب: ${s.rep_name || 'غير محدد'}</div>
            <div>📍 الإحداثيات: ${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}</div>
            ${s.last_visit ? `<div style="color: #059669; font-size: 0.8rem; margin-top: 4px;">✓ آخر زيارة: ${s.last_visit}</div>` : '<div style="color: #d97706; font-size: 0.8rem; margin-top: 4px;">لم تتم زيارته مؤخراً</div>'}
          </div>
          <div style="margin-top: 8px;">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}" target="_blank" 
               style="display: inline-block; background: #2563eb; color: white; padding: 4px 8px; border-radius: 4px; text-decoration: none; font-size: 0.75rem;">
              🗺️ فتح المسار في خرائط Google
            </a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);
      mapMarkersGroup.addLayer(marker);
      latLngs.push([s.latitude, s.longitude]);
    }
  });

  if (latLngs.length > 0) {
    mapInstance.fitBounds(latLngs, { padding: [40, 40], maxZoom: 15 });
  }
}

function renderOwnerTable(stores) {
  const tbody = document.getElementById('ownerStoresTableBody');
  tbody.innerHTML = '';

  if (stores.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #64748b; padding: 2rem;">لا توجد نتائج مطابقة</td></tr>';
    return;
  }

  stores.forEach((s, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><b>${s.name}</b></td>
      <td>${s.owner_name || '-'}</td>
      <td>${s.phone ? `<a href="tel:${s.phone}">${s.phone}</a>` : '-'}</td>
      <td><span style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; font-weight: bold;">${s.assigned_day_ar}</span></td>
      <td style="font-family: monospace; font-size: 0.8rem;">${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}</td>
      <td>${s.rep_name || '-'}</td>
      <td>${s.last_visit ? `<span style="color: #059669; font-size: 0.8rem;">${s.last_visit}</span>` : '<span style="color: #94a3b8; font-size: 0.8rem;">جديد</span>'}</td>
      <td>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${s.latitude},${s.longitude}" 
           target="_blank" class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">
          🗺️ الخريطة
        </a>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// عرض رسالة سريعة Toast
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3500);
}
