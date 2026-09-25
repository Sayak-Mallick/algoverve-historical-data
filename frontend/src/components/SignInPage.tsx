import { useState, type FormEvent } from "react";

import { useAppDispatch, useAppSelector } from "../app/hooks";
import { clearSessionError, signIn, signUp } from "../features/session/sessionSlice";

type Mode = "signin" | "signup";

const input =
  "h-11 w-full rounded-md border border-line-strong px-3 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-[#1d9bd1] focus:ring-4 focus:ring-[#1d9bd1]/20";

export default function SignInPage() {
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((state) => state.session);
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submitting = status === "submitting";
  const isSignUp = mode === "signup";

  const switchMode = () => {
    setMode(isSignUp ? "signin" : "signup");
    dispatch(clearSessionError());
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSignUp) {
      dispatch(signUp({ name: name.trim(), email: email.trim(), password }));
    } else {
      dispatch(signIn({ email: email.trim(), password }));
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-white px-5 pt-12 pb-10">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-aubergine text-base font-black text-white">
          A
        </span>
        <span className="text-xl font-black text-ink">Algoverve</span>
      </div>

      <h1 className="mt-12 text-center text-[40px] leading-tight font-black tracking-tight text-ink md:text-5xl">
        {isSignUp ? "Create your account" : "Sign in to Algoverve"}
      </h1>
      <p className="mt-3 text-center text-lg text-ink-2">
        {isSignUp
          ? "Then connect your broker to start pulling data."
          : "Use the email you signed up with."}
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex w-full max-w-[400px] flex-col gap-4" noValidate>
        {isSignUp && (
          <label className="flex flex-col gap-1.5">
            <span className="font-bold text-ink">Full name</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)}
              autoComplete="name" required autoFocus />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="font-bold text-ink">Email</span>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com" autoComplete="email" required autoFocus={!isSignUp} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-bold text-ink">Password</span>
          <input className={input} type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignUp ? "new-password" : "current-password"} required minLength={8} />
          {isSignUp && <span className="text-[13px] text-ink-2">At least 8 characters.</span>}
        </label>

        {error && (
          <p role="alert" className="rounded-md border border-danger-line bg-danger-tint px-3 py-2 text-[14px] text-danger">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting}
          className="mt-1 h-11 rounded-md bg-aubergine text-[18px] font-bold text-white hover:bg-aubergine-900 disabled:opacity-60">
          {submitting
            ? isSignUp ? "Creating account…" : "Signing in…"
            : isSignUp ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-[15px] text-ink-2">
        {isSignUp ? "Already have an account?" : "New to Algoverve?"}{" "}
        <button type="button" onClick={switchMode} className="font-bold text-[#1264a3] hover:underline">
          {isSignUp ? "Sign in" : "Create an account"}
        </button>
      </p>
    </div>
  );
}