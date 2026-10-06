/* Credenciales de la App Informe Alfa.
   Una credencial es un archivo con la identidad, el cargo, la institución, la firma y el timbre de
   un funcionario, sellado con la clave privada de la Dirección Regional (ECDSA P-256, SHA-256).
   La app comprueba el sello sin conexión con la clave pública que trae en su configuración y guarda
   la credencial cifrada con un PIN (PBKDF2 + AES-GCM). Este archivo lo usan la app, la herramienta
   emisora y las pruebas en Node. */
const Credencial = (() => {
  'use strict';
  const cripto = globalThis.crypto;
  const subtle = cripto.subtle;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const CURVA = 'P-256';
  const ITERACIONES_PIN = 150000;

  // ---------- utilidades ----------
  function canonico(valor) {
    if (valor === null || typeof valor !== 'object') return JSON.stringify(valor);
    if (Array.isArray(valor)) return '[' + valor.map(canonico).join(',') + ']';
    return '{' + Object.keys(valor).sort().map(k => JSON.stringify(k) + ':' + canonico(valor[k])).join(',') + '}';
  }
  function aB64u(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function deB64u(texto) {
    const s = atob(texto.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - texto.length % 4) % 4));
    return Uint8Array.from(s, c => c.charCodeAt(0));
  }
  function aHex(bytes) { return [...bytes].map(b => b.toString(16).padStart(2, '0')).join(''); }
  async function sha256(bytesOTexto) {
    const datos = typeof bytesOTexto === 'string' ? enc.encode(bytesOTexto) : bytesOTexto;
    return new Uint8Array(await subtle.digest('SHA-256', datos));
  }
  function dataUrlABytes(dataUrl) {
    const coma = dataUrl.indexOf(',');
    const b64 = dataUrl.slice(coma + 1);
    const s = atob(b64);
    return Uint8Array.from(s, c => c.charCodeAt(0));
  }
  function uuid() {
    if (cripto.randomUUID) return cripto.randomUUID();
    const b = cripto.getRandomValues(new Uint8Array(16));
    return aHex(b).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  }

  // ---------- claves ----------
  async function generarParClaves() {
    const par = await subtle.generateKey({ name: 'ECDSA', namedCurve: CURVA }, true, ['sign', 'verify']);
    const privada = await subtle.exportKey('jwk', par.privateKey);
    const publica = await subtle.exportKey('jwk', par.publicKey);
    delete publica.key_ops; delete publica.ext;
    const kid = await kidDe(publica);
    return { privada, publica, kid };
  }
  async function kidDe(jwkPublica) {
    return aHex(await sha256(jwkPublica.x + '.' + jwkPublica.y)).slice(0, 12);
  }
  async function importarPublica(jwk) {
    return subtle.importKey('jwk', { kty: 'EC', crv: CURVA, x: jwk.x, y: jwk.y }, { name: 'ECDSA', namedCurve: CURVA }, true, ['verify']);
  }
  async function importarPrivada(jwk) {
    return subtle.importKey('jwk', { kty: 'EC', crv: CURVA, x: jwk.x, y: jwk.y, d: jwk.d }, { name: 'ECDSA', namedCurve: CURVA }, true, ['sign']);
  }
  function mismaClave(jwkA, jwkB) { return !!(jwkA && jwkB && jwkA.x === jwkB.x && jwkA.y === jwkB.y); }

  // ---------- sello ----------
  async function sellar(datos, jwkPrivada, kid) {
    const clave = await importarPrivada(jwkPrivada);
    const firma = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, clave, enc.encode(canonico(datos)));
    return { alg: 'ES256', kid, firma: aB64u(new Uint8Array(firma)) };
  }
  async function verificar(credencial, jwkPublica) {
    try {
      if (!credencial || credencial.tipo !== 'credencial-alfa' || !credencial.datos || !credencial.sello) return { valida: false, motivo: 'El archivo no es una credencial de la App Informe Alfa.' };
      if (credencial.sello.alg !== 'ES256') return { valida: false, motivo: 'Tipo de sello desconocido.' };
      const clave = await importarPublica(jwkPublica);
      const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, clave, deB64u(credencial.sello.firma), enc.encode(canonico(credencial.datos)));
      if (!ok) return { valida: false, motivo: 'El sello no corresponde a la Dirección Regional o la credencial fue alterada.' };
      if (vencida(credencial)) return { valida: false, motivo: `La credencial venció el ${credencial.datos.vence}.` };
      return { valida: true, motivo: 'Sello correcto y credencial vigente.' };
    } catch (e) {
      return { valida: false, motivo: 'No se pudo comprobar el sello: ' + e.message };
    }
  }
  function vencida(credencial, hoyISO) {
    const hoy = hoyISO || new Date().toISOString().slice(0, 10);
    return !!(credencial.datos && credencial.datos.vence && credencial.datos.vence < hoy);
  }
  function resumen(credencial) {
    const d = credencial.datos;
    return { id: d.id, nombre: d.nombre, cargo: d.cargo, institucion: d.institucion, nivel: d.nivel, provincia: d.provincia || '', comunas: d.comunas || [], correo: d.correo || '', vence: d.vence, emitida: d.emitida, modo: d.modo, kid: credencial.sello.kid, combinada: !!d.combinada, tieneTimbre: !!d.timbre_png };
  }

  // ---------- cifrado con PIN ----------
  async function claveDePin(pin, salt) {
    const base = await subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERACIONES_PIN, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function cifrar(texto, pin) {
    const salt = cripto.getRandomValues(new Uint8Array(16));
    const iv = cripto.getRandomValues(new Uint8Array(12));
    const clave = await claveDePin(pin, salt);
    const cifrado = await subtle.encrypt({ name: 'AES-GCM', iv }, clave, enc.encode(texto));
    return { v: 1, salt: aB64u(salt), iv: aB64u(iv), datos: aB64u(new Uint8Array(cifrado)) };
  }
  async function descifrar(paquete, pin) {
    const clave = await claveDePin(pin, deB64u(paquete.salt));
    const plano = await subtle.decrypt({ name: 'AES-GCM', iv: deB64u(paquete.iv) }, clave, deB64u(paquete.datos));
    return dec.decode(plano);
  }

  return { canonico, aB64u, deB64u, aHex, sha256, dataUrlABytes, uuid, generarParClaves, kidDe, importarPublica, importarPrivada, mismaClave, sellar, verificar, vencida, resumen, cifrar, descifrar };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Credencial;
