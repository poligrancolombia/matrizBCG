const crypto = require("node:crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");

// Mismo patrón que la función `getkey` de Market Share (webapp/functions/index.js),
// con nombre de función y de secreto PROPIOS: las dos funciones viven en el
// mismo proyecto de GCP (market-share-503713), así que deben tener nombres
// distintos para no pisarse.
//
// Toda la configuración de acceso vive en Secret Manager, nunca en el código
// ni en el repositorio. Forma del JSON:
//
//   { "password": "<contraseña de los datos>",
//     "tokens": { "equipo": "<token>" } }
//
// El token NO descifra nada: solo autoriza a pedir la contraseña. Por eso se
// puede rotar la contraseña sin tocar el enlace repartido, y revocar un
// enlace filtrado sin volver a cifrar los datos.
const ACCESO = defineSecret("BCG_MATRIX_ACCESO");

// El sitio llama a esta función a través de una reescritura de Firebase
// Hosting (/api/getkey), así que en producción la petición es del mismo
// origen y no hay CORS de por medio. Esta lista solo cubre el caso de
// desarrollo local y sirve de cinturón extra: NO es una barrera de seguridad
// -- curl manda el Origin que quiera -- pero evita que otra página web use la
// función desde el navegador de un tercero.
const ORIGENES = [
  "https://bcg-matrix-poli.web.app",
  "https://bcg-matrix-poli.firebaseapp.com",
  "http://localhost:8090",
];

// Comparación en tiempo constante. Un `===` normal tarda distinto según
// cuántos caracteres coincidan, y esa diferencia permite adivinar un token
// carácter por carácter midiendo tiempos de respuesta.
function igual(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

exports.getkeyBcg = onRequest(
  { secrets: [ACCESO], cors: ORIGENES, region: "us-central1", maxInstances: 10 },
  (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "método no permitido" });
    }

    let cfg;
    try {
      cfg = JSON.parse(ACCESO.value());
    } catch {
      logger.error("El secreto BCG_MATRIX_ACCESO no contiene un JSON válido.");
      return res.status(500).json({ error: "configuración inválida" });
    }

    const token = (req.body && req.body.token) || "";
    const tokens = cfg.tokens || {};
    const canal = Object.keys(tokens).find((c) => igual(tokens[c], token));

    if (!canal) {
      // A propósito NO se registra el token recibido: quedaría en claro en
      // los registros de Cloud Logging, que es justo lo que se quiere evitar.
      logger.warn("Token rechazado", { origen: req.headers.origin || "(sin origen)" });
      return res.status(401).json({ error: "token no autorizado" });
    }

    // Se registra el CANAL, no el token. Así se ve por dónde entra la gente
    // -- y por dónde se filtró un enlace -- sin dejar el secreto en el log.
    logger.info("Acceso concedido", { canal, origen: req.headers.origin || "(sin origen)" });
    return res.json({ password: cfg.password });
  }
);
