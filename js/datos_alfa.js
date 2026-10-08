/* Archivo de datos del Informe Alfa (versión 0.5): huella del contenido, firma digital del funcionario,
   texto del código QR, tablas con la forma del modelo de la etapa 3 y comprobación para el verificador.
   Lo usan la app (al generar el PDF), el verificador de la URAT (verificar.html) y las pruebas en Node.
   Depende de credencial.js. */
(function (raiz) {
  'use strict';
  const Cred = typeof Credencial !== 'undefined' ? Credencial : require('./credencial.js');
  const TIPO = 'informe-alfa', VERSION_ARCHIVO = 1, VERSION_QR = '1', SEP = '~';
  const CATEGORIAS = ['afectadas', 'aisladas', 'albergadas', 'damnificadas', 'damnificadas_laborales', 'desaparecidas', 'evacuadas', 'extraviadas', 'fallecidas', 'lesionadas'];

  function n(v) { const x = parseInt(v, 10); return isNaN(x) || x < 0 ? 0 : x; }
  function texto(v) { return String(v == null ? '' : v).trim(); }
  function sinSello(informe) { const c = Object.assign({}, informe); delete c.sello; return c; }
  function comunasDe(informe) {
    const id = (informe && informe.identificacion) || {};
    return Array.isArray(id.comunas) && id.comunas.length ? id.comunas : (id.comuna ? [id.comuna] : []);
  }

  // Huella SHA-256 (en base64url) del informe en su forma canónica, sin el propio sello
  async function huella(informe) {
    return Cred.aB64u(await Cred.sha256(Cred.canonico(sinSello(informe))));
  }

  // ---------- nombres de archivo ----------
  function limpiarNombre(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '');
  }
  function nombreBase(informe) {
    const comunas = comunasDe(informe);
    const base = comunas.length === 1 ? comunas[0] : (comunas.length > 1 ? 'varias_comunas' : 'comuna');
    const fecha = (informe.elaboracion && informe.elaboracion.fecha) || '';
    return `Informe_Alfa_${informe.numero}_${limpiarNombre(base)}_${fecha}`;
  }
  function nombreArchivoPdf(informe) { return nombreBase(informe) + '.pdf'; }
  function nombreArchivoDatos(informe) { return nombreBase(informe) + '.alfa.json'; }

  // ---------- tablas con la forma del modelo de datos de la etapa 3 (ARQUITECTURA.md) ----------
  function tablas(informe, totales, config) {
    const t = totales || {};
    const id = informe.identificacion || {}, oc = informe.ocurrencia || {}, l = informe.lugar || {}, ev = informe.evento || {};
    const comunas = comunasDe(informe);
    const cut = c => { const x = ((config && config.comunas) || []).find(k => k.comuna === c); return x ? x.cut : null; };
    const num = v => (v === '' || v == null) ? null : (Number.isFinite(Number(String(v).replace(',', '.'))) ? Number(String(v).replace(',', '.')) : null);
    const base = informe.amplia && informe.amplia.base ? informe.amplia.base : informe.numero;
    const E0 = informe.elaboracion || {};
    const anioCorr = informe.anio || (E0.fecha ? parseInt(String(E0.fecha).slice(0, 4), 10) : null);   // el correlativo se reinicia cada año (D-53)
    const evento = {
      id_evento: base, anio_correlativo: anioCorr, region: id.region || '', provincia: id.provincia || '',
      comunas: comunas.map(c => ({ comuna: c, cut: cut(c) })),
      tipo_evento: ev.tipo || '', tipo_evento_otro: ev.otro || '',
      fecha_inicio: oc.fecha || '', hora_inicio: oc.hora || '',
      lugar: l.descripcion || '', lat: num(l.lat), lon: num(l.lon), precision_m: l.precision || null, origen_coordenadas: l.origen || ''
    };
    const R = informe.responsable || {}, E = informe.elaboracion || {};
    const inf = {
      numero: informe.numero, id_evento: base, anio_correlativo: anioCorr,
      letra: informe.amplia && informe.numero ? String(informe.numero).slice(String(base).length + 1) : '',
      amplia_de: informe.amplia ? informe.amplia.de : null,
      modo: informe.modo || 'ejercicio', nivel_elaborador: (informe.elaborador && informe.elaborador.nivel) || '',
      firmante: R.nombre || '', cargo: R.cargo || '', institucion: R.institucion || '',
      fecha_elaboracion: E.fecha || '', hora_elaboracion: E.hora || '',
      credencial_id: informe.firmante ? informe.firmante.id : null,
      firma_digital: !!(informe.sello && informe.sello.firma),
      fuente: [].concat(id.fuentes || [], texto(id.fuenteOtra) ? [texto(id.fuenteOtra)] : []).join(', '),
      personas_unicas_aprox: t.personas != null ? t.personas : null
    };
    const afectacion = CATEGORIAS.filter(k => t[k]).map(k => ({ categoria: k, adultos_h: t[k].adH, adultos_m: t[k].adM, nna_h: t[k].nnaH, nna_m: t[k].nnaM, total: t[k].total }));
    const necesidades = (informe.hayNecesidad === true ? (informe.necesidades || []) : []).filter(x => x.elemento)
      .map((x, i) => ({ orden: i + 1, elemento: x.elemento, elemento_otro: x.otroNombre || '', cantidad: n(x.cantidad), para_que: x.paraQue || '' }));
    const viviendas = Object.keys(informe.viviendas || {}).map(k => {
      const v = informe.viviendas[k] || {}; const a = v.albergue || {};
      return { condicion: k, viviendas: n(v.viviendas), adultos_h: n(v.adH), adultos_m: n(v.adM), nna_h: n(v.nnaH), nna_m: n(v.nnaM), en_albergue: v.hayAlbergue ? n(a.adH) + n(a.adM) + n(a.nnaH) + n(a.nnaM) : 0 };
    });
    return { evento, informe: inf, afectacion, necesidades, viviendas };
  }

  // ---------- el archivo de datos que acompaña al PDF ----------
  function construir(informe, totales, config) {
    const s = informe.sello || {};
    const f = informe.firmante || null;
    return {
      tipo: TIPO, version_archivo: VERSION_ARCHIVO, app: (config && config.version_app) || '', modo: informe.modo || 'ejercicio',
      generado: new Date().toISOString(),
      aviso: 'Archivo de datos de un Informe Alfa de EJERCICIO generado por la App Informe Alfa. Acompaña al PDF del mismo número; el verificador de la URAT lo usa para comprobar autoría e integridad. Solo totales: no contiene datos de personas identificables.',
      informe,
      huella: s.huella || null,
      firma: s.firma && f && f.publico ? { alg: 'ES256', firma: s.firma, firmante: f.publico, sello_publico: f.sello_publico } : null,
      totales: totales || null,
      tablas: tablas(informe, totales, config)
    };
  }

  function serializar(archivo) { return JSON.stringify(archivo, null, 1); }

  // Lee el archivo de datos incorporado en un PDF generado por la app (adjunto estándar de PDF), más la huella
  // y el número que van en los metadatos. Devuelve { huella, numero, archivo (objeto o null), nombre, adjuntos }.
  async function extraerDePdf(PDFLib, bytes) {
    const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const kw = doc.getKeywords() || '';
    const mh = /alfa-huella:([A-Za-z0-9_-]+)/.exec(kw), mn = /alfa-numero:(\S+)/.exec(kw);
    const res = { huella: mh ? mh[1] : null, numero: mn ? mn[1] : null, archivo: null, nombre: null, adjuntos: [] };
    const { PDFName, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream } = PDFLib;
    try {
      const names = doc.catalog.lookup(PDFName.of('Names'), PDFDict);
      const ef = names && names.lookup(PDFName.of('EmbeddedFiles'), PDFDict);
      const recorrer = nodo => {
        if (!nodo) return;
        const kids = nodo.lookup(PDFName.of('Kids'));
        if (kids instanceof PDFArray) { for (let i = 0; i < kids.size(); i++) recorrer(kids.lookup(i, PDFDict)); return; }
        const lista = nodo.lookup(PDFName.of('Names'));
        if (!(lista instanceof PDFArray)) return;
        for (let i = 0; i + 1 < lista.size(); i += 2) {
          const clave = lista.lookup(i);
          const spec = lista.lookup(i + 1, PDFDict);
          const efd = spec.lookup(PDFName.of('EF'), PDFDict);
          const stream = efd && (efd.lookup(PDFName.of('F')) || efd.lookup(PDFName.of('UF')));
          if (!(stream instanceof PDFRawStream)) continue;
          res.adjuntos.push({ nombre: clave && clave.decodeText ? clave.decodeText() : String(clave), bytes: decodePDFRawStream(stream).decode() });
        }
      };
      recorrer(ef);
    } catch (e) { /* PDF sin adjuntos legibles */ }
    const dec = new TextDecoder();
    for (const a of res.adjuntos) {
      if (!/\.alfa\.json$/i.test(a.nombre)) continue;
      try {
        const obj = JSON.parse(dec.decode(a.bytes));
        if (obj && obj.tipo === TIPO) { res.archivo = obj; res.nombre = a.nombre; break; }
      } catch (e) { /* no es el archivo de datos; se sigue con el siguiente */ }
    }
    return res;
  }

  // ---------- código QR: enlace al verificador con número, huella, firma e identificador del firmante ----------
  function textoQR(config, informe) {
    const base = (config && config.verificador && config.verificador.url) || 'herramientas/verificar.html';
    const s = informe.sello || {};
    const partes = [VERSION_QR, informe.numero || '', s.huella || '', s.firma || '-', informe.firmante && informe.firmante.id ? String(informe.firmante.id).slice(0, 8) : '-'];
    return base + '#' + partes.join(SEP);
  }
  function leerQR(textoQr) {
    const t = texto(textoQr);
    const i = t.indexOf('#');
    const carga = i >= 0 ? t.slice(i + 1) : t;
    const p = carga.split(SEP);
    if (p.length < 5 || p[0] !== VERSION_QR || !p[2]) return null;
    return { version: p[0], numero: p[1], huella: p[2], firma: p[3] === '-' ? null : p[3], firmanteId: p[4] === '-' ? null : p[4] };
  }

  // ---------- comprobación (verificador) ----------
  function validar(archivo) {
    if (!archivo || typeof archivo !== 'object') return { ok: false, motivo: 'El archivo no tiene el formato esperado.' };
    if (archivo.tipo !== TIPO) return { ok: false, motivo: 'El archivo no es un archivo de datos de la App Informe Alfa.' };
    if (!archivo.informe || typeof archivo.informe !== 'object' || !archivo.informe.numero) return { ok: false, motivo: 'El archivo no contiene un informe completo.' };
    if (!archivo.huella) return { ok: false, motivo: 'El archivo no trae la huella del contenido.' };
    return { ok: true, motivo: '' };
  }
  function resumenDe(archivo) {
    const inf = archivo.informe || {}; const t = archivo.totales || {};
    const id = inf.identificacion || {}, oc = inf.ocurrencia || {}, ev = inf.evento || {}, R = inf.responsable || {}, E = inf.elaboracion || {};
    const total = k => (t[k] && t[k].total != null) ? t[k].total : null;
    return {
      numero: inf.numero, anio_correlativo: inf.anio || (E.fecha ? parseInt(String(E.fecha).slice(0, 4), 10) : null),
      modo: inf.modo || archivo.modo || '', comunas: comunasDe(inf).join(', '), provincia: id.provincia || '', region: id.region || '',
      tipo_evento: ev.tipo === 'OTRO' ? ('Otro: ' + texto(ev.otro)) : (ev.tipo || ''),
      fecha_inicio: oc.fecha || '', hora_inicio: oc.hora || '',
      fecha_elaboracion: E.fecha || '', hora_elaboracion: E.hora || '',
      responsable: R.nombre || '', cargo: R.cargo || '', institucion: R.institucion || '',
      ampliacion_de: inf.amplia ? inf.amplia.de : null,
      afectadas: total('afectadas'), damnificadas: total('damnificadas'), albergadas: total('albergadas'),
      viviendas_danadas: t.viviendas_danadas != null ? t.viviendas_danadas : null,
      necesidades: inf.hayNecesidad === true ? (inf.necesidades || []).filter(x => x.elemento).length : 0,
      app: archivo.app || '', generado: archivo.generado || '',
      firmante: archivo.firma && archivo.firma.firmante ? archivo.firma.firmante.nombre : null
    };
  }
  // Devuelve { resultados: [{ clave, ok (true | false | null), titulo, detalle }], valido, resumen }
  async function comprobar(archivo, clavePublicaDR, opciones) {
    opciones = opciones || {};
    const R = [];
    const agregar = (clave, ok, titulo, detalle) => R.push({ clave, ok, titulo, detalle });
    const v = validar(archivo);
    if (!v.ok) { agregar('formato', false, 'Formato del archivo', v.motivo); return { resultados: R, valido: false, resumen: null }; }
    const inf = archivo.informe;
    const fecha = (inf.elaboracion && inf.elaboracion.fecha) || null;

    const h = await huella(inf);
    const integro = h === archivo.huella && (!inf.sello || !inf.sello.huella || inf.sello.huella === h);
    agregar('integridad', integro, 'Contenido íntegro',
      integro ? 'La huella calculada coincide con la del archivo: los datos no fueron modificados después de generarse.'
        : 'La huella calculada NO coincide con la del archivo: los datos fueron modificados después de generarse, o el archivo está dañado.');

    if (archivo.firma && archivo.firma.firmante) {
      const F = archivo.firma.firmante;
      const c = clavePublicaDR
        ? await Cred.verificarPublico(F, archivo.firma.sello_publico, clavePublicaDR, fecha)
        : { valida: false, motivo: 'El verificador no tiene la clave pública de la Dirección Regional.' };
      agregar('credencial', c.valida, 'Credencial del firmante',
        c.valida ? `${c.motivo} Titular: ${F.nombre}, ${F.cargo || ''}, ${F.institucion || ''}. Emitida el ${F.emitida || '?'} por ${F.emisor || 'la Dirección Regional'}; vence el ${F.vence || '?'}.` : c.motivo);
      const f = integro && c.valida ? await Cred.verificarHuella(h, archivo.firma.firma, F.clave_firma) : false;
      agregar('firma', f, 'Firma digital del funcionario',
        f ? `La firma corresponde a la clave de la credencial de ${F.nombre} y al contenido de este informe.`
          : (integro && c.valida ? 'La firma NO corresponde al contenido del informe o a la clave de la credencial.' : 'No se comprueba porque falló una condición anterior.'));
      const mismo = !!(inf.firmante && inf.firmante.id === F.id && inf.responsable && texto(inf.responsable.nombre) === texto(F.nombre));
      agregar('identidad', mismo, 'Identidad coherente',
        mismo ? 'El responsable impreso en el informe es el titular de la credencial.' : 'El responsable del informe no coincide con el titular de la credencial.');
      if (Array.isArray(F.comunas) && F.comunas.length) {
        const fuera = comunasDe(inf).filter(c => !F.comunas.includes(c));
        agregar('ambito', fuera.length === 0, 'Comunas dentro de la habilitación',
          fuera.length ? `Comunas del informe fuera de la credencial: ${fuera.join(', ')}.` : `La credencial habilita a informar sobre ${F.comunas.join(', ')}.`);
      }
    } else {
      agregar('firma', null, 'Firma digital del funcionario',
        inf.firmante ? 'El informe se firmó con una credencial antigua (versión 1), sin clave de firma: la autoría no se puede comprobar aquí.'
          : 'Informe sin credencial: se firmó con la identidad ficticia de ejercicio. No hay autoría que comprobar.');
    }

    if (opciones.qr) {
      // Se compara con la huella recalculada del contenido, no con la declarada: así un archivo alterado tampoco "coincide" con el QR
      const q = opciones.qr;
      const coincide = q.huella === h && (!q.numero || q.numero === inf.numero) && (q.firma == null || !archivo.firma || q.firma === archivo.firma.firma);
      agregar('qr', coincide, 'Código QR del PDF',
        coincide ? 'El código QR corresponde a este archivo de datos: el PDF que lo lleva es el de estos datos.'
          : 'El código QR NO corresponde a este archivo: el PDF y los datos son de informes distintos, o alguno fue alterado.');
    }
    const modo = inf.modo || archivo.modo || '';
    agregar('modo', null, 'Modo', modo === 'ejercicio' ? 'Informe de EJERCICIO, sin valor oficial.' : `Informe en modo "${modo}".`);

    return { resultados: R, valido: !R.some(r => r.ok === false), resumen: resumenDe(archivo) };
  }

  const api = { TIPO, VERSION_ARCHIVO, huella, construir, serializar, extraerDePdf, tablas, textoQR, leerQR, validar, comprobar, resumenDe, nombreArchivoPdf, nombreArchivoDatos, comunasDe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.DatosAlfa = api;
})(typeof self !== 'undefined' ? self : this);
