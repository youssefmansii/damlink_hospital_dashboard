'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Home, ClipboardList, Droplet, Users, Bell, User, LogOut } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getHospitalContext, type HospitalContext } from '@/lib/hospitalAuth';
import styles from './dashboard.module.css';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [context, setContext] = useState<HospitalContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadContext = async () => {
      const hospitalContext = await getHospitalContext();
      if (cancelled) return;

      if (!hospitalContext) {
        await supabase.auth.signOut();
        router.replace('/login?error=no_staff');
        return;
      }

      setContext(hospitalContext);
      setLoading(false);
    };

    loadContext();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Real number of requests waiting for this hospital (replaces the hard-coded "3").
  useEffect(() => {
    const hospitalId = context?.hospital.id;
    if (!hospitalId) return;
    let cancelled = false;
    const load = async () => {
      const { count } = await supabase
        .from('emergency_requests')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_hospital_id', hospitalId)
        .in('status', ['pending', 'hospital_notified']);
      if (!cancelled) setPendingCount(count ?? 0);
    };
    load();
    const timer = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [context?.hospital.id]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const navItems = [
    { name: 'Dashboard', icon: Home, path: '/dashboard' },
    { name: 'Inventory', icon: Droplet, path: '/dashboard/inventory' },
    { name: 'Requests', icon: ClipboardList, path: '/dashboard/requests' },
    { name: 'Donors', icon: Users, path: '/dashboard/donors' },
  ];

  const displayName =
    (context?.user.user_metadata?.full_name as string | undefined) ||
    context?.user.email ||
    'Hospital Staff';

  if (loading) {
    return <div className={styles.loading}>Loading dashboard...</div>;
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.logoArea}>
          <div className={styles.logoIcon}><Droplet size={20} color="white" /></div>
          <span className={styles.logoText}>DamLink</span>
        </div>
        <div className={styles.headerRight}>
          <Link href="/dashboard/requests" className={styles.notification} aria-label={`Notifications: ${pendingCount} waiting`} style={{ color: 'inherit' }}>
            <Bell size={20} />
            {pendingCount > 0 && <span className={styles.badge}>{pendingCount > 99 ? '99+' : pendingCount}</span>}
          </Link>
          <div className={styles.userProfile}>
            <div className={styles.avatar}><User size={16} /></div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{displayName}</span>
              <span className={styles.userRole}>{context?.hospital.name}</span>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid rgba(255,255,255,0.5)', color: 'inherit', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 13 }}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </header>

      <div className={styles.mainContainer}>
        <aside className={styles.sidebar}>
          <nav className={styles.nav}>
            {navItems.map(item => (
              <Link
                key={item.name}
                href={item.path}
                className={`${styles.navItem} ${pathname === item.path ? styles.active : ''}`}
              >
                <item.icon size={20} className={pathname === item.path ? styles.activeIcon : styles.icon} />
                <span className={styles.navText}>{item.name}</span>
              </Link>
            ))}
          </nav>
        </aside>

        <main className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
