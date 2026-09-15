'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRealtimeDashboard } from '@/hooks/useRealtimeDashboard';
import { Activity, Clock, Droplet, Users, AlertCircle } from 'lucide-react';
import styles from './dashboard-home.module.css';
import RequestDetailModal from '@/components/RequestDetailModal';
import { getHospitalContext } from '@/lib/hospitalAuth';
import { parseDbPoint } from '@/lib/geo';

// Dynamically import Map with SSR disabled
const Map = dynamic(() => import('@/components/Map'), { ssr: false });

export default function DashboardHome() {
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [hospitalLocation, setHospitalLocation] = useState<[number, number]>([30.0444, 31.2357]);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getHospitalContext().then((context) => {
      if (cancelled) return;
      setHospitalId(context?.hospital.id ?? null);
      const position = parseDbPoint(context?.hospital.location);
      if (position) setHospitalLocation(position);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const { requests, inventory, dispatches, isConnected } = useRealtimeDashboard(hospitalId, refreshKey);

  // Stats
  const activeRequests = requests.length;
  const criticalRequests = requests.filter(r => r.urgency === 'critical').length;
  const activeDispatches = dispatches.length;
  const availableInventory = inventory.reduce((acc, curr) => acc + (curr.units || 0), 0);

  // Map Markers
  const markers = [
    ...requests.map(r => {
      const position = parseDbPoint(r.location);
      return position
        ? {
            position,
            type: 'request',
            label: `Request: ${r.blood_type_needed} - ${r.urgency}`
          }
        : null;
    }).filter(Boolean),
    ...dispatches.map(d => {
      const position = parseDbPoint(d.donor_profiles?.location);
      return position
        ? {
            position,
            type: 'donor',
            label: `Donor: ${d.profiles?.full_name || 'Matched donor'}`
          }
        : null;
    }).filter(Boolean)
  ];

  return (
    <div className={styles.container}>
      {!isConnected && (
        <div className={styles.offlineBanner}>
          <AlertCircle size={16} /> Connection lost. Trying to reconnect to Realtime...
        </div>
      )}

      {/* Summary Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ backgroundColor: '#FEE2E2', color: '#EF4444' }}>
            <Activity size={24} />
          </div>
          <div className={styles.statInfo}>
            <h3>Active Requests</h3>
            <p className={styles.statValue}>{activeRequests} <span className={styles.statDetail}>({criticalRequests} critical)</span></p>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ backgroundColor: '#DBEAFE', color: '#2563EB' }}>
            <Users size={24} />
          </div>
          <div className={styles.statInfo}>
            <h3>Active Dispatches</h3>
            <p className={styles.statValue}>{activeDispatches} <span className={styles.statDetail}>donors matched</span></p>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ backgroundColor: '#D1FAE5', color: '#10B981' }}>
            <Droplet size={24} />
          </div>
          <div className={styles.statInfo}>
            <h3>Total Inventory</h3>
            <p className={styles.statValue}>{availableInventory} <span className={styles.statDetail}>units</span></p>
          </div>
        </div>
      </div>

      <div className={styles.mainContent}>
        <div className={styles.mapSection}>
          <div className={styles.sectionHeader}>
            <h3>Live Map Overview</h3>
          </div>
          <div className={styles.mapWrapper}>
             <Map center={hospitalLocation} zoom={12} markers={markers} />
          </div>
        </div>

        <div className={styles.feedSection}>
          <div className={styles.sectionHeader}>
            <h3>Active Requests Feed</h3>
          </div>
          <div className={styles.feedList}>
            {requests.length === 0 ? (
              <div className={styles.emptyState}>No active emergency requests right now.</div>
            ) : (
              requests.map((req) => (
                <div key={req.id} className={styles.feedItem}>
                  <div className={styles.feedItemHeader}>
                    <span className={`${styles.urgencyBadge} ${styles[req.urgency]}`}>
                      {req.urgency.toUpperCase()}
                    </span>
                    <span className={styles.timeAgo}>
                      <Clock size={12} /> {new Date(req.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  </div>
                  <div className={styles.feedItemBody}>
                    <div className={styles.patientInfo}>
                      <h4>{req.patients?.full_name || 'Unidentified Patient'}</h4>
                      <p>Needs {req.units_needed} Unit{req.units_needed > 1 ? 's' : ''} of <strong>{req.blood_type_needed}</strong></p>
                    </div>
                  </div>
                  <div className={styles.feedItemFooter}>
                    <span className={styles.statusBadge}>{req.status.replace('_', ' ')}</span>
                    <button className={styles.viewBtn} onClick={() => setSelectedRequest(req)}>View Details</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {selectedRequest && (
        <RequestDetailModal 
          request={selectedRequest} 
          dispatches={dispatches} 
          onChanged={() => setRefreshKey((key) => key + 1)}
          onClose={() => setSelectedRequest(null)} 
        />
      )}
    </div>
  );
}
