import { useEffect, useState, type ReactNode } from "react";

import { fetchUserProfile } from "./features/auth/authSlice";
import { loginWithUpstox } from "./services/api";
import { useAppDispatch, useAppSelector } from "./app/hooks";
import "./App.css";

/* ---------- API types ---------- */
export interface BrokerProfile {
  email: string;
  exchanges: string[];
  products: string[];
  broker: string;
  user_id: string;
  user_name: string;
  order_types: string[];
  user_type: string;
  poa: boolean | null;
  ddpi: boolean;
  is_active: boolean;
}

export interface BrokerProfileResponse {
  status: "success" | "error";
  data: BrokerProfile;
}

/* ---------- Broker code → readable labels ---------- */
const SEGMENTS: { label: string; codes: string[] }[] = [
  { label: "Equity", codes: ["NSE", "BSE"] },
  { label: "Futures & options", codes: ["NFO", "BFO"] },
  { label: "Currency", codes: ["CDS", "BCD"] },
  { label: "Commodity", codes: ["MCX"] },
];

const EXCHANGE_NAMES: Record<string, string> = {
  NSE: "NSE Equity",
  BSE: "BSE Equity",
  NFO: "NSE Futures & options",
  BFO: "BSE Futures & options",
  CDS: "NSE Currency",
  BCD: "BSE Currency",
  MCX: "MCX Commodity",
};

const PRODUCT_NAMES: Record<string, string> = {
  I: "Intraday",
  D: "Delivery",
  CO: "Cover order",
  OCO: "One cancels other",
  MTF: "Margin trading",
};

const ORDER_TYPE_NAMES: Record<string, string> = {
  MARKET: "Market",
  LIMIT: "Limit",
  SL: "Stop-loss",
  "SL-M": "Stop-loss market",
};

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

/* ---------- Icons (1.5px stroke, 20px grid) ---------- */
const paths = {
  clock: <><circle cx="10" cy="10" r="7.25" /><path d="M10 6v4l2.5 1.5" /></>,
  search: <><circle cx="9" cy="9" r="5.25" /><path d="m13 13 3.5 3.5" /></>,
  help: <><circle cx="10" cy="10" r="7.25" /><path d="M8 8a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5" /><circle cx="10" cy="14" r=".6" fill="currentColor" /></>,
  compose: <><path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5V11" /><path d="m14 3.5 2.5 2.5L10 12.5H7.5V10z" /></>,
  link: <><path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-.8.8" /><path d="M11.5 8.5a3 3 0 0 0-4.2 0L5 10.8A3 3 0 0 0 9.2 15l.8-.8" /></>,
  layers: <><path d="m10 3.5 6.5 3.25L10 10 3.5 6.75z" /><path d="m3.5 10 6.5 3.25L16.5 10" /><path d="m3.5 13.25 6.5 3.25 6.5-3.25" /></>,
  grid: <><rect x="3.5" y="3.5" width="5" height="5" rx="1" /><rect x="11.5" y="3.5" width="5" height="5" rx="1" /><rect x="3.5" y="11.5" width="5" height="5" rx="1" /><rect x="11.5" y="11.5" width="5" height="5" rx="1" /></>,
  lock: <><rect x="4.5" y="9" width="11" height="8" rx="1.5" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></>,
  caret: <path d="M6 8h8l-4 5z" fill="currentColor" stroke="none" />,
  chevron: <path d="m6.5 8.5 3.5 3.5 3.5-3.5" />,
  refresh: <><path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9" /><path d="M14.5 3.5v3h-3" /></>,
  plus: <path d="M10 4.5v11M4.5 10h11" />,
  alert: <><circle cx="10" cy="10" r="7.25" /><path d="M10 6.5v4.5" /><circle cx="10" cy="13.75" r=".6" fill="currentColor" /></>,
  copy: <><rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" /></>,
  check: <path d="m5 10.5 3 3 7-7" />,
  info: <><circle cx="10" cy="10" r="7.25" /><path d="M10 9v4.5" /><circle cx="10" cy="6.5" r=".6" fill="currentColor" /></>,
} satisfies Record<string, ReactNode>;

type IconName = keyof typeof paths;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

function Icon({ name, size = 20, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={`shrink-0 ${className}`}>
      {paths[name]}
    </svg>
  );
}

/* ---------- Shared class strings ---------- */
const navItem =
  "mx-2 flex h-7 items-center gap-2.5 rounded-md px-3 text-[15px] text-white/70 hover:bg-white/10";
