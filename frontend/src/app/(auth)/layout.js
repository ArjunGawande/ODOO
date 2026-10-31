import { Brand } from '@/components/shell/Brand';

export default function AuthLayout({ children }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Brand className="text-lg" />
        </div>
        <div className="rounded-lg border border-line bg-surface p-5 sm:p-8">{children}</div>
      </div>
    </main>
  );
}
