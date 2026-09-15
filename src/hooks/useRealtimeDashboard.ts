import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useRealtimeDashboard(hospitalId: string | null, refreshKey = 0) {
  const [requests, setRequests] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [dashboardError, setDashboardError] = useState('');

  useEffect(() => {
    if (!hospitalId) {
      setRequests([]);
      setInventory([]);
      setDispatches([]);
      setIsConnected(false);
      setDashboardError('');
      return;
    }

    const fetchData = async () => {
      setDashboardError('');

      const { data: reqData, error: reqError } = await supabase
        .from('emergency_requests')
        .select('*')
        .eq('assigned_hospital_id', hospitalId)
        .neq('status', 'resolved')
        .neq('status', 'expired')
        .order('created_at', { ascending: false });

      if (reqError) {
        console.error('[useRealtimeDashboard] requests fetch failed:', reqError);
        setDashboardError(reqError.message);
        setRequests([]);
        setDispatches([]);
        return;
      }

      const requestRows = reqData ?? [];
      const patientIds = Array.from(new Set(requestRows.map((r: any) => r.patient_id).filter(Boolean)));
      let activeRequests = requestRows;

      if (patientIds.length > 0) {
        const { data: patientData, error: patientError } = await supabase
          .from('patients')
          .select('id, full_name, dob, photo_url, medical_conditions, blood_type')
          .in('id', patientIds);

        if (patientError) {
          console.warn('[useRealtimeDashboard] patient enrichment failed:', patientError);
          setDashboardError(`Requests loaded, but patient details could not be loaded: ${patientError.message}`);
        } else {
          const patientsById = new Map((patientData ?? []).map((p: any) => [p.id, p]));
          activeRequests = requestRows.map((request: any) => ({
            ...request,
            patients: patientsById.get(request.patient_id) ?? null,
          }));
        }
      }

      setRequests(activeRequests);

      const { data: invData, error: invError } = await supabase
        .from('hospital_blood_inventory')
        .select('*')
        .eq('hospital_id', hospitalId);

      if (invError) {
        console.warn('[useRealtimeDashboard] inventory fetch failed:', invError);
        setDashboardError((current) => current || invError.message);
      }
      
      setInventory(invData ?? []);

      const requestIds = activeRequests.map(r => r.id);
      if (requestIds.length > 0) {
        const { data: rawDispatches, error: dispatchError } = await supabase
          .from('donor_dispatches')
          .select('*')
          .in('request_id', requestIds)
          .neq('status', 'completed')
          .neq('status', 'no_show');

        if (dispatchError) {
          console.warn('[useRealtimeDashboard] dispatch fetch failed:', dispatchError);
          setDashboardError((current) => current || dispatchError.message);
          setDispatches([]);
          return;
        }

        const dispatchRows = rawDispatches ?? [];
        const donorIds = Array.from(new Set(dispatchRows.map((d: any) => d.donor_user_id).filter(Boolean)));

        if (donorIds.length === 0) {
          setDispatches(dispatchRows);
        } else {
          const [profilesResult, donorProfilesResult] = await Promise.all([
            supabase.from('profiles').select('id, full_name, phone, blood_type').in('id', donorIds),
            supabase.from('donor_profiles').select('user_id, location, reliability_rating, donations_count').in('user_id', donorIds),
          ]);

          const profilesById = new Map((profilesResult.data ?? []).map((p: any) => [p.id, p]));
          const donorProfilesById = new Map((donorProfilesResult.data ?? []).map((p: any) => [p.user_id, p]));

          setDispatches(dispatchRows.map((d: any) => ({
            ...d,
            profiles: profilesById.get(d.donor_user_id) ?? null,
            donor_profiles: donorProfilesById.get(d.donor_user_id) ?? null,
          })));
        }
      } else {
        setDispatches([]);
      }
    };

    fetchData();

    // Realtime Subscriptions
    const reqSub = supabase.channel('requests_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'emergency_requests', filter: `assigned_hospital_id=eq.${hospitalId}` },
        () => fetchData()
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    const invSub = supabase.channel('inventory_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospital_blood_inventory', filter: `hospital_id=eq.${hospitalId}` },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            setInventory(prev => {
              const exists = prev.find(i => i.blood_type === payload.new.blood_type);
              if (exists) return prev.map(i => i.blood_type === payload.new.blood_type ? payload.new : i);
              return [...prev, payload.new];
            });
          }
        }
      )
      .subscribe();
      
    // Dispatches realtime is harder to filter strictly by hospital_id since it's on request_id
    const dispSub = supabase.channel('dispatches_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'donor_dispatches' },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reqSub);
      supabase.removeChannel(invSub);
      supabase.removeChannel(dispSub);
    };
  }, [hospitalId, refreshKey]);

  return { requests, inventory, dispatches, isConnected, dashboardError };
}
