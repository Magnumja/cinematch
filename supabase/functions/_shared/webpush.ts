// Web Push sem dependências (DEC-048): criptografia do conteúdo (RFC 8291, aes128gcm) e
// identificação do servidor (VAPID, RFC 8292), só com WebCrypto. Roda no Deno (Edge Functions) e no Node (testes).

const enc = new TextEncoder();

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
// publicKey: ponto P-256 não comprimido (65 bytes); privateKey: escalar d (32 bytes). Ambos em base64url.
export type VapidKeys = { publicKey: string; privateKey: string; subject: string };
export type PushResult = { ok: true; status: number } | { ok: false; status: number; gone: boolean };

// Só serviços de push conhecidos: o endpoint vem do navegador do usuário e a função faz POST nele
// (sem essa lista, uma inscrição forjada transformaria o backend num disparador de requisições).
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^([a-z0-9-]+\.)*notify\.windows\.com$/];

export function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && url.port === '' && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

export function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// HKDF com uma única rodada de expansão (todas as saídas aqui têm até 32 bytes).
async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const prk = await hmac(salt, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

const RECORD_SIZE = 4096;
// Limite dos serviços de push para o corpo cifrado: 4096 bytes (cabeçalho de 86 + tag de 16 + delimitador).
export const MAX_PAYLOAD_BYTES = RECORD_SIZE - 86 - 16 - 1;

// Cifra o conteúdo para o navegador inscrito (um único registro aes128gcm).
// `salt` e `senderKeys` só são passados nos testes, para resultados determinísticos.
export async function encryptPayload(
  plaintext: Uint8Array,
  target: Pick<PushTarget, 'p256dh' | 'auth'>,
  opts: { salt?: Uint8Array<ArrayBuffer>; senderKeys?: CryptoKeyPair } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  if (plaintext.length > MAX_PAYLOAD_BYTES) throw new Error('payload grande demais para Web Push');
  const uaPublic = b64urlDecode(target.p256dh);
  const authSecret = b64urlDecode(target.auth);
  const sender = opts.senderKeys ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey('raw', sender.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, sender.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, senderPublic), 32);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 marca o último (e único) registro; sem preenchimento.
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plaintext, new Uint8Array([2]))));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = senderPublic.length;
  return concat(header, senderPublic, ciphertext);
}

// Cabeçalho Authorization do VAPID: JWT ES256 assinado com a chave privada do servidor.
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, now = Date.now()): Promise<string> {
  const pub = b64urlDecode(vapid.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY inválida');
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: vapid.privateKey, x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })));
  const unsigned = `${header}.${claims}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64urlEncode(signature)}, k=${vapid.publicKey}`;
}

export async function sendWebPush(
  target: PushTarget,
  payload: unknown,
  vapid: VapidKeys,
  opts: { ttlSeconds?: number; urgency?: 'low' | 'normal' | 'high'; topic?: string; fetchImpl?: typeof fetch } = {},
): Promise<PushResult> {
  if (!isAllowedEndpoint(target.endpoint)) return { ok: false, status: 0, gone: true };
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), target);
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(target.endpoint, vapid),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(opts.ttlSeconds ?? 24 * 3600),
    Urgency: opts.urgency ?? 'normal',
  };
  // Topic: um aviso novo com o mesmo tópico substitui o anterior que ainda não foi entregue.
  if (opts.topic) headers.Topic = opts.topic;
  const res = await (opts.fetchImpl ?? fetch)(target.endpoint, { method: 'POST', headers, body, redirect: 'manual' });
  await res.body?.cancel();
  if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
  // 404/410: a inscrição não existe mais (permissão revogada, app desinstalado) e deve ser apagada.
  return { ok: false, status: res.status, gone: res.status === 404 || res.status === 410 };
}
