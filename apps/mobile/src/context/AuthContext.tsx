import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { loadSession, getStoredCookie, getStoredProfileId, clearSession } from "../api/session";

interface AuthContextValue {
  isLoading: boolean;
  isSignedIn: boolean;
  profileId: string | null;
  onLogin: (profileId: string) => void;
  onLogout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  isLoading: true,
  isSignedIn: false,
  profileId: null,
  onLogin: () => {},
  onLogout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    loadSession()
      .then(() => {
        setIsSignedIn(!!getStoredCookie());
        setProfileId(getStoredProfileId());
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const onLogin = (pid: string) => {
    setIsSignedIn(true);
    setProfileId(pid);
  };

  const onLogout = async () => {
    await clearSession();
    setIsSignedIn(false);
    setProfileId(null);
  };

  return (
    <AuthContext.Provider value={{ isLoading, isSignedIn, profileId, onLogin, onLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
