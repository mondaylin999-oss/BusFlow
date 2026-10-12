// ===========================================================================
//  auth.tsx — who is signed in, for the whole app.
//
//  The backend validates the HttpOnly session cookie on boot; screens read
//  the resulting user from this context instead of storing session tokens.
// ===========================================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  ApiError,
  type Health,
  type SessionUser,
} from "./api";

type AuthState = {
  user: SessionUser | null;
  health: Health | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<SessionUser>;
  register: (input: {
    name: string;
    username?: string;
    email?: string;
    password: string;
  }) => Promise<SessionUser>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = await api.get<Health>("/health");
      setHealth(status);
      setError(null);
    } catch (caught) {
      setHealth(null);
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Cannot reach the server.",
      );
      setUser(null);
      return;
    }

    try {
      const response = await api.get<{ user: SessionUser | null }>("/auth/me");
      setUser(response.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const response = await api.post<{ user: SessionUser }>(
      "/auth/login",
      { username, password },
    );
    setUser(response.user);
    setError(null);
    return response.user;
  }, []);

  const register = useCallback(
    async (input: {
      name: string;
      username?: string;
      email?: string;
      password: string;
    }) => {
      const response = await api.post<{ user: SessionUser }>(
        "/auth/register",
        input,
      );
      setUser(response.user);
      setError(null);
      return response.user;
    },
    [],
  );

  const logout = useCallback(() => {
    setUser(null);
    void api.post("/auth/logout").catch(() => undefined);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, health, loading, error, login, register, logout, refresh }),
    [user, health, loading, error, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}

export function homePathFor(_role: SessionUser["role"]) {
  return "/";
}
