import './globals.css';
import './admin-ui.css';
import { PANEL } from '@/lib/tier';

export const metadata = {
  title: PANEL === 'staff' ? 'ChatAura Staff' : 'ChatAura Admin',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
