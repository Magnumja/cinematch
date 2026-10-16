// Avisos no celular (Web Push, DEC-048): inscrição deste navegador e estado para o Perfil.
// O envio fica no backend (Edge Function deliver-push); aqui só pedimos permissão e registramos o aparelho.
import { supabase } from './api.ts';

export type PushStatus = 'unsupported' | 'needs-install' | 'not-configured' | 'denied' | 'off' | 'on';

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '';

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function supported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function pushStatus(): Promise<PushStatus> {
  // No iPhone/iPad o push só existe com o app instalado na tela de início (iOS 16.4+).
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!supported()) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'not-configured';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const sub = await currentSubscription();
  if (!sub) return 'off';
  // A inscrição do navegador pode pertencer a outra conta que entrou antes neste aparelho.
  const { count, error } = await supabase.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('endpoint', sub.endpoint);
  if (error) throw error;
  return (count ?? 0) > 0 ? 'on' : 'off';
}

export async function enablePush(): Promise<PushStatus> {
  const status = await pushStatus();
  if (status !== 'off') return status;
  if ((await Notification.requestPermission()) !== 'granted') return Notification.permission === 'denied' ? 'denied' : 'off';

  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const key = b64urlToBytes(VAPID_PUBLIC_KEY);
  let sub = await reg.pushManager.getSubscription();
  // Chave VAPID trocada no servidor: a inscrição antiga não recebe mais nada.
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });

  const json = sub.toJSON();
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
  });
  if (error) throw error;
  return 'on';
}

// Desliga os avisos neste aparelho (também usado ao sair da conta, para o próximo usuário não receber os avisos do anterior).
export async function disablePush(): Promise<void> {
  if (!supported()) return;
  const sub = await currentSubscription();
  if (!sub) return;
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
  if (error) throw error;
}

// Aviso local, sem passar pelo servidor: confirma que permissão e service worker estão funcionando.
export async function showTestNotification(title: string, body: string): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(title, { body, icon: '/icon-192.png', badge: '/favicon-48.png', tag: 'cineou-test', data: { url: '/profile?tab=alerts' } });
}
