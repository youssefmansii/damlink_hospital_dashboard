'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MapPin, Clock, FileText, Users, X, AlertTriangle, User, MessageSquare } from 'lucide-react';
import styles from './modal.module.css';

export default function RequestDetailModal({ request, onClose, dispatches, onChanged }: any) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
        const { error } = await supabase
          .from('emergency_requests')
          .update({ status: 'declined' })
          .eq('id', request.id);
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
    if (error) console.error(error);
  };

  const activeDispatches = dispatches.filter((d: any) => d.request_id === request.id);

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

          {request.status === 'donor_matching' && activeDispatches.length > 0 && (
            <div className={styles.donorSection}>
              <h4>Best Matches for {request.blood_type_needed}</h4>
              <div className={styles.donorList}>
                {activeDispatches.map((d: any) => (
                  <div key={d.id} className={styles.donorItem}>
                    <div>
                      <h5>{d.profiles?.full_name}</h5>
                      <p>Rating: {d.donor_profiles?.reliability_rating} ★ | Score: {d.match_score}</p>
                    </div>
                    <div>
                      {d.status === 'notified' ? (
                        <span className={styles.badgeNotified}>Notified</span>
                      ) : (
                        <button onClick={() => dispatchToDonor(d.id)} className={styles.dispatchBtn}>DISPATCH</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {request.status === 'donor_matching' && (
              <span className={styles.matchingText}><Users size={16} /> Sending request to nearby donors...</span>
            )}
          </div>
          <div className={styles.actions}>
            <button onClick={() => handleAction('decline')} className={styles.btnSecondary} disabled={loading}>Decline</button>
            <button onClick={() => handleAction('accept')} className={styles.btnPrimary} disabled={loading}>Accept</button>
            <button onClick={() => handleAction('no_blood')} className={styles.btnOutline} disabled={loading}>No Blood Available</button>
          </div>
        </div>
      </div>
    </div>
  );
}
