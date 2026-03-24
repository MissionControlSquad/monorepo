import { createContext, useContext, useState, useEffect, startTransition, ReactNode } from "react";
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
  urqlClient: Client;
  onLogin: (serverUrl: string, profileId: string) => void;
  onLogout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  isLoading: true,
  isSignedIn: false,
  profileId: null,
  serverUrl: null,
  urqlClient: createUrqlClient(),
  onLogin: () => {},
  onLogout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [urqlClient, setUrqlClient] = useState<Client>(() => createUrqlClient());

  useEffect(() => {
    loadSession()
      .then(() => {
        const storedUrl = getStoredServerUrl();
        const storedProfile = getStoredProfileId();
        // On iOS, cookie may live in native jar rather than SecureStore, so
        // we check for serverUrl+profileId as the sign-in indicator.
        if (storedUrl && storedProfile) {
          setIsSignedIn(true);
          setProfileId(storedProfile);
          setServerUrl(storedUrl);
          startTransition(() => {
            setUrqlClient(createUrqlClient(storedUrl));
          });
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const onLogin = (url: string, pid: string) => {
    setIsSignedIn(true);
    setProfileId(pid);
    setServerUrl(url);
    // Pass URL directly — don't rely on getStoredServerUrl() which may lag
    startTransition(() => {
      setUrqlClient(createUrqlClient(url));
    });
  };

  const onLogout = async () => {
    await clearSession();
    setIsSignedIn(false);
    setProfileId(null);
    setServerUrl(null);
    startTransition(() => {
      setUrqlClient(createUrqlClient());
    });
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
