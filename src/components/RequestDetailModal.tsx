'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckCircle2, MapPin, Clock, FileText, Users, X, AlertTriangle, User, MessageSquare } from 'lucide-react';
import styles from './modal.module.css';

export default function RequestDetailModal({ request, onClose, onChanged }: any) {
  const [loading, setLoading] = useState(false);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [requestDispatches, setRequestDispatches] = useState<any[]>([]);

  useEffect(() => {
    if (!request?.id) return;
    let cancelled = false;

    const loadRequestDispatches = async () => {
      setDispatchLoading(true);

      const { data, error } = await supabase.rpc('get_hospital_request_dispatches', {
        p_request_id: request.id,
      });

      if (error) {
        console.error('[RequestDetailModal] dispatch fetch failed:', error);
        if (!cancelled) {
          setErrorMessage(error.message);
          setRequestDispatches([]);
          setDispatchLoading(false);
        }
        return;
      }

      const rows = (data ?? []).map((d: any) => ({
        ...d,
        profiles: {
          full_name: d.donor_full_name,
          phone: d.donor_phone,
          blood_type: d.donor_blood_type,
        },
        donor_profiles: {
          reliability_rating: d.donor_reliability_rating,
          donations_count: d.donor_donations_count,
        },
      }));

      if (!cancelled) {
        setRequestDispatches(rows);
        setDispatchLoading(false);
      }
    };

    loadRequestDispatches();

    return () => {
      cancelled = true;
    };
  }, [request?.id]);

  if (!request) return null;

  const handleAction = async (action: string) => {
    setLoading(true);
    setErrorMessage('');
    
    try {
      if (action === 'accept') {
        const { error } = await supabase.rpc('accept_hospital_request', {
          p_request_id: request.id,
        });
        if (error) throw error;
      } 
      else if (action === 'decline') {
        const { error } = await supabase.functions.invoke('reroute-request', {
          body: { request_id: request.id }
        });
        if (error) throw error;
      }
      else if (action === 'no_blood') {
        const { error } = await supabase
          .from('emergency_requests')
          .update({ status: 'donor_matching' })
          .eq('id', request.id);
        if (error) throw error;

        const { error: invokeErr } = await supabase.functions.invoke('match-donors', {
          body: { request_id: request.id }
        });
        if (invokeErr) throw invokeErr;
      }
      
      onChanged?.();
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Could not update this request.');
    } finally {
      setLoading(false);
    }
  };

  const dispatchToDonor = async (dispatchId: string) => {
    const { error } = await supabase
      .from('donor_dispatches')
      .update({ status: 'notified' })
      .eq('id', dispatchId);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    onChanged?.();
  };

  const confirmDonation = async (dispatchId: string) => {
    setConfirmingId(dispatchId);
    setErrorMessage('');

    try {
      const { error } = await supabase.rpc('confirm_donor_donation', {
        p_dispatch_id: dispatchId,
      });
      if (error) throw error;
      onChanged?.();
      onClose();
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Could not confirm this donation.');
    } finally {
      setConfirmingId(null);
    }
  };

  const activeDispatches = requestDispatches.filter((d: any) =>
    d.request_id === request.id && !['declined', 'completed', 'no_show'].includes(d.status)
  );
  const canManageDonors = ['donor_matching', 'donor_dispatched'].includes(request.status);
  const canChooseHospitalAction = ['pending', 'hospital_notified', 'donor_matching', 'donor_dispatched'].includes(request.status);

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <AlertTriangle className={styles.alertIcon} />
            <h2>Emergency Alert</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X /></button>
        </div>
        
        <div className={styles.urgencyBanner}>
          <AlertTriangle size={16} /> {request.urgency.toUpperCase()}: Blood Request
        </div>

        <div className={styles.content}>
          {errorMessage && (
            <div className={styles.errorBanner} role="alert">
              <AlertTriangle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          {canManageDonors && (
            <div className={styles.infoBanner}>
              <Users size={16} />
              <span>
                This request is currently being sent to nearby donors. If hospital blood becomes available, you can still accept it here. Otherwise, decline it to reroute to the next compatible hospital.
              </span>
            </div>
          )}

          <div className={styles.grid}>
            {/* Patient Info */}
            <div className={styles.card}>
              <div className={styles.patientHeader}>
                <div className={styles.patientPhoto}>
                   {request.patients?.photo_url ? (
                     <img src={request.patients.photo_url} alt="Patient" />
                   ) : (
                     <User size={40} color="#94a3b8" />
                   )}
                </div>
                <div className={styles.patientInfo}>
                  <h3>{request.patients?.full_name || 'Unidentified'}</h3>
                  <p>Blood type: <strong>{request.blood_type_needed}</strong></p>
                </div>
              </div>
            </div>

            {/* Medical History */}
            <div className={styles.card}>
              <h4 className={styles.cardTitle}><FileText size={16} /> Medical History</h4>
              <ul className={styles.list}>
                {request.patients?.medical_conditions?.map((c: string, i: number) => (
                  <li key={i}>{c}</li>
                )) || <li>No known history</li>}
              </ul>
            </div>

            {/* Accident Details */}
            <div className={styles.card}>
              <h4 className={styles.cardTitle}><MapPin size={16} /> Accident Details</h4>
              <p className={styles.meta}><MapPin size={14} /> Location: Check Map</p>
              <p className={styles.meta}><Clock size={14} /> Received: {new Date(request.created_at).toLocaleTimeString()}</p>
            </div>

            {/* Witness Description */}
            <div className={styles.card}>
              <h4 className={styles.cardTitle}><MessageSquare size={16} /> Witness Description</h4>
              <p className={styles.text}>{request.accident_notes || 'No notes provided by bystander.'}</p>
            </div>
          </div>

          {canManageDonors && (
            <div className={styles.donorSection}>
              <h4>Best Matches for {request.blood_type_needed}</h4>
              {dispatchLoading ? (
                <p className={styles.emptyDonors}>Loading donor responses...</p>
              ) : activeDispatches.length === 0 ? (
                <p className={styles.emptyDonors}>No donor responses yet. Accepted donors will appear here for hospital confirmation.</p>
              ) : (
                <div className={styles.donorList}>
                  {activeDispatches.map((d: any) => (
                    <div key={d.id} className={styles.donorItem}>
                      <div>
                        <h5>{d.profiles?.full_name || `Donor ${String(d.donor_user_id || '').slice(0, 8)}`}</h5>
                        <p>
                          Status: {d.status.replace('_', ' ')}
                          {typeof d.donor_profiles?.reliability_rating === 'number' ? ` | Rating: ${d.donor_profiles.reliability_rating} ★` : ''}
                          {typeof d.match_score === 'number' ? ` | Score: ${d.match_score}` : ''}
                        </p>
                      </div>
                      <div>
                        {d.status === 'accepted' || d.status === 'en_route' ? (
                          <button
                            onClick={() => confirmDonation(d.id)}
                            className={styles.confirmBtn}
                            disabled={confirmingId === d.id}
                          >
                            <CheckCircle2 size={14} />
                            {confirmingId === d.id ? 'CONFIRMING' : 'CONFIRM DONATION'}
                          </button>
                        ) : d.status === 'notified' ? (
                          <span className={styles.badgeNotified}>Notified</span>
                        ) : (
                          <button onClick={() => dispatchToDonor(d.id)} className={styles.dispatchBtn}>DISPATCH</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {canManageDonors && (
              <span className={styles.matchingText}><Users size={16} /> Sending request to nearby donors...</span>
            )}
          </div>
          <div className={styles.actions}>
            <button onClick={() => handleAction('decline')} className={styles.btnSecondary} disabled={loading || !canChooseHospitalAction}>Decline</button>
            <button onClick={() => handleAction('accept')} className={styles.btnPrimary} disabled={loading || !canChooseHospitalAction}>Accept</button>
            <button onClick={() => handleAction('no_blood')} className={styles.btnOutline} disabled={loading || !canChooseHospitalAction}>No Blood Available</button>
          </div>
        </div>
      </div>
    </div>
  );
}
