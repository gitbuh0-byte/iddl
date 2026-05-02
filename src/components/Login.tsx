import React, { useState } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, LogIn, Lock } from "lucide-react";

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

    // Simulate a small delay for better UX
    setTimeout(() => {
      if (trimmedUsername === VALID_USERNAME && trimmedPassword === VALID_PASSWORD) {
        // Store authentication in sessionStorage
        sessionStorage.setItem("isAuthenticated", "true");
        onLoginSuccess();
      } else {
        setError("Invalid credentials. Please try again.");
        setPassword("");
      }
      setIsLoading(false);
    }, 500);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && username && password) {
      handleLogin(e as any);
    }
  };

  return (
    <div className="min-h-screen bg-black overflow-hidden flex items-center justify-center p-4 relative">
      {/* Animated background grid */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-blue-900/20" />
      <svg className="absolute inset-0 w-full h-full opacity-10 pointer-events-none">
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(0, 255, 255, 0.5)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Animated orbs */}
      <motion.div
        className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-purple-500/30 blur-3xl"
        animate={{
          y: [0, 30, 0],
          x: [0, 20, 0],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-blue-500/30 blur-3xl"
        animate={{
          y: [0, -30, 0],
          x: [0, -20, 0],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Main content */}
      <div className="relative z-10 w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="relative"
        >
          {/* Glowing border effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/50 via-blue-500/50 to-purple-500/50 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          {/* Glassmorphic card */}
          <div className="relative backdrop-blur-2xl bg-white/5 border border-white/20 rounded-2xl p-8 shadow-2xl">
            {/* Decorative elements */}
            <div className="absolute top-0 right-0 w-1 h-1/3 bg-gradient-to-b from-purple-500 to-transparent" />
            <div className="absolute bottom-0 left-0 w-1/3 h-1 bg-gradient-to-r from-blue-500 to-transparent" />

            {/* Header */}
            <div className="text-center mb-8">
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
                className="inline-block p-4 rounded-full mb-4 bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/50 shadow-lg shadow-purple-500/25"
              >
                <Lock className="w-8 h-8 text-purple-400" />
              </motion.div>
              
              <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-4xl font-black mb-2 bg-gradient-to-r from-purple-400 via-blue-400 to-purple-400 bg-clip-text text-transparent tracking-wider"
              >
                TRY YOUR LUCK
              </motion.h1>
              
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-purple-300/70 text-sm font-mono tracking-widest"
              >
                &gt; SECURE_ACCESS_REQUIRED
              </motion.p>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Username Input */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
              >
                <label htmlFor="username" className="block text-xs font-bold text-purple-400/80 mb-3 tracking-widest">
                  ACCESS_CODE
                </label>
                <div className="relative group">
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="ENTER_CREDENTIALS..."
                    className="w-full px-4 py-3 bg-white/10 backdrop-blur border border-purple-400/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent focus:bg-white/20 transition-all duration-300 text-white placeholder-purple-400/30 font-mono text-sm"
                    disabled={isLoading}
                  />
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-purple-500/0 via-transparent to-blue-500/0 group-focus-within:from-purple-500/10 group-focus-within:to-blue-500/10 pointer-events-none transition-all duration-300" />
                </div>
              </motion.div>

              {/* Password Input */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 }}
              >
                <label htmlFor="password" className="block text-xs font-bold text-blue-400/80 mb-3 tracking-widest">
                  SECURITY_PROTOCOL
                </label>
                <div className="relative group">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="ENTER_PASSKEY..."
                    className="w-full px-4 py-3 bg-white/10 backdrop-blur border border-blue-400/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent focus:bg-white/20 transition-all duration-300 text-white placeholder-blue-400/30 font-mono text-sm pr-12"
                    disabled={isLoading}
                  />
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/0 via-transparent to-purple-500/0 group-focus-within:from-blue-500/10 group-focus-within:to-purple-500/10 pointer-events-none transition-all duration-300" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400/60 hover:text-blue-400 transition-colors duration-300"
                    disabled={isLoading}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </motion.div>

              {/* Error Message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg backdrop-blur"
                >
                  <p className="text-xs text-red-400 font-mono tracking-wide">
                    ✗ {error}
                  </p>
                </motion.div>
              )}

              {/* Login Button */}
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isLoading || !username || !password}
                className="w-full mt-8 relative group overflow-hidden"
              >
                {/* Button gradient background */}
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur" />
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500 rounded-lg opacity-0 group-hover:opacity-50 transition-opacity duration-300" />
                
                {/* Button content */}
                <div className="relative bg-black/40 backdrop-blur border border-white/20 group-hover:border-purple-400/50 px-6 py-3 rounded-lg transition-all duration-300 flex items-center justify-center gap-2">
                  {isLoading ? (
                    <>
                      <motion.div
                        className="w-4 h-4 border-2 border-purple-400 border-t-blue-400 rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity }}
                      />
                      <span className="text-sm font-bold text-purple-400 tracking-widest">INITIALIZING...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span className="text-sm font-bold text-white group-hover:text-purple-200 transition-colors tracking-widest">
                        GRANT_ACCESS
                      </span>
                    </>
                  )}
                </div>
              </motion.button>
            </form>

            {/* Footer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="mt-8 text-center"
            >
              <p className="text-[10px] text-purple-400/40 font-mono tracking-widest">
                &gt; PHOTO_STUDIO_v2.0 | SECURED_CONNECTION
              </p>
              <p className="text-[10px] text-blue-400/40 font-mono tracking-widest mt-1">
                © 2024 NEURAL_LABS | ALL_RIGHTS_RESERVED
              </p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
