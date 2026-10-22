'use client';

import { LoginForm } from '../components/LoginForm';
import { PANEL, panelAccepts } from '@/lib/tier';

// Same page in both builds: /nextadmin/login admits the superadmin, /staff/login admits ceo/manager/admin.
// Only the superadmin panel links across, so the staff panel never reveals the /nextadmin URL.
export default function LoginPage() {
  return PANEL === 'staff' ? (
    <LoginForm title="ChatAura Staff" accept={panelAccepts} />
  ) : (
    <LoginForm
      title="ChatAura Admin"
      accept={panelAccepts}
      alt={{ href: '/staff/login', label: 'Staff member? Sign in here →' }}
    />
  );
}
