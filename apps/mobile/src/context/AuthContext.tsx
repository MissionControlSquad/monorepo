import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { type Client } from "urql";
import {
  loadSession,
  getStoredCookie,
  getStoredProfileId,
  getStoredServerUrl,
  clearSession,
} from "../api/session";
import { createUrqlClient } from "../api/client";

interface AuthContextValue {
  isLoading: boolean;
  isSignedIn: boolean;
  profileId: string | null;
  serverUrl: string | null;
  urqlClient: Client | null;
  onLogin: (serverUrl: string, profileId: string) => void;
  onLogout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  isLoading: true,
  isSignedIn: false,
  profileId: null,
  serverUrl: null,
  urqlClient: null,
  onLogin: () => {},
  onLogout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [urqlClient, setUrqlClient] = useState<Client | null>(null);

  useEffect(() => {
    loadSession()
      .then(() => {
        const cookie = getStoredCookie();
        if (cookie) {
          setIsSignedIn(true);
          setProfileId(getStoredProfileId());
          setServerUrl(getStoredServerUrl());
          setUrqlClient(createUrqlClient());
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const onLogin = (url: string, pid: string) => {
    setIsSignedIn(true);
    setProfileId(pid);
    setServerUrl(url);
    setUrqlClient(createUrqlClient());
  };

  const onLogout = async () => {
    await clearSession();
    setIsSignedIn(false);
    setProfileId(null);
    setServerUrl(null);
    setUrqlClient(null);
  };

  return (
    <AuthContext.Provider
      value={{ isLoading, isSignedIn, profileId, serverUrl, urqlClient, onLogin, onLogout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
