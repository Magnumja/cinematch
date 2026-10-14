// Sessão do usuário e perfil carregado uma vez para o app inteiro.
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getProfile, supabase, type Profile } from './api.ts';

interface SessionState {
  session: Session | null;
  profile: Profile | null;
  // true até a sessão inicial E o perfil da sessão atual terem sido carregados (ou falhado).
  loading: boolean;
  profileError: boolean;
  // Usuário chegou pelo link de "esqueci minha senha" e precisa definir uma nova.
  recovering: boolean;
  finishRecovery: () => void;
  reloadProfile: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const loadedFor = useRef<string | null>(null);
  const [recovering, setRecovering] = useState(false);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      loadedFor.current = null;
      setProfile(null);
      setLoading(false);
      return;
    }
    // Renovação de token (a cada hora) não precisa recarregar o perfil.
    if (loadedFor.current === s.user.id) return;
    setLoading(true);
    try {
      setProfile(await getProfile(s.user.id));
      loadedFor.current = s.user.id;
      setProfileError(false);
    } catch (err) {
      setProfile(null);
      // PGRST116 = nenhuma linha: a conta foi apagada (ex.: em outro dispositivo). Sessão órfã → sair.
      if ((err as { code?: string }).code === 'PGRST116') await supabase.auth.signOut();
      else setProfileError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s);
      // Fora do callback para não bloquear o cliente de auth (recomendação do supabase-js).
      // O evento INITIAL_SESSION cobre a carga inicial.
      setTimeout(() => void loadProfile(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  // Recarga silenciosa (após salvar perfil/onboarding): não troca a tela por um esqueleto.
  const reloadProfile = useCallback(async () => {
    if (session) setProfile(await getProfile(session.user.id));
  }, [session]);

  return <SessionContext.Provider value={{ session, profile, loading, profileError, recovering, finishRecovery: () => setRecovering(false), reloadProfile }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession fora do SessionProvider');
  return ctx;
}

// Para páginas que só renderizam com usuário logado (garantido pelo roteador).
export function useUser() {
  const { session, profile, reloadProfile } = useSession();
  if (!session || !profile) throw new Error('useUser exige sessão e perfil carregados');
  return { userId: session.user.id, profile, reloadProfile };
}
