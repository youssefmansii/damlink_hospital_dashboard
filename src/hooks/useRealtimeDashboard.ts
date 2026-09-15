import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useRealtimeDashboard(hospitalId: string | null, refreshKey = 0) {
  const [requests, setRequests] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [dispatches, setDispatches] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    if (!hospitalId) {
      setRequests([]);
      setInventory([]);
      setDispatches([]);
      setIsConnected(false);
      return;
    }

    const fetchData = async () => {
      const { data: reqData } = await supabase
        .from('emergency_requests')
        .select(`
          *,
          patients (
            full_name,
            dob,
            photo_url,
            medical_conditions,
            blood_type
          )
        `)
        .eq('assigned_hospital_id', hospitalId)
        .neq('status', 'resolved')
        .neq('status', 'expired')
        .order('created_at', { ascending: false });
      
      const activeRequests = reqData ?? [];
      setRequests(activeRequests);

      const { data: invData } = await supabase
        .from('hospital_blood_inventory')
        .select('*')
        .eq('hospital_id', hospitalId);
      
      setInventory(invData ?? []);

      const requestIds = activeRequests.map(r => r.id);
      if (requestIds.length > 0) {
        const { data: dispData } = await supabase
          .from('donor_dispatches')
          .select(`
            *,
            profiles(full_name, phone, blood_type),
            donor_profiles(location, reliability_rating, donations_count)
          `)
          .in('request_id', requestIds)
          .neq('status', 'completed')
          .neq('status', 'no_show');
        setDispatches(dispData ?? []);
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

  return { requests, inventory, dispatches, isConnected };
}
