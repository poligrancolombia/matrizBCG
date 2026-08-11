// Desencriptado en el navegador del JSON publicado en el bucket (público,
// sin auth) -- SALT e ITERATIONS deben coincidir EXACTO con
// etl/crypto_config.py, que es donde se encripta antes de subirlo. Son
// públicas (viajan en este mismo archivo), la seguridad depende solo de la
// contraseña, no de que el salt sea secreto. Copia literal de
// webapp/src/lib/crypto.js del proyecto de market share (mismo esquema de
// cifrado, para poder reusar la misma contraseña del sitio si se quiere).
//
// Formato del archivo bcg_matrix.json.enc: iv (12 bytes) || AES-256-GCM
// ciphertext (incluye el tag de 16 bytes al final).
const SALT_B64 = "th09VGSvAHsMxYIbgvyWzQ==";
const ITERATIONS = 300_000;

function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// deriva la llave AES-256 a partir de la contraseña -- no hay forma de saber
// si la contraseña es correcta hasta intentar desencriptar el archivo real
// con la llave resultante (ver decryptBuffer).
export async function deriveKey(password) {
  const salt = b64ToBytes(SALT_B64);
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"]
  );
}

// exporta la llave derivada a bytes crudos, para poder guardarla en
// sessionStorage y no re-pedir la contraseña en cada recarga de la misma
// pestaña (se borra sola al cerrarla -- a diferencia de localStorage).
export async function exportKeyToB64(key) {
  const raw = await crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function importKeyFromB64(b64) {
  const raw = b64ToBytes(b64);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["decrypt"]);
}

// AuthError: la contraseña (o la llave guardada) no desencripta el archivo
// real -- se distingue de un error de red/carga para poder mostrar
// "contraseña incorrecta" en vez de un error genérico.
export class AuthError extends Error {}

export async function decryptBuffer(key, arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  try {
    return await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  } catch {
    throw new AuthError("Contraseña incorrecta.");
  }
}