const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded font-bold transition-[background,box-shadow] duration-75 disabled:cursor-default disabled:opacity-50 motion-reduce:transition-none";
const btnPrimary = `${btnBase} h-9 px-4 text-[15px] bg-green text-white hover:bg-green-hover hover:shadow-[0_1px_4px_rgba(0,0,0,0.3)] active:bg-green-press active:shadow-none`;
const btnSecondary = `${btnBase} h-7 px-2.5 text-[13px] border border-line-strong bg-white text-ink hover:bg-surface-2 hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)] active:bg-[#f0f0f0] active:shadow-none`;
const tile = "grid shrink-0 place-items-center bg-[#5a2fc2] font-black text-white";

/* ---------- Small components ---------- */
function Dot({ on, className = "" }: { on: boolean; className?: string }) {
  return (
    <span className={`size-2 rounded-full ${on ? "bg-presence" : "ring-[1.5px] ring-inset ring-current"} ${className}`} />
  );
}

interface RowProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

function Row({ label, hint, children }: RowProps) {
  return (
    <div className="grid gap-1 px-4 py-3.5 md:grid-cols-[180px_1fr] md:gap-4">
      <dt>
        <span className="font-bold">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] text-ink-2">{hint}</span>}
      </dt>
      <dd className="m-0 min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-5">
      <h3 className="mb-2 text-[15px] font-black">{title}</h3>
      <dl className="divide-y divide-line rounded-lg border border-line">{children}</dl>
    </section>
  );
}

function Tag({ children, off = false, title }: { children: ReactNode; off?: boolean; title?: string }) {
  return (
    <span title={title}
      className={`inline-flex items-center gap-1 rounded px-2 py-px text-[13px] font-bold ${off ? "bg-[#f0f0f0] text-ink-3 line-through decoration-ink-3/60" : "bg-green-tint text-green-press"
        }`}>
      {children}
    </span>
  );
}

