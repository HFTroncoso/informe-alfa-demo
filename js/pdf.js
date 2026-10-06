/* Generador del PDF del Informe Alfa (demo Sprint 1, versión 0.3).
   La parte superior (secciones 1 a 5) se dibuja desde datos/plantilla_alfa.json tal cual.
   Las secciones 6 a 10 se dibujan con altura variable: tantas líneas como texto haya, con la
   misma letra, y la hoja se alarga lo necesario. Funciona en el navegador (window.AlfaPDF)
   y en Node para pruebas (module.exports). */
(function (raiz) {
  'use strict';

  const EXTRA_WINANSI = new Set(['–', '—', '‘', '’', '“', '”', '•', '…', '€', ' ']);
  function limpiar(texto) {
    const s = String(texto == null ? '' : texto).normalize('NFC').replace(/\s+/g, ' ').trim();
    let r = '';
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if ((c >= 0x20 && c <= 0x7E) || (c >= 0xA0 && c <= 0xFF) || EXTRA_WINANSI.has(ch)) r += ch;
      else r += '?';
    }
    return r;
  }
  function fmtFecha(iso) { if (!iso) return ''; const p = iso.split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : iso; }

  function partirLineas(texto, fuente, size, anchoMax) {
    const palabras = limpiar(texto).split(' ').filter(Boolean);
    const lineas = []; let actual = '';
    for (const p of palabras) {
      const prueba = actual ? actual + ' ' + p : p;
      if (fuente.widthOfTextAtSize(prueba, size) <= anchoMax) actual = prueba;
      else {
        if (actual) lineas.push(actual);
        // palabra más larga que la línea: se corta
        let resto = p;
        while (fuente.widthOfTextAtSize(resto, size) > anchoMax && resto.length > 1) {
          let k = resto.length - 1;
          while (k > 1 && fuente.widthOfTextAtSize(resto.slice(0, k), size) > anchoMax) k--;
          lineas.push(resto.slice(0, k)); resto = resto.slice(k);
        }
        actual = resto;
      }
    }
    if (actual) lineas.push(actual);
    return lineas;
  }

  // Medidas de la hoja original (en puntos, "desde arriba"), tomadas del PDF oficial.
  const ANCHO = 936, ALTO_BASE = 612;
  const SEP_TOP = 363.3;                       // borde superior del separador entre las secciones 5 y 6
  const LIMITE_FIJO = ALTO_BASE - SEP_TOP;     // los elementos de la plantilla con y (PDF) mayor pertenecen a la parte fija
  const GROSOR = 1.9, RAYA = 0.96, PASO = 14.5, MARGEN_INF = 61.1, TAM = 7.5;
  const X_IZQ = 55.0, X_DER = 867.6, X_COL1_FIN = 525.0, X_COL2_INI = 564.8;

  async function generar(informe, rec) {
    const { PDFDocument, StandardFonts, rgb, degrees } = rec.PDFLib;
    const P = rec.plantilla, C = rec.config, D = rec.datos, T = rec.totales;
    const S = rec.secciones || { decisiones: [], recursos: [], necesidades: [], observaciones: [] };

    const doc = await PDFDocument.create();
    doc.setTitle(`Informe Alfa ${informe.numero || ''} – EJERCICIO`);
    doc.setSubject(C.marca_agua);
    doc.setAuthor('App Informe Alfa (demo)');
    doc.setCreator('App Informe Alfa – demo Sprint 1');
    doc.setProducer('pdf-lib');
    doc.setKeywords(['ejercicio', 'sin valor', 'informe alfa', 'demo']);

    const fB = await doc.embedFont(StandardFonts.HelveticaBold);
    const fR = await doc.embedFont(StandardFonts.Helvetica);
    const fO = await doc.embedFont(StandardFonts.HelveticaOblique);
    const negro = rgb(0, 0, 0), azul = rgb(0.08, 0.14, 0.5), gris = rgb(0.55, 0.55, 0.55), rojo = rgb(0.78, 0.1, 0.1);

    // ---- 1. Medir los textos de las secciones 6 a 9 ----
    const lineasDe = (items, ancho) => (items || []).flatMap(it => partirLineas(it, fR, TAM, ancho));
    const l6 = lineasDe(S.decisiones, X_DER - X_IZQ - 4);
    const l7 = lineasDe(S.recursos, X_COL1_FIN - X_IZQ - 4);
    const l8 = lineasDe(S.necesidades, X_DER - X_COL2_INI - 4);
    const l9 = lineasDe(S.observaciones, X_COL1_FIN - X_IZQ - 4);

    // ---- 2. Geometría de la parte inferior (desde arriba) ----
    const serie = (inicio, n) => Array.from({ length: n }, (_, k) => inicio + PASO * k);
    const b6 = { top: SEP_TOP }; b6.titulo = b6.top + 11.6; b6.pregunta = b6.titulo + 13.4;
    b6.rayas = serie(b6.pregunta + 19.1, Math.max(2, l6.length)); b6.bottom = b6.rayas[b6.rayas.length - 1] + 7.6;
    const b78 = { top: b6.bottom }; b78.titulo = b78.top + 11.6;
    b78.rayas = serie(b78.titulo + 18.3, Math.max(3, l7.length, l8.length)); b78.bottom = b78.rayas[b78.rayas.length - 1] + 7.6;
    const b9 = { top: b78.bottom }; b9.titulo = b9.top + 11.6;
    b9.rayas = serie(b9.titulo + 18.3, Math.max(2, l9.length));
    const t10 = b9.titulo;
    const bordeInfTop = Math.max(b9.rayas[b9.rayas.length - 1] + 10.0, t10 + 32.9 + 10.0);
    const ALTO = bordeInfTop + GROSOR + MARGEN_INF;
    const extra = ALTO - ALTO_BASE;
    const Y = desdeArriba => ALTO - desdeArriba;

    const pagina = doc.addPage([ANCHO, ALTO]);

    // ---- 3. Parte fija: plantilla desplazada hacia arriba en "extra" ----
    function rotuloFijo(t, yPdf) {
      const f = t.bold ? fB : fR;
      const s = limpiar(t.t);
      let size = t.size;
      const w = f.widthOfTextAtSize(s, size);
      if (t.ancho_max && w > t.ancho_max) size = size * t.ancho_max / w;
      pagina.drawText(s, { x: t.x, y: yPdf, size, font: f, color: negro });
    }
    for (const r of P.rectangulos) if (r.y >= LIMITE_FIJO) pagina.drawRectangle({ x: r.x, y: r.y + extra, width: r.w, height: r.h, color: negro });
    for (const t of P.textos) if (t.y >= LIMITE_FIJO) rotuloFijo(t, t.y + extra);
    // Marco: bordes laterales, separador y borde inferior, con la altura nueva
    pagina.drawRectangle({ x: 49.9, y: Y(bordeInfTop + GROSOR), width: 1.9, height: bordeInfTop + GROSOR - 53.5, color: negro });
    pagina.drawRectangle({ x: 872.6, y: Y(bordeInfTop + GROSOR), width: 2.0, height: bordeInfTop + GROSOR - 55.5, color: negro });
    pagina.drawRectangle({ x: 51.8, y: Y(SEP_TOP + GROSOR), width: 822.8, height: GROSOR, color: negro });
    pagina.drawRectangle({ x: 51.8, y: Y(bordeInfTop + GROSOR), width: 822.8, height: GROSOR, color: negro });

    // Recuadro del logo institucional (pendiente de autorización)
    const L = P.logo;
    pagina.drawRectangle({ x: L.x, y: L.y + extra, width: L.w, height: L.h, borderColor: gris, borderWidth: 0.5, borderDashArray: [2, 2] });
    ['Logo', 'institucional', 'pendiente'].forEach((s, i) => {
      const w = fR.widthOfTextAtSize(s, 5);
      pagina.drawText(s, { x: L.x + (L.w - w) / 2, y: L.y + extra + L.h / 2 + 6 - i * 7, size: 5, font: fR, color: gris });
    });

    // ---- 4. Campos de la parte fija ----
    function texto(s, x, yPdf, size, ancho, op) {
      op = op || {};
      s = limpiar(s);
      if (!s) return;
      const f = op.font || fR;
      let w = f.widthOfTextAtSize(s, size);
      if (ancho && w > ancho) { size = Math.max(4, size * ancho / w); w = f.widthOfTextAtSize(s, size); }
      const x0 = op.centro ? x - w / 2 : x;
      pagina.drawText(s, { x: x0, y: yPdf, size, font: f, color: op.color || azul });
    }
    function campo(nombre, valor, op) {
      const c = P.campos[nombre];
      if (!c) return;
      texto(valor, c.x, c.y + extra, c.size || 7.5, c.ancho, Object.assign({ centro: c.alinear === 'centro' }, op || {}));
    }
    const id = informe.identificacion || {}, oc = informe.ocurrencia || {}, ev = informe.evento || {};
    campo('numero', informe.numero, { font: fB, color: negro });
    campo('region', id.region);
    campo('provincia', id.provincia);
    const comunas = Array.isArray(id.comunas) && id.comunas.length ? id.comunas : (id.comuna ? [id.comuna] : []);
    campo('comuna', comunas.join(', '));
    const fuentes = [].concat(id.fuentes || []);
    if (id.fuenteOtra && String(id.fuenteOtra).trim()) fuentes.push(String(id.fuenteOtra).trim());
    if (!fuentes.length && id.fuente) fuentes.push(id.fuente);
    campo('fuente', fuentes.join(', '));
    campo('contacto', id.contacto);
    campo('fecha', fmtFecha(oc.fecha));
    campo('hora', oc.hora);

    if (ev.tipo === 'OTRO') campo('otro', ev.otro);
    else if (ev.tipo && P.campos.tipo_evento[ev.tipo]) {
      const b = P.campos.tipo_evento[ev.tipo];
      texto('X', b.cx, b.cy - 3.2 + extra, 9, null, { centro: true, font: fB });
    }

    const filas = {
      AFECTADAS: T.afectadas, AISLADAS: T.aisladas, ALBERGADAS: T.albergadas, DAMNIFICADAS: T.damnificadas,
      'DAMNIFICADAS LABORALES': T.damnificadas_laborales, DESAPARECIDAS: T.desaparecidas, EVACUADAS: T.evacuadas,
      EXTRAVIADAS: T.extraviadas, FALLECIDAS: T.fallecidas, LESIONADAS: T.lesionadas
    };
    for (const nombre of Object.keys(filas)) {
      const f = filas[nombre];
      const y = P.campos.personas.filas[nombre];
      if (!f || !f.total || y == null) continue;
      for (const k of ['adH', 'adM', 'nnaH', 'nnaM', 'total']) texto(String(f[k]), P.campos.personas.columnas[k], y + extra, P.campos.personas.size, null, { centro: true, font: k === 'total' ? fB : fR });
    }
    for (const cond of D.condiciones_vivienda) {
      const v = T.viviendas[cond.id];
      const b = P.campos.viviendas[cond.nivel];
      if (v > 0 && b) texto(String(v), b.cx, b.cy - 3 + extra, 8, null, { centro: true, font: fB });
    }

    // ---- 5. Secciones 6 a 10, con altura variable ----
    const rotulo = (inicio, xMin) => P.textos.find(t => t.t.normalize('NFC').startsWith(inicio) && (xMin == null || t.x > xMin));
    const rotuloEn = (t, desdeArriba) => { if (t) rotuloFijo(t, Y(desdeArriba)); };
    const raya = (x1, x2, desdeArriba) => pagina.drawRectangle({ x: x1, y: Y(desdeArriba + RAYA), width: x2 - x1, height: RAYA, color: negro });
    const escribir = (lineas, x, rayas) => lineas.forEach((l, i) => { if (i < rayas.length) pagina.drawText(l, { x, y: Y(rayas[i] - 2.5), size: TAM, font: fR, color: azul }); });

    rotuloEn(rotulo('6. DECISIONES'), b6.titulo);
    rotuloEn(rotulo('¿Cuáles son'), b6.pregunta);
    b6.rayas.forEach(y => raya(X_IZQ, X_DER, y));
    escribir(l6, X_IZQ + 2, b6.rayas);

    rotuloEn(rotulo('7. RECURSOS'), b78.titulo);
    rotuloEn(rotulo('8. EVALUACI'), b78.titulo);
    b78.rayas.forEach(y => { raya(X_IZQ, X_COL1_FIN, y); raya(X_COL2_INI, X_DER, y); });
    escribir(l7, X_IZQ + 2, b78.rayas);
    escribir(l8, X_COL2_INI + 2.2, b78.rayas);

    rotuloEn(rotulo('9. OBSERVACIONES'), b9.titulo);
    b9.rayas.forEach(y => raya(X_IZQ, X_COL1_FIN, y));
    escribir(l9, X_IZQ + 2, b9.rayas);

    rotuloEn(rotulo('10. RESPONSABLE'), t10);
    rotuloEn(rotulo('IDENTIFICACIÓN:'), t10 + 15.0);
    rotuloEn(rotulo('FECHA:', 500), t10 + 29.6);
    rotuloEn(rotulo('HORA:', 500), t10 + 29.6);
    raya(639.5, X_DER, t10 + 18.4);
    raya(603.2, 743.9, t10 + 32.9);
    raya(780.2, X_DER, t10 + 32.9);
    const R = informe.responsable || {};
    const E = informe.elaboracion || {};
    texto(R.nombre, 641.5, Y(t10 + 15.9), 6.5, 84);
    texto([R.cargo, R.institucion].filter(Boolean).join(' · '), 650, Y(t10 + 25.4), 4.5, 142);
    texto(fmtFecha(E.fecha), 605.5, Y(t10 + 30.4), 7.5, 137);
    texto(E.hora, 783, Y(t10 + 30.4), 7.5, 83);

    async function imagen(bytes, caja, opacidad) {
      if (!bytes || !caja) return;
      const img = await doc.embedPng(bytes);
      const escala = Math.min(caja.w / img.width, caja.h / img.height);
      const w = img.width * escala, h = img.height * escala;
      pagina.drawImage(img, { x: caja.x + (caja.w - w) / 2, y: Y(caja.top + caja.h) + (caja.h - h) / 2, width: w, height: h, opacity: opacidad });
    }
    await imagen(rec.firmaPng, { x: 728, w: 70, h: 26, top: t10 - 8.6 }, 0.95);
    await imagen(rec.timbrePng, { x: 808, w: 58, h: 58, top: t10 - 17.1 }, 0.85);

    // ---- 6. Marca de agua, aviso superior y pie ----
    const M = P.campos.marca_agua;
    const marca = limpiar(C.marca_agua);
    const wM = fB.widthOfTextAtSize(marca, M.size);
    const rad = M.angulo * Math.PI / 180;
    const cy = ALTO / 2;
    pagina.drawText(marca, {
      x: M.cx - (wM / 2) * Math.cos(rad) + (M.size / 2) * Math.sin(rad),
      y: cy - (wM / 2) * Math.sin(rad) - (M.size / 2) * Math.cos(rad),
      size: M.size, font: fB, color: rgb(0.85, 0.1, 0.1), opacity: 0.16, rotate: degrees(M.angulo)
    });
    const A = P.campos.aviso_superior;
    texto(`INFORME DE EJERCICIO – SIN VALOR OFICIAL – N° ${informe.numero || ''}`, A.cx, A.cy + extra, A.size, null, { centro: true, font: fB, color: rojo });
    const textoPie = `Documento de ejercicio generado en el teléfono con la app Informe Alfa (demo Sprint 1, versión ${C.version_app}) el ${fmtFecha(E.fecha)} a las ${E.hora || ''}. Firma y timbre ficticios. No respalda solicitudes de recursos.`;
    pagina.drawText(limpiar(textoPie), { x: 52, y: Y(bordeInfTop + 12), size: 6, font: fO, color: gris });

    return await doc.save();
  }

  const api = { generar, limpiar, partirLineas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.AlfaPDF = api;
})(typeof self !== 'undefined' ? self : this);
