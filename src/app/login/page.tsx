import {
  BarChart3,
  Boxes,
  CheckCircle2,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
  Wrench,
} from "lucide-react";
import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const features = [
  {
    icon: Boxes,
    title: "Smart Inventory",
    description: "Track stock, barcodes and product movements in real time.",
  },
  {
    icon: Wrench,
    title: "Repair Management",
    description: "Manage repair jobs from device receipt to final delivery.",
  },
  {
    icon: BarChart3,
    title: "Business Insights",
    description: "Monitor sales, expenses, repair income and profitability.",
  },
];

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen bg-slate-950">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/10" />
          <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-full bg-white/10" />

          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-lg">
              <Smartphone size={25} />
            </div>

            <div>
              <h1 className="text-xl font-bold">InfoAxon POS</h1>
              <p className="text-sm text-blue-100">
                Repair & Retail Management
              </p>
            </div>
          </div>

          <div className="relative z-10 max-w-xl">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-blue-100">
              One system. Complete control.
            </p>

            <h2 className="text-4xl font-bold leading-tight xl:text-5xl">
              Run your sales, repairs and inventory with confidence.
            </h2>

            <p className="mt-6 max-w-lg text-lg leading-8 text-blue-100">
              A complete business management platform designed for mobile,
              electronics and repair shops.
            </p>

            <div className="mt-10 space-y-5">
              {features.map((feature) => {
                const Icon = feature.icon;

                return (
                  <div key={feature.title} className="flex gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                      <Icon size={21} />
                    </div>

                    <div>
                      <h3 className="font-semibold">{feature.title}</h3>
                      <p className="mt-1 text-sm text-blue-100">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative z-10 flex items-center gap-2 text-sm text-blue-100">
            <ShieldCheck size={18} />
            Securely powered by InfoAxon Software Solutions
          </div>
        </section>

        <section className="flex items-center justify-center bg-slate-50 px-5 py-12 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Smartphone size={23} />
              </div>

              <div>
                <h1 className="font-bold">InfoAxon POS</h1>
                <p className="text-xs text-slate-500">
                  Repair & Retail Management
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/60 sm:p-10">
              <div className="mb-8">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <LockKeyhole size={23} />
                </div>

                <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                  Welcome back
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Enter your account details to access the management system.
                </p>
              </div>

              {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <LoginForm />

              <div className="mt-7 flex items-center justify-center gap-2 border-t border-slate-100 pt-6 text-xs text-slate-500">
                <CheckCircle2 size={15} className="text-emerald-500" />
                Authorized users only
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-slate-400">
              © 2026 InfoAxon Software Solutions. All rights reserved.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}