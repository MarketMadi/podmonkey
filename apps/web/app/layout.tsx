import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Podmonkey — Kubernetes cost estimator',
  description:
    'Paste Kubernetes YAML. Compare monthly planning estimates across AWS, GCP, Azure, and Hetzner.',
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
