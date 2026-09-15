'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Star } from 'lucide-react';
import { getHospitalContext } from '@/lib/hospitalAuth';

export default function DonorsPage() {
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const fetchDonorsForHospital = async () => {
      setLoading(true);
      setErrorMessage('');

      const context = await getHospitalContext();
      if (!context) {
        setErrorMessage('This account is not assigned to a hospital.');
        setLoading(false);
        return;
      }

      const { data: requests, error: requestError } = await supabase
        .from('emergency_requests')
        .select('id')
        .eq('assigned_hospital_id', context.hospital.id);

      if (cancelled) return;

      if (requestError) {
        setErrorMessage(requestError.message);
        setLoading(false);
        return;
      }

      const requestIds = requests?.map((request) => request.id) ?? [];
      if (requestIds.length === 0) {
        setDispatches([]);
        setLoading(false);
        return;
      }

      const { data: rawDispatches, error } = await supabase
        .from('donor_dispatches')
        .select(
          `
            *,
            emergency_requests(blood_type_needed, status, created_at)
          `
        )
        .in('request_id', requestIds)
        .limit(50);

      if (cancelled) return;

      if (error) {
        setErrorMessage(error.message);
        setDispatches([]);
        setLoading(false);
        return;
      }

      const dispatchRows = rawDispatches ?? [];
      const donorIds = Array.from(new Set(dispatchRows.map((dispatch: any) => dispatch.donor_user_id).filter(Boolean)));

      if (donorIds.length === 0) {
        setDispatches(dispatchRows);
        setLoading(false);
        return;
      }

      const [profilesResult, donorProfilesResult] = await Promise.all([
        supabase.from('profiles').select('id, full_name, blood_type, phone').in('id', donorIds),
        supabase.from('donor_profiles').select('user_id, reliability_rating, donations_count, last_donation_date').in('user_id', donorIds),
      ]);

      if (cancelled) return;

      if (profilesResult.error || donorProfilesResult.error) {
        setErrorMessage(profilesResult.error?.message || donorProfilesResult.error?.message || 'Could not load donor details.');
      }

      const profilesById = new Map((profilesResult.data ?? []).map((profile: any) => [profile.id, profile]));
      const donorProfilesById = new Map((donorProfilesResult.data ?? []).map((profile: any) => [profile.user_id, profile]));
      const enrichedDispatches = dispatchRows
        .map((dispatch: any) => ({
          ...dispatch,
          profiles: profilesById.get(dispatch.donor_user_id) ?? null,
          donor_profiles: donorProfilesById.get(dispatch.donor_user_id) ?? null,
        }))
        .sort((a: any, b: any) => {
          const aTime = new Date(a.emergency_requests?.created_at ?? 0).getTime();
          const bTime = new Date(b.emergency_requests?.created_at ?? 0).getTime();
          return bTime - aTime;
        });

      setDispatches(enrichedDispatches);
      setLoading(false);
    };

    fetchDonorsForHospital();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div style={{ padding: '24px' }}>Loading dispatched donors...</div>;

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '24px', fontWeight: 600 }}>
          <Users size={24} /> Dispatched Donors
        </h2>
        <p style={{ color: '#64748b', marginTop: '4px' }}>
          Donors matched to emergency requests assigned to this hospital.
        </p>
      </div>

      {errorMessage && (
        <div style={{
          backgroundColor: '#FEF2F2',
          border: '1px solid #FCA5A5',
          borderRadius: '8px',
          color: '#B91C1C',
          padding: '12px 14px',
          marginBottom: '16px'
        }} role="alert">
          {errorMessage}
        </div>
      )}

      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Name</th>
              <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Blood Type</th>
              <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Request</th>
              <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Dispatch Status</th>
              <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Rating</th>
              <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Donations</th>
            </tr>
          </thead>
          <tbody>
            {dispatches.map(dispatch => (
              <tr key={dispatch.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '16px', fontWeight: 500 }}>
                  {dispatch.profiles?.full_name || 'Unknown donor'}
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{dispatch.profiles?.phone || 'No phone'}</div>
                </td>
                <td style={{ padding: '16px', fontWeight: 700, color: '#dc2626' }}>
                  {dispatch.profiles?.blood_type || 'Unknown'}
                </td>
                <td style={{ padding: '16px', color: '#475569' }}>
                  {dispatch.emergency_requests?.blood_type_needed || 'Unknown'} needed
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    {dispatch.emergency_requests?.status?.replace('_', ' ') || 'Unknown request status'}
                  </div>
                </td>
                <td style={{ padding: '16px', textTransform: 'capitalize' }}>
                  {dispatch.status.replace('_', ' ')}
                </td>
                <td style={{ padding: '16px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Star size={14} color="#eab308" fill="#eab308" /> {dispatch.donor_profiles?.reliability_rating ?? 'N/A'}
                  </span>
                </td>
                <td style={{ padding: '16px' }}>
                  {dispatch.donor_profiles?.donations_count ?? 0}
                </td>
              </tr>
            ))}
            {dispatches.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                  No donors have been dispatched for this hospital yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
