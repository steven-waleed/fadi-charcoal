import Dexie, { type Table } from 'dexie';

export interface OfflineStop {
  id: number;
  routeId: number;
  storeId: number;
  sequenceOrder: number;
  status: string;
  isAdHoc: boolean;
  store: {
    id: number;
    name: string;
    ownerName?: string;
    phone?: string;
    latitude: number;
    longitude: number;
    debt: number;
    preferredCharcoal: string;
    zone: {
      id: number;
      name: string;
    };
  };
}

export interface SyncQueueItem {
  id?: number;
  storeId: number;
  repId: number;
  routeStopId?: number;
  storeName: string;
  repLat?: number;
  repLng?: number;
  distanceMeters: number;
  charcoalBags: number;
  charcoalType: string;
  cashCollected: number;
  notes?: string;
  overrideReason?: string;
  photoBase64?: string;
  photoUrl?: string;
  timestamp: string;
  status: 'pending_sync' | 'synced' | 'failed';
}

export class FadiMobileDatabase extends Dexie {
  cachedStops!: Table<OfflineStop, number>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super('FadiCharcoalPWA_DB');
    this.version(1).stores({
      cachedStops: 'id, routeId, sequenceOrder, status',
      syncQueue: '++id, status, timestamp',
    });
  }
}

export const db = new FadiMobileDatabase();
