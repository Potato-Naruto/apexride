import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Glove-friendly button: 56px minimum hit area, high-contrast, no hover-only states. */
export function Btn({
  variant = 'default',
  className = '',
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'danger' | 'ghost' }) {
  const v = {
    default: 'bg-[#1c1c20] text-white border-edge',
    primary: 'bg-apex text-black border-apex font-bold',
    danger: 'bg-warn text-black border-warn font-bold',
    ghost: 'bg-transparent text-white border-edge',
  }[variant];
  return (
    <button
      {...p}
      className={`min-h-tap min-w-tap px-4 rounded-2xl border-2 text-lg flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-40 ${v} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...p}
      className={`min-h-tap w-full px-4 rounded-2xl bg-[#141418] border-2 border-edge text-lg text-white placeholder-neutral-500 focus:border-apex outline-none ${p.className ?? ''}`}
    />
  );
}

export function Chip({ on, children, ...p }: { on: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={`min-h-[48px] px-4 rounded-full border-2 text-base font-semibold ${on ? 'bg-apex text-black border-apex' : 'border-edge text-neutral-200'}`}
    >
      {children}
    </button>
  );
}

export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-sm uppercase tracking-widest text-neutral-400">{title}</h2>
    {children}
  </section>
);
