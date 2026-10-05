/* Generador del PDF del Informe Alfa (demo Sprint 1).
   Dibuja la disposición oficial desde datos/plantilla_alfa.json con pdf-lib y estampa los datos
   del informe, la marca de agua de ejercicio, la firma y el timbre ficticios.
   Funciona en el navegador (window.AlfaPDF) y en Node para pruebas (module.exports). */
(function (raiz) {
  'use strict';

  // Caracteres que las fuentes estándar de PDF (WinAnsi) pueden representar. El resto se reemplaza.
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
    const palabras = limpiar(texto).split(' ');
    const lineas = []; let actual = '';
    for (const p of palabras) {
      const prueba = actual ? actual + ' ' + p : p;
      if (fuente.widthOfTextAtSize(prueba, size) <= anchoMax) actual = prueba;
      else { if (actual) lineas.push(actual); actual = p; }
    }
    if (actual) lineas.push(actual);
    return lineas;
  }

  async function generar(informe, rec) {
    const { PDFDocument, StandardFonts, rgb, degrees } = rec.PDFLib;
    const P = rec.plantilla, C = rec.config, D = rec.datos, T = rec.totales;

    const doc = await PDFDocument.create();
    doc.setTitle(`Informe Alfa ${informe.numero || ''} – EJERCICIO`);
    doc.setSubject(C.marca_agua);
    doc.setAuthor('App Informe Alfa (demo)');
    doc.setCreator('App Informe Alfa – demo Sprint 1');
    doc.setProducer('pdf-lib');
    doc.setKeywords(['ejercicio', 'sin valor', 'informe alfa', 'demo']);

    const pagina = doc.addPage([P.pagina.ancho, P.pagina.alto]);
    const fB = await doc.embedFont(StandardFonts.HelveticaBold);
    const fR = await doc.embedFont(StandardFonts.Helvetica);
    const fO = await doc.embedFont(StandardFonts.HelveticaOblique);
    const negro = rgb(0, 0, 0), azul = rgb(0.08, 0.14, 0.5), gris = rgb(0.55, 0.55, 0.55), rojo = rgb(0.78, 0.1, 0.1);

    // 1. Marco, separadores y líneas del formato
    for (const r of P.rectangulos) pagina.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: negro });

    // 2. Rótulos fijos del formato, ajustados al ancho original (Calibri es más angosta que Helvetica)
    for (const t of P.textos) {
      const f = t.bold ? fB : fR;
      const texto = limpiar(t.t);
      let size = t.size;
      const w = f.widthOfTextAtSize(texto, size);
      if (t.ancho_max && w > t.ancho_max) size = size * t.ancho_max / w;
      pagina.drawText(texto, { x: t.x, y: t.y, size, font: f, color: negro });
    }

    // 3. Recuadro del logo institucional (pendiente de autorización)
    const L = P.logo;
    pagina.drawRectangle({ x: L.x, y: L.y, width: L.w, height: L.h, borderColor: gris, borderWidth: 0.5, borderDashArray: [2, 2] });
    for (const [i, s] of ['Logo', 'institucional', 'pendiente'].entries()) {
      const w = fR.widthOfTextAtSize(s, 5);
      pagina.drawText(s, { x: L.x + (L.w - w) / 2, y: L.y + L.h / 2 + 6 - i * 7, size: 5, font: fR, color: gris });
    }

    // 4. Campos de texto
    function campo(nombre, valor, op) {
      op = op || {};
      const c = P.campos[nombre];
      const s = limpiar(valor);
      if (!c || !s) return;
      const f = op.font || fR;
      let size = c.size || 7.5;
      let w = f.widthOfTextAtSize(s, size);
      if (c.ancho && w > c.ancho) { size = Math.max(4, size * c.ancho / w); w = f.widthOfTextAtSize(s, size); }
      const x = c.alinear === 'centro' ? c.x - w / 2 : c.x;
      pagina.drawText(s, { x, y: c.y, size, font: f, color: op.color || azul });
    }
    function centrado(texto, cx, y, size, f, color) {
      const s = limpiar(texto);
      const w = (f || fR).widthOfTextAtSize(s, size);
      pagina.drawText(s, { x: cx - w / 2, y, size, font: f || fR, color: color || azul });
    }
    function parrafo(nombre, texto) {
      const c = P.campos[nombre];
      if (!c || !texto) return;
      let size = c.size, lineas;
      for (;;) {
        lineas = partirLineas(texto, fR, size, c.ancho);
        if (lineas.length <= c.lineas.length || size <= 5) break;
        size -= 0.5;
      }
      lineas.slice(0, c.lineas.length).forEach((l, i) => pagina.drawText(l, { x: c.x, y: c.lineas[i], size, font: fR, color: azul }));
    }

    const id = informe.identificacion || {}, oc = informe.ocurrencia || {}, ev = informe.evento || {};
    campo('numero', informe.numero, { font: fB, color: negro });
    campo('region', id.region);
    campo('provincia', id.provincia);
    campo('comuna', id.comuna);
    campo('fuente', id.fuente);
    campo('contacto', id.contacto);
    campo('fecha', fmtFecha(oc.fecha));
    campo('hora', oc.hora);

    // 5. Tipo de evento: cruz en la casilla, u "Otro"
    if (ev.tipo === 'OTRO') campo('otro', ev.otro);
    else if (ev.tipo && P.campos.tipo_evento[ev.tipo]) {
      const b = P.campos.tipo_evento[ev.tipo];
      centrado('X', b.cx, b.cy - 3.2, 9, fB, azul);
    }

    // 6. Afectación a personas (solo las filas que la demo alimenta)
    const filas = { AFECTADAS: T.afectadas, DAMNIFICADAS: T.damnificadas, ALBERGADAS: T.albergadas };
    for (const nombre of Object.keys(filas)) {
      const f = filas[nombre];
      const y = P.campos.personas.filas[nombre];
      if (!f || !f.total || y == null) continue;
      for (const k of ['adH', 'adM', 'nnaH', 'nnaM', 'total']) centrado(String(f[k]), P.campos.personas.columnas[k], y, P.campos.personas.size, k === 'total' ? fB : fR);
    }

    // 7. Daño a viviendas
    for (const cond of D.condiciones_vivienda) {
      const v = T.viviendas[cond.id];
      const b = P.campos.viviendas[cond.nivel];
      if (v > 0 && b) centrado(String(v), b.cx, b.cy - 3, 8, fB);
    }

    // 8. Necesidades y observaciones (las secciones 6 y 7 no se capturan en esta demo)
    if (informe.hayNecesidad === true) {
      const lineas = (informe.necesidades || []).filter(n => n.elemento).map((n, i) => {
        const el = D.catalogo_elementos.find(e => e.id === n.elemento);
        const nombre = n.elemento === 'otro' ? (n.otroNombre || 'Otro') : (el ? el.nombre : n.elemento);
        const unidad = el && el.unidad ? ' ' + el.unidad : '';
        return `${i + 1}. ${n.cantidad}${unidad} de ${nombre}. ¿Para qué?: ${n.paraQue}`;
      });
      parrafo('necesidades', lineas.join(' // '));
    } else if (informe.hayNecesidad === false) {
      parrafo('necesidades', 'Sin necesidades que no puedan cubrirse con recursos locales al momento de este informe.');
    }

    const obs = [];
    const J = informe.justificaciones || {};
    for (const clave of Object.keys(J)) {
      if (!J[clave] || !String(J[clave]).trim()) continue;
      const regla = D.reglas.find(r => r.id === clave.split(':')[0]);
      obs.push(`${regla ? regla.titulo : clave}: ${J[clave].trim()}`);
    }
    obs.push(`Informe de EJERCICIO generado con la app Informe Alfa (demo Sprint 1). Personas únicas registradas: ${T.personas}; viviendas dañadas: ${T.viviendas_danadas}.`);
    parrafo('observaciones', obs.join(' // '));

    // 9. Responsable del informe (identidad ficticia de ejercicio)
    const R = informe.responsable || {};
    campo('identificacion', R.nombre);
    campo('cargo', [R.cargo, R.institucion].filter(Boolean).join(' · '));
    const E = informe.elaboracion || {};
    campo('fecha_elaboracion', fmtFecha(E.fecha));
    campo('hora_elaboracion', E.hora);

    // 10. Firma y timbre ficticios
    async function imagen(bytes, caja, opacidad) {
      if (!bytes || !caja) return;
      const img = await doc.embedPng(bytes);
      const escala = Math.min(caja.w / img.width, caja.h / img.height);
      const w = img.width * escala, h = img.height * escala;
      pagina.drawImage(img, { x: caja.x + (caja.w - w) / 2, y: caja.y + (caja.h - h) / 2, width: w, height: h, opacity: opacidad });
    }
    await imagen(rec.firmaPng, P.campos.firma, 0.95);
    await imagen(rec.timbrePng, P.campos.timbre, 0.85);

    // 11. Marca de agua y avisos de ejercicio
    const M = P.campos.marca_agua;
    const marca = limpiar(C.marca_agua);
    const wM = fB.widthOfTextAtSize(marca, M.size);
    const rad = M.angulo * Math.PI / 180;
    pagina.drawText(marca, {
      x: M.cx - (wM / 2) * Math.cos(rad) + (M.size / 2) * Math.sin(rad),
      y: M.cy - (wM / 2) * Math.sin(rad) - (M.size / 2) * Math.cos(rad),
      size: M.size, font: fB, color: rgb(0.85, 0.1, 0.1), opacity: 0.16, rotate: degrees(M.angulo)
    });
    const A = P.campos.aviso_superior;
    centrado(`INFORME DE EJERCICIO – SIN VALOR OFICIAL – N° ${informe.numero || ''}`, A.cx, A.cy, A.size, fB, rojo);
    const pie = P.campos.pie;
    const textoPie = `Documento de ejercicio generado en el teléfono con la app Informe Alfa (demo Sprint 1, versión ${C.version_app}) el ${fmtFecha(E.fecha)} a las ${E.hora || ''}. Firma y timbre ficticios. No respalda solicitudes de recursos.`;
    pagina.drawText(limpiar(textoPie), { x: pie.x, y: pie.y, size: pie.size, font: fO, color: gris });

    return await doc.save();
  }

  const api = { generar, limpiar, partirLineas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.AlfaPDF = api;
})(typeof self !== 'undefined' ? self : this);