function CodeTags({ codes, names }: { codes: string[]; names: Record<string, string> }) {
  if (!codes.length) return <span className="text-ink-3">None returned</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {codes.map((c) => (
        <Tag key={c} title={c}>
          {names[c] ?? c}
          {names[c] && <span className="font-normal opacity-70">{c}</span>}
        </Tag>
      ))}
    </div>
  );
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — value is still selectable */
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-bold tracking-wide select-all">{value}</span>
      <button type="button" onClick={copy} aria-label={copied ? "Copied" : `Copy ${value}`}
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[13px] hover:bg-surface-2 ${copied ? "text-green" : "text-ink-2"
          }`}>
        <Icon name={copied ? "check" : "copy"} size={14} />
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

/* ---------- App ---------- */
type Tab = "account" | "access";

const TABS: { id: Tab; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "access", label: "Trading access" },
];

const asProfile = (raw: unknown): BrokerProfile | null => {
  const r = raw as Partial<BrokerProfileResponse> | BrokerProfile | null | undefined;
  if (!r) return null;
  const data = "data" in r ? r.data : (r as BrokerProfile);
  return data && typeof data === "object" ? data : null;
};

function App() {
  const dispatch = useAppDispatch();
  const [tab, setTab] = useState<Tab>("account");

  const { profile, status, error, isAuthenticated } = useAppSelector((state) => state.auth);

  useEffect(() => {
    dispatch(fetchUserProfile());
    const params = new URLSearchParams(window.location.search);
    if (params.has("auth")) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [dispatch]);

  const isLoading = status === "loading";
  const p = asProfile(profile);

  const name = p?.user_name ? titleCase(p.user_name) : "";
  const brokerName = p?.broker ? titleCase(p.broker) : "Upstox";
  const exchanges = p?.exchanges ?? [];
  const products = p?.products ?? [];
  const orderTypes = p?.order_types ?? [];
  const knownCodes = SEGMENTS.flatMap((s) => s.codes);
  const otherExchanges = exchanges.filter((c) => !knownCodes.includes(c));
  const errorMessage = typeof error === "string" ? error : "Unknown error. Try connecting again.";

  return (
    <div className="grid h-screen grid-cols-1 grid-rows-[44px_1fr] md:grid-cols-[260px_1fr]">
      {/* Top bar */}
      <header className="col-span-full grid grid-cols-[auto_1fr_auto] items-center gap-3 bg-aubergine-950 px-3 md:grid-cols-[1fr_minmax(0,720px)_1fr]">
        <div className="flex justify-end">
          <button type="button" aria-label="History"
            className="grid size-7 place-items-center rounded-md text-white/85 hover:bg-white/15 hover:text-white">
            <Icon name="clock" />
          </button>
        </div>

        <label className="group flex h-[26px] items-center justify-center gap-2 rounded-md bg-white/20 px-2.5 text-white ring-1 ring-inset ring-white/10 focus-within:bg-white focus-within:text-ink">
          <Icon name="search" size={16} />
          <input type="search" placeholder="Search Algoverve"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-white/85 group-focus-within:placeholder:text-ink-3" />
        </label>

        <div className="flex items-center justify-end gap-3">
          <button type="button" aria-label="Help"
            className="grid size-7 place-items-center rounded-md text-white/85 hover:bg-white/15 hover:text-white">
            <Icon name="help" />
          </button>
          <div title={name || undefined}
            className="relative grid size-[26px] place-items-center rounded bg-[#e8912d] text-[11px] font-black text-white">
            {isAuthenticated && name ? initials(name) : "?"}
            <span className={`absolute -right-[3px] -bottom-[3px] size-2.5 rounded-full ${isAuthenticated
                ? "bg-presence ring-2 ring-aubergine-950"
                : "bg-aubergine-950 ring-[1.5px] ring-inset ring-white/70"
              }`} />
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside className="hidden overflow-y-auto border-r border-white/10 bg-aubergine-900 text-white/70 md:block">
        <div className="flex h-[49px] items-center justify-between border-b border-white/10 pr-3 pl-4">
          <button type="button"
            className="-ml-1.5 flex items-center gap-0.5 rounded-md px-1.5 py-[3px] text-lg font-black text-white hover:bg-white/10">
            Algoverve <Icon name="chevron" size={16} />
          </button>
          <button type="button" aria-label="New"
            className="grid size-[34px] place-items-center rounded-full bg-white text-aubergine">
            <Icon name="compose" size={18} />
          </button>
        </div>

        <nav className="border-b border-white/10 py-3">
          <a aria-current="page" className={`${navItem} bg-selected text-white hover:bg-selected`}>
            <Icon name="link" size={18} /> Brokers
          </a>
          <a className={navItem}><Icon name="layers" size={18} /> Historical data</a>
          <a className={navItem}><Icon name="grid" size={18} /> Instruments</a>
        </nav>

        <div className="py-3">
          <div className="flex h-7 items-center gap-2 pr-4 pl-[18px]">
            <Icon name="caret" size={16} /> Connections
          </div>
          <a className={navItem}>
            <span className={`${tile} size-5 rounded text-[11px]`}>{brokerName[0]}</span>
            {brokerName}
            <Dot on={isAuthenticated} className="ml-auto" />
          </a>
          <a className={`${navItem} text-white/55`}>
            <span className="grid size-5 place-items-center rounded bg-white/10">
              <Icon name="plus" size={14} />
            </span>
            Add broker
          </a>
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-col overflow-hidden bg-white">
        <div className="flex h-[49px] shrink-0 items-center border-b border-line px-5">
          <h1 className="text-lg font-black">Brokers</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {error && !isAuthenticated && (
            <div role="alert"
              className="mx-auto mb-5 flex max-w-[760px] gap-2.5 rounded-md border border-l-4 border-danger-line border-l-danger bg-danger-tint px-3.5 py-3 text-danger">
              <Icon name="alert" />
              <div>
                <strong className="block text-ink">Couldn’t reach Upstox</strong>
                <p className="mt-0.5 text-[13px] text-ink-2">{errorMessage}</p>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="mx-auto mt-12 flex max-w-[400px] flex-col items-center text-center md:mt-20">
              <div className="mb-5 size-7 animate-spin rounded-full border-[3px] border-line border-t-green motion-reduce:[animation-duration:2.4s]" />
              <h2 className="mb-1.5 text-lg font-black">Checking your Upstox connection</h2>
              <p>This takes a few seconds.</p>
            </div>
          )}

          {!isLoading && !isAuthenticated && (
            <div className="mx-auto mt-12 flex max-w-[400px] flex-col items-center text-center md:mt-20">
              <span className={`${tile} mb-4 size-14 rounded-xl text-2xl`}>U</span>
              <h2 className="mb-1.5 text-lg font-black">Connect Upstox</h2>
              <p className="mb-5">
                You’ll sign in on Upstox to authorize Algoverve. Your credentials stay with Upstox.
              </p>
              <button type="button" className={btnPrimary} onClick={loginWithUpstox}>
                Connect Upstox
              </button>
              <span className="mt-3.5 inline-flex items-center gap-1.5 text-[13px] text-ink-2">
                <Icon name="lock" size={14} /> Secured with OAuth
              </span>
            </div>
          )}

          {!isLoading && isAuthenticated && p && (
            <div className="mx-auto max-w-[760px]">
              {/* Identity header */}
              <div className="flex items-center gap-3 pt-2 pb-4">
                <span className={`${tile} size-12 rounded-lg text-lg`}>{initials(name)}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[22px] leading-tight font-black">{name || p.email}</h2>
                  <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ink-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Dot on={p.is_active} /> {brokerName} {p.is_active ? "connected" : "account inactive"}
                    </span>
                    <span>{p.user_id}</span>
                  </span>
                </div>
                <button type="button" className={btnSecondary}
                  onClick={() => dispatch(fetchUserProfile())} disabled={isLoading}>
                  <Icon name="refresh" size={16} /> Refresh
                </button>
              </div>

              {!p.is_active && (
                <div role="status"
                  className="mb-4 flex gap-2.5 rounded-md border border-l-4 border-[#f2d8a7] border-l-[#e8a723] bg-[#fef8ec] px-3.5 py-3">
                  <Icon name="alert" className="text-[#b37400]" />
                  <p className="text-[13px]">
                    <strong className="block text-[15px]">Your {brokerName} account is inactive</strong>
                    Orders won’t go through until you reactivate it with {brokerName}.
                  </p>
                </div>
              )}

              <div role="tablist" className="flex gap-5 border-b border-line">
                {TABS.map(({ id, label }) => (
                  <button key={id} type="button" role="tab" aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={`relative py-2.5 font-bold hover:text-ink ${tab === id
                        ? "text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-t-sm after:bg-green"
                        : "text-ink-2"
                      }`}>
                    {label}
                  </button>
                ))}
              </div>

              {tab === "account" && (
                <>
                  <Section title="Profile">
                    <Row label="Name">{name || "—"}</Row>
                    <Row label="Client ID"><CopyValue value={p.user_id} /></Row>
                    <Row label="Email">{p.email}</Row>
                    <Row label="Account type">{titleCase(p.user_type)}</Row>
                    <Row label="Status">
                      <span className="inline-flex items-center gap-1.5">
                        <Dot on={p.is_active} /> {p.is_active ? "Active" : "Inactive"}
                      </span>
                    </Row>
                  </Section>

                  <Section title="Holdings authorization">
                    <Row label="DDPI" hint="Lets the broker debit shares you sell">
                      {p.ddpi ? "Enabled" : "Not enabled"}
                    </Row>
                    <Row label="Power of attorney">
                      {p.poa === null ? "Not on file" : p.poa ? "Enabled" : "Not enabled"}
                    </Row>
                    {!p.ddpi && !p.poa && (
                      <div className="flex gap-2 bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
                        <Icon name="info" size={16} className="mt-px" />
                        Selling delivery holdings needs a TPIN approval on {brokerName} each day.
                        Intraday and F&O orders aren’t affected.
                      </div>
                    )}
                  </Section>
                </>
              )}

              {tab === "access" && (
                <>
                  <Section title="Exchanges">
                    {SEGMENTS.map((s) => (
                      <Row key={s.label} label={s.label}>
                        <div className="flex flex-wrap gap-1.5">
                          {s.codes.map((c) => {
                            const on = exchanges.includes(c);
                            return (
                              <Tag key={c} off={!on}
                                title={`${EXCHANGE_NAMES[c] ?? c}${on ? "" : " (not enabled)"}`}>
                                {c}
                              </Tag>
                            );
                          })}
                        </div>
                      </Row>
                    ))}
                    {otherExchanges.length > 0 && (
                      <Row label="Other">
                        <CodeTags codes={otherExchanges} names={EXCHANGE_NAMES} />
                      </Row>
                    )}
                  </Section>

                  <Section title="Orders">
                    <Row label="Products"><CodeTags codes={products} names={PRODUCT_NAMES} /></Row>
                    <Row label="Order types"><CodeTags codes={orderTypes} names={ORDER_TYPE_NAMES} /></Row>
                  </Section>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;