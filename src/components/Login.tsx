import React, { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Eye, EyeOff, Image as ImageIcon, Loader2 } from "lucide-react";

interface LoginProps {
  onLoginSuccess: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const VALID_USERNAME = "BSCIT-05-0250/2021";
  const VALID_PASSWORD = "0p9o8i7u6y";

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const trimmedUsername = username.trim().toUpperCase();
    const trimmedPassword = password.trim();

    setTimeout(() => {
      if (trimmedUsername === VALID_USERNAME && trimmedPassword === VALID_PASSWORD) {
        sessionStorage.setItem("isAuthenticated", "true");
        onLoginSuccess();
      } else {
        setError("Invalid credentials. Please try again.");
        setPassword("");
      }
      setIsLoading(false);
    }, 500);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && username && password) {
      handleLogin(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#030507] px-4 py-8 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(59,130,246,0.16),transparent_28%),radial-gradient(circle_at_82%_12%,rgba(14,165,233,0.09),transparent_24%),linear-gradient(180deg,#06080d_0%,#030303_100%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:64px_64px]" />
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-blue-950/20 to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative z-10 w-full max-w-[380px]"
      >
        <div className="mb-5 flex items-center justify-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl border border-blue-400/30 bg-blue-500 shadow-[0_18px_50px_rgba(37,99,235,0.28)]">
            <ImageIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold tracking-tight text-white">Photo Studio</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.35em] text-neutral-500">AI Editor</p>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[#0d1118]/90 p-5 shadow-[0_35px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
          <div className="mb-7">
            <div className="mb-4 h-px w-16 bg-gradient-to-r from-blue-400 to-transparent" />
            <h1 className="text-[28px] font-bold tracking-tight text-white">Welcome Back</h1>
            <p className="mt-1 text-sm text-neutral-500">Sign in to continue editing your studio assets.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="username" className="mb-2 block text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="BSCIT-05-0250/2021"
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder:text-neutral-700 transition focus:border-blue-400/60 focus:bg-white/[0.07]"
                disabled={isLoading}
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter password"
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 pr-12 text-sm text-white placeholder:text-neutral-700 transition focus:border-blue-400/60 focus:bg-white/[0.07]"
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-xl border border-white/10 bg-black/30 p-0 text-neutral-400 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  disabled={isLoading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3"
              >
                <p className="text-xs font-medium text-red-300">{error}</p>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={isLoading || !username || !password}
              className="group mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-blue-400/30 bg-blue-500 px-4 text-[11px] font-black uppercase tracking-[0.22em] text-white shadow-[0_18px_50px_rgba(37,99,235,0.22)] transition hover:bg-blue-400 disabled:border-white/10 disabled:bg-white/[0.05] disabled:text-neutral-600 disabled:shadow-none"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking
                </>
              ) : (
                <>
                  Enter Studio
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between border-t border-white/6 pt-4">
            <span className="text-[9px] font-semibold uppercase tracking-[0.28em] text-neutral-600">OpenCV Ready</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.7)]" />
          </div>
        </div>
      </motion.div>
    </div>
  );
};
