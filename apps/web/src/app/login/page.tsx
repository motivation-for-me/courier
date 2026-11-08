'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AccountLogin } from '../../components/account-login';
import { getSession, type AuthSession } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (getSession()) router.replace('/');
    else setChecked(true);
  }, [router]);

  if (!checked) return null;
  return <AccountLogin onAuthenticated={(_session: AuthSession) => router.replace('/')} />;
}
