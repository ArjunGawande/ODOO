import './globals.css';

export const metadata = {
  title: { default: 'Brightloop', template: '%s | Brightloop' },
  description: 'Subscription billing for Brightloop Software.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
