'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Droplet, Plus, Minus } from 'lucide-react';
import { getHospitalContext } from '@/lib/hospitalAuth';
import styles from './inventory.module.css';

export default function InventoryPage() {
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadInventory = async () => {
      const context = await getHospitalContext();
      if (cancelled) return;

      if (!context) {
        setErrorMessage('This account is not assigned to a hospital.');
        setLoading(false);
        return;
      }

      setHospitalId(context.hospital.id);
      await fetchInventory(context.hospital.id);
    };

    loadInventory();

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchInventory = async (hId: string) => {
    setLoading(true);
    setErrorMessage('');
    const { data, error } = await supabase
      .from('hospital_blood_inventory')
      .select('*')
      .eq('hospital_id', hId)
      .order('blood_type');
    
    if (error) setErrorMessage(error.message);
    if (data) setInventory(data);
    setLoading(false);
  };

  const updateUnits = async (bloodType: string, change: number) => {
    if (!hospitalId) return;

    const current = inventory.find(i => i.blood_type === bloodType);
    if (!current) return;
    
    const newUnits = Math.max(0, current.units + change);
    const previousInventory = inventory;

    setInventory(prev => prev.map(i => i.blood_type === bloodType ? { ...i, units: newUnits } : i));

    // Atomic +/- on the server so two staff members (or the accept function reserving a unit) cannot overwrite each other.
    let { error } = await supabase.rpc('adjust_inventory', {
      p_hospital_id: hospitalId,
      p_blood_type: bloodType,
      p_delta: change,
    });
    if (error && (error.code === 'PGRST202' || /adjust_inventory/i.test(error.message))) {
      // RPC not deployed yet: fall back to the old absolute update
      ({ error } = await supabase
        .from('hospital_blood_inventory')
        .update({ units: newUnits })
        .eq('hospital_id', hospitalId)
        .eq('blood_type', bloodType));
    }

    if (error) {
      setInventory(previousInventory);
      setErrorMessage(`Could not update ${bloodType}: ${error.message}`);
    }
  };

  if (loading) return <div>Loading inventory...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2><Droplet size={24} /> Blood Inventory Management</h2>
        <p>Real-time stock of blood units for your hospital.</p>
      </div>

      {errorMessage && (
        <div className={styles.errorMessage} role="alert">
          {errorMessage}
        </div>
      )}

      <div className={styles.grid}>
        {inventory.map(inv => (
          <div key={inv.blood_type} className={`${styles.card} ${inv.units < 5 ? styles.lowStock : ''}`}>
            <div className={styles.bloodType}>{inv.blood_type}</div>
            <div className={styles.unitsDisplay}>
              <span className={styles.unitsNumber}>{inv.units}</span>
              <span className={styles.unitsLabel}>Units</span>
            </div>
            
            <div className={styles.controls}>
              <button 
                className={styles.btn} 
                onClick={() => updateUnits(inv.blood_type, -1)}
                disabled={inv.units === 0}
              >
                <Minus size={18} />
              </button>
              <button 
                className={styles.btn} 
                onClick={() => updateUnits(inv.blood_type, 1)}
              >
                <Plus size={18} />
              </button>
            </div>
            
            {inv.units < 5 && (
              <div className={styles.warning}>Low Stock Warning</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
