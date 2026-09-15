'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ClipboardList, Clock, CheckCircle } from 'lucide-react';
import { getHospitalContext } from '@/lib/hospitalAuth';

export default function RequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadRequests = async () => {
      const context = await getHospitalContext();
      if (cancelled) return;

      if (!context) {
        setErrorMessage('This account is not assigned to a hospital.');
        setLoading(false);
        return;
      }

      await fetchRequests(context.hospital.id);
    };

    loadRequests();

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchRequests = async (hId: string) => {
    setLoading(true);
    setErrorMessage('');
    const { data, error } = await supabase
      .from('emergency_requests')
      .select('*')
      .eq('assigned_hospital_id', hId)
      .order('created_at', { ascending: false });
    
    if (error) {
      setErrorMessage(error.message);
      setRequests([]);
      setLoading(false);
      return;
    }

    const requestRows = data ?? [];
    const patientIds = Array.from(new Set(requestRows.map((r: any) => r.patient_id).filter(Boolean)));

    if (patientIds.length === 0) {
      setRequests(requestRows);
      setLoading(false);
      return;
    }

    const { data: patients, error: patientsError } = await supabase
      .from('patients')
      .select('id, full_name, blood_type')
      .in('id', patientIds);

    if (patientsError) {
      setErrorMessage(`Requests loaded, but patient details could not be loaded: ${patientsError.message}`);
      setRequests(requestRows);
      setLoading(false);
      return;
    }

    const patientsById = new Map((patients ?? []).map((patient: any) => [patient.id, patient]));
    setRequests(requestRows.map((request: any) => ({
      ...request,
      patients: patientsById.get(request.patient_id) ?? null,
    })));
    setLoading(false);
  };

  if (loading) return <div style={{ padding: '24px' }}>Loading requests...</div>;

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '24px', fontWeight: 600 }}>
          <ClipboardList size={24} /> All Emergency Requests
        </h2>
        <p style={{ color: '#64748b', marginTop: '4px' }}>History and active emergency blood requests assigned to this hospital.</p>
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
              <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Date</th>
              <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Patient</th>
              <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Blood Needed</th>
              <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Urgency</th>
              <th style={{ padding: '16px', fontWeight: 600, color: '#475569' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(req => (
              <tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '16px', color: '#64748b' }}>
                  {new Date(req.created_at).toLocaleString()}
                </td>
                <td style={{ padding: '16px', fontWeight: 500 }}>
                  {req.patients?.full_name || 'Unknown'}
                </td>
                <td style={{ padding: '16px' }}>
                  <span style={{ fontWeight: 700, color: '#dc2626' }}>{req.units_needed} Units</span> of {req.blood_type_needed}
                </td>
                <td style={{ padding: '16px', textTransform: 'capitalize' }}>
                  {req.urgency}
                </td>
                <td style={{ padding: '16px' }}>
                  <span style={{ 
                    padding: '4px 8px', 
                    borderRadius: '16px', 
                    fontSize: '12px', 
                    fontWeight: 600,
                    backgroundColor: req.status === 'resolved' ? '#dcfce7' : '#f1f5f9',
                    color: req.status === 'resolved' ? '#166534' : '#475569'
                  }}>
                    {req.status.replace('_', ' ')}
                  </span>
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                  No requests found for this hospital.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
