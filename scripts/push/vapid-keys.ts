// Gera o par de chaves VAPID do Web Push (DEC-048). Rode uma vez: npm run push:keys
// A pública vai para o frontend (VITE_VAPID_PUBLIC_KEY) e para as Edge Functions (VAPID_PUBLIC_KEY);
// a privada só para as Edge Functions (VAPID_PRIVATE_KEY, via `supabase secrets set`). Trocar o par
// invalida todas as inscrições existentes.
import { b64urlEncode } from '../../supabase/functions/_shared/webpush.ts';

const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
const publicKey = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);

console.log(`# Frontend (.env e variáveis do Vercel) — pública
VITE_VAPID_PUBLIC_KEY=${publicKey}

# Edge Functions (supabase/functions/.env ou supabase secrets set) — a privada é SEGREDO
VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${d}
VAPID_SUBJECT=mailto:seu-email@exemplo.com`);
