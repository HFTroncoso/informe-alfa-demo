/* App Informe Alfa – demo Sprint 1 (versión 0.2).
   Flujo de pantallas y enlace entre el motor de reglas (reglas.js), el generador de PDF (pdf.js)
   y el almacén local (almacen.js). Sin servidor: todo ocurre en el teléfono. */
(function () {
  'use strict';

  const ORDEN = ['inicio', 'donde', 'evento', 'viviendas', 'personas', 'necesidad', 'revision', 'listo'];
  const TITULOS = {
    inicio: 'Modo ejercicio',
    donde: '¿Dónde y cuándo ocurrió?',
    evento: '¿Qué pasó?',
    viviendas: 'Viviendas y sus ocupantes',
    personas: 'Otras personas afectadas',
    necesidad: 'Necesidades',
    revision: 'Revisa y firma',
    listo: 'Informe generado'
  };
  const PASOS_TOTAL = 6;
  const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  let CONFIG = null, DATOS = null, PLANTILLA = null;
  let informe = null;
  let pantalla = 'inicio';
  let ultimoPdf = null;          // Uint8Array del último PDF generado
  let eventoInstalacion = null;  // beforeinstallprompt (Android/Chrome)
  let imagenes = null;           // bytes de firma y timbre

  const $ = (sel, raiz) => (raiz || document).querySelector(sel);
  const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));

  // ---------- utilidades ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('visible'), ms || 3500);
  }
  function dos(n) { return String(n).padStart(2, '0'); }
  function hoyISO() { const d = new Date(); return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`; }
  function ahoraHHMM() { const d = new Date(); return `${dos(d.getHours())}:${dos(d.getMinutes())}`; }
  const fmtFecha = iso => Reglas.fmtFecha(iso);
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''; }
  function obtener(obj, ruta) { return ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
  function asignar(obj, ruta, valor) {
    const partes = ruta.split('.');
    let o = obj;
    for (let i = 0; i < partes.length - 1; i++) { if (o[partes[i]] == null) o[partes[i]] = {}; o = o[partes[i]]; }
    o[partes[partes.length - 1]] = valor;
  }
  function ocupantes(v) { return v ? (v.adH | 0) + (v.adM | 0) + (v.nnaH | 0) + (v.nnaM | 0) : 0; }
  function tipoTexto(inf) { return inf.evento.tipo === 'OTRO' ? (inf.evento.otro || 'Otro') : cap(inf.evento.tipo); }

  // ---------- estado ----------
  function filaVacia() { return { adH: 0, adM: 0, nnaH: 0, nnaM: 0 }; }
  function necesidadVacia() { return { elemento: '', otroNombre: '', cantidad: 0, paraQue: '' }; }

  function nuevoInforme() {
    const viviendas = {};
    DATOS.condiciones_vivienda.forEach(c => {
      viviendas[c.id] = Object.assign(filaVacia(), { viviendas: 0, hayAlbergue: false, albergue: filaVacia() });
    });
    const otras = {};
    DATOS.categorias_personas.forEach(c => {
      otras[c.id] = Object.assign(filaVacia(), { hay: false });
      if (c.requiere_denuncia) otras[c.id].denuncia = false;
    });
    return {
      version: CONFIG.version_app,
      modo: 'ejercicio',
      numero: null,
      amplia: null,
      creado: new Date().toISOString(),
      identificacion: { region: CONFIG.region.nombre, provincia: '', comuna: '', fuentes: [], fuenteOtra: '', contacto: '' },
      ocurrencia: { fecha: hoyISO(), hora: ahoraHHMM() },
      evento: { tipo: '', otro: '' },
      viviendas,
      otras,
      hayNecesidad: null,
      necesidades: [necesidadVacia()],
      justificaciones: {},
      responsable: Object.assign({}, CONFIG.responsable_ejercicio),
      elaboracion: null
    };
  }

  // Completa informes guardados con versiones anteriores de la app.
  function normalizar(inf) {
    const base = nuevoInforme();
    inf.identificacion = Object.assign({}, base.identificacion, inf.identificacion || {});
    if (!Array.isArray(inf.identificacion.fuentes)) inf.identificacion.fuentes = [];
    if (inf.identificacion.fuente) {
      if (!inf.identificacion.fuentes.length && !inf.identificacion.fuenteOtra) inf.identificacion.fuenteOtra = inf.identificacion.fuente;
      delete inf.identificacion.fuente;
    }
    inf.ocurrencia = Object.assign({}, base.ocurrencia, inf.ocurrencia || {});
    inf.evento = Object.assign({}, base.evento, inf.evento || {});
    inf.viviendas = inf.viviendas || {};
    for (const k of Object.keys(base.viviendas)) {
      inf.viviendas[k] = Object.assign({}, base.viviendas[k], inf.viviendas[k] || {});
      inf.viviendas[k].albergue = Object.assign(filaVacia(), inf.viviendas[k].albergue || {});
    }
    inf.otras = inf.otras || {};
    for (const k of Object.keys(base.otras)) inf.otras[k] = Object.assign({}, base.otras[k], inf.otras[k] || {});
    if (!Array.isArray(inf.necesidades) || !inf.necesidades.length) inf.necesidades = [necesidadVacia()];
    if (inf.hayNecesidad === undefined) inf.hayNecesidad = null;
    inf.justificaciones = inf.justificaciones || {};
    if (inf.amplia === undefined) inf.amplia = null;
    inf.responsable = inf.responsable || Object.assign({}, CONFIG.responsable_ejercicio);
    return inf;
  }

  function guardar() { if (informe && !informe.elaboracion) Almacen.guardarBorrador(informe); }

  // ---------- numeración ----------
  function siguienteLetra(base) {
    const usadas = Almacen.leerHistorial()
      .filter(h => h.numero && h.numero.startsWith(base + '-'))
      .map(h => h.numero.slice(base.length + 1));
    let i = 0;
    while (i < LETRAS.length - 1 && usadas.includes(LETRAS[i])) i++;
    return LETRAS[i];
  }
  function numeroPrevisto() {
    if (informe.amplia) return `${informe.amplia.base}-${siguienteLetra(informe.amplia.base)}`;
    return Almacen.numeroPrevisto(CONFIG.numero.prefijo);
  }
  function asignarNumero() {
    if (informe.amplia) return `${informe.amplia.base}-${siguienteLetra(informe.amplia.base)}`;
    return Almacen.asignarNumero(CONFIG.numero.prefijo);
  }

  // ---------- arranque ----------
  async function iniciar() {
    try {
      const archivos = ['datos/config.json', 'datos/reglas.json', 'datos/plantilla_alfa.json'];
      const [cfg, dat, pla] = await Promise.all(archivos.map(u => fetch(u).then(r => { if (!r.ok) throw new Error('No se pudo leer ' + u); return r.json(); })));
      CONFIG = cfg; DATOS = dat; PLANTILLA = pla;
    } catch (e) {
      $('#app').innerHTML = `<p class="error">No se pudieron cargar los datos de la app (${esc(e.message)}). Ábrela una vez con conexión para que quede guardada en el teléfono.</p>`;
      return;
    }
    Reglas.cargar(DATOS);
    $('#version-app').textContent = CONFIG.version_app;
    construirListas();
    enlazarEventos();
    registrarSW();
    estadoConexion();
    if (!Almacen.disponible()) toast('Este navegador no permite guardar borradores en el teléfono.', 6000);
    mostrar('inicio');
  }

  function construirListas() {
    const sel = $('#in-comuna');
    const provincias = [...new Set(CONFIG.comunas.map(c => c.provincia))];
    sel.innerHTML = '<option value="">Elige la comuna…</option>' + provincias.map(p =>
      `<optgroup label="Provincia de ${esc(p)}">` +
      CONFIG.comunas.filter(c => c.provincia === p).map(c => `<option value="${esc(c.comuna)}">${esc(c.comuna)}</option>`).join('') +
      '</optgroup>').join('');
    $('#in-region').textContent = CONFIG.region.nombre;

    $('#lista-fuentes').innerHTML = CONFIG.fuentes_frecuentes.map(f =>
      `<label class="opcion"><input type="checkbox" name="fuente" value="${esc(f)}"><span><strong>${esc(f)}</strong></span></label>`).join('');

    $('#lista-eventos').innerHTML = DATOS.tipos_evento.map(t =>
      `<label class="opcion"><input type="radio" name="tipo-evento" value="${esc(t.id)}"><span><strong>${esc(cap(t.id))}</strong><small>${esc(t.ejemplo)}</small></span></label>`).join('');

    $('#tarjetas-viviendas').innerHTML = DATOS.condiciones_vivienda.map(tarjetaVivienda).join('');
    $('#tarjetas-personas').innerHTML = DATOS.categorias_personas.map(tarjetaCategoria).join('');
  }

  function gridPersonas(prefijo) {
    return `
      <div class="grid4">
        <label>Hombres adultos<input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-ruta="${prefijo}.adH"></label>
        <label>Mujeres adultas<input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-ruta="${prefijo}.adM"></label>
        <label>Niños y adolescentes (H)<input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-ruta="${prefijo}.nnaH"></label>
        <label>Niñas y adolescentes (M)<input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-ruta="${prefijo}.nnaM"></label>
      </div>`;
  }

  function tarjetaVivienda(c) {
    const r = `viviendas.${c.id}`;
    return `
      <section class="tarjeta" data-condicion="${esc(c.id)}">
        <h3>${c.orden}. ${esc(c.titulo)}</h3>
        <p class="ayuda">${esc(c.observable)}
          <span class="nivel">El formato lo registra como <strong>${esc(c.nivel_largo)}</strong>; sus ocupantes cuentan como <strong>${esc(c.ocupantes_cuentan_como)}</strong>.</span></p>
        <label class="campo">¿Cuántas viviendas quedaron así?
          <input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-ruta="${r}.viviendas"></label>
        <p class="sub">¿Cuántas personas vivían en ellas?</p>
        ${gridPersonas(r)}
        ${c.pregunta_albergue ? `
        <label class="conmutador"><input type="checkbox" data-ruta="${r}.hayAlbergue"><span>¿Alguna de estas personas está en un albergue habilitado?</span></label>
        <div class="bloque-albergue" data-albergue="${esc(c.id)}" hidden>
          <p class="sub">¿Cuántas de ellas están en el albergue?</p>
          <p class="ayuda">Solo cuenta un lugar habilitado por la autoridad. Quien se queda con familiares o vecinos sigue siendo damnificado, pero no albergado.</p>
          ${gridPersonas(r + '.albergue')}
        </div>` : ''}
        <p class="mini-total" data-total="${esc(c.id)}"></p>
      </section>`;
  }

  function tarjetaCategoria(c) {
    const r = `otras.${c.id}`;
    return `
      <section class="tarjeta categoria" data-categoria="${esc(c.id)}">
        <label class="conmutador"><input type="checkbox" data-ruta="${r}.hay"><span><strong>${esc(c.pregunta)}</strong><small>Casilla del formato: ${esc(c.etiqueta)}</small></span></label>
        <div class="bloque-categoria" data-bloque="${esc(c.id)}" hidden>
          <p class="ayuda"><strong>Definición:</strong> ${esc(c.definicion)} <span class="fuente">(${esc(c.fuente)})</span></p>
          <p class="ayuda"><strong>No cuenta aquí:</strong> ${esc(c.contraejemplo)}</p>
          ${c.requiere_denuncia ? `<label class="conmutador"><input type="checkbox" data-ruta="${r}.denuncia"><span>Existe denuncia de presunta desgracia</span></label>` : ''}
          <p class="sub">¿Cuántas personas?</p>
          ${gridPersonas(r)}
          <p class="mini-total" data-total-cat="${esc(c.id)}"></p>
        </div>
      </section>`;
  }

  function renderNecesidades() {
    const opciones = '<option value="">Elige el elemento…</option>' +
      DATOS.catalogo_elementos.map(e => `<option value="${esc(e.id)}">${esc(e.nombre)}</option>`).join('');
    const varias = informe.necesidades.length > 1;
    $('#lista-necesidades').innerHTML = informe.necesidades.map((nec, i) => `
      <section class="tarjeta necesidad" data-necesidad="${i}">
        <div class="fila-titulo"><h3>Necesidad ${i + 1}</h3>${varias ? `<button type="button" class="enlace" data-accion="quitar-necesidad" data-i="${i}">Quitar</button>` : ''}</div>
        <label class="campo">¿Qué elemento?
          <select data-ruta="necesidades.${i}.elemento">${opciones}</select></label>
        <label class="campo" data-otro="${i}" hidden>¿Cuál?
          <input type="text" data-ruta="necesidades.${i}.otroNombre" placeholder="Nombre del elemento"></label>
        <p class="ayuda" data-criterio="${i}" hidden></p>
        <label class="campo">¿Cuántos?
          <input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-ruta="necesidades.${i}.cantidad"></label>
        <p class="sugerencia" data-sugerencia="${i}" hidden><span></span> <button type="button" class="enlace" data-accion="usar-sugerido" data-i="${i}">Usar esa cantidad</button></p>
        <label class="campo">¿Para qué se requiere?
          <textarea rows="3" data-ruta="necesidades.${i}.paraQue" placeholder="Por ejemplo: para 11 personas damnificadas alojadas en el gimnasio municipal"></textarea></label>
      </section>`).join('');
  }

  // ---------- eventos ----------
  function enlazarEventos() {
    document.addEventListener('input', alCambiar);
    document.addEventListener('change', alCambiar);
    $('#btn-atras').addEventListener('click', atras);
    $('#btn-siguiente').addEventListener('click', siguiente);
    $('#btn-nuevo').addEventListener('click', () => {
      if (Almacen.leerBorrador() && !confirm('Hay un borrador guardado que se reemplazará. ¿Empezar un informe nuevo?')) return;
      informe = nuevoInforme(); guardar(); mostrar('donde');
    });
    $('#btn-continuar').addEventListener('click', () => {
      const b = Almacen.leerBorrador();
      if (!b) { toast('No hay un borrador guardado.'); return; }
      informe = normalizar(b);
      mostrar('donde');
    });
    $('#btn-descartar').addEventListener('click', () => {
      if (confirm('¿Descartar el borrador guardado?')) { Almacen.borrarBorrador(); informe = null; mostrar('inicio'); }
    });
    $('#dlg-cerrar').addEventListener('click', () => $('#dlg-bloqueo').close());
    $('#btn-instalar').addEventListener('click', instalar);
    window.addEventListener('online', estadoConexion);
    window.addEventListener('offline', estadoConexion);
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); eventoInstalacion = e; if (pantalla === 'inicio') renderInicio(); });
    window.addEventListener('appinstalled', () => { eventoInstalacion = null; toast('App instalada. Búscala en la pantalla de inicio del teléfono.'); if (pantalla === 'inicio') renderInicio(); });
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-accion]');
      if (b) accionDinamica(b.dataset.accion, b.dataset);
    });
  }

  function alCambiar(e) {
    const el = e.target;
    if (!informe || !el) return;
    if (el.name === 'tipo-evento') {
      if (el.checked) { informe.evento.tipo = el.value; $('#campo-otro').hidden = el.value !== 'OTRO'; guardar(); }
      return;
    }
    if (el.name === 'hay-necesidad') {
      if (el.checked) {
        informe.hayNecesidad = el.value === 'si';
        $('#bloque-necesidad').hidden = !informe.hayNecesidad;
        if (informe.hayNecesidad) { renderNecesidades(); cargarValores(); }
        guardar();
      }
      return;
    }
    if (el.name === 'fuente') {
      informe.identificacion.fuentes = $$('input[name="fuente"]:checked').map(x => x.value);
      guardar();
      return;
    }
    const ruta = el.dataset ? el.dataset.ruta : null;
    if (!ruta) return;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number') v = el.value === '' ? 0 : Math.max(0, parseInt(el.value, 10) || 0);
    else v = el.value;
    asignar(informe, ruta, v);

    if (ruta === 'identificacion.comuna') {
      const c = CONFIG.comunas.find(x => x.comuna === v);
      informe.identificacion.provincia = c ? c.provincia : '';
      $('#in-provincia').textContent = informe.identificacion.provincia || '—';
    }
    if (ruta.endsWith('.hayAlbergue')) {
      const bloque = $(`[data-albergue="${ruta.split('.')[1]}"]`);
      if (bloque) bloque.hidden = !v;
    }
    const mHay = ruta.match(/^otras\.(\w+)\.hay$/);
    if (mHay) { const bloque = $(`[data-bloque="${mHay[1]}"]`); if (bloque) bloque.hidden = !v; }
    const mNec = ruta.match(/^necesidades\.(\d+)\.(\w+)$/);
    if (mNec) {
      const i = +mNec[1];
      if (mNec[2] === 'elemento') { const otro = $(`[data-otro="${i}"]`); if (otro) otro.hidden = v !== 'otro'; }
      actualizarSugerencia(i);
    }
    guardar();
    if (pantalla === 'viviendas') actualizarResumenVivo();
    if (pantalla === 'personas') actualizarResumenPersonas();
  }

  function cargarValores() {
    const sec = $(`.pantalla[data-pantalla="${pantalla}"]`);
    if (!sec || !informe) return;
    $$('[data-ruta]', sec).forEach(el => {
      const v = obtener(informe, el.dataset.ruta);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'number') el.value = (v === 0 || v == null) ? '' : v;
      else el.value = v == null ? '' : v;
    });
    if (pantalla === 'donde') {
      $('#in-provincia').textContent = informe.identificacion.provincia || '—';
      $$('input[name="fuente"]').forEach(x => { x.checked = (informe.identificacion.fuentes || []).includes(x.value); });
    }
    if (pantalla === 'evento') {
      $$('input[name="tipo-evento"]').forEach(r => { r.checked = r.value === informe.evento.tipo; });
      $('#campo-otro').hidden = informe.evento.tipo !== 'OTRO';
    }
    if (pantalla === 'viviendas') {
      DATOS.condiciones_vivienda.forEach(c => { const b = $(`[data-albergue="${c.id}"]`); if (b) b.hidden = !informe.viviendas[c.id].hayAlbergue; });
      actualizarResumenVivo();
    }
    if (pantalla === 'personas') {
      DATOS.categorias_personas.forEach(c => { const b = $(`[data-bloque="${c.id}"]`); if (b) b.hidden = !informe.otras[c.id].hay; });
      actualizarResumenPersonas();
    }
    if (pantalla === 'necesidad') {
      $$('input[name="hay-necesidad"]').forEach(r => {
        r.checked = (informe.hayNecesidad === true && r.value === 'si') || (informe.hayNecesidad === false && r.value === 'no');
      });
      $('#bloque-necesidad').hidden = informe.hayNecesidad !== true;
      informe.necesidades.forEach((nec, i) => {
        const otro = $(`[data-otro="${i}"]`); if (otro) otro.hidden = nec.elemento !== 'otro';
        actualizarSugerencia(i);
      });
    }
  }

  function actualizarResumenVivo() {
    if (!informe) return;
    const t = Reglas.totales(informe);
    $('#resumen-vivo').innerHTML = `
      <div class="fila"><span>Viviendas dañadas</span><strong>${t.viviendas_danadas}</strong></div>
      <div class="fila"><span>Personas afectadas (de estas viviendas)</span><strong>${t.afectadas.total - ocupantesOtras('afectadas')}</strong></div>
      <div class="fila"><span>Personas damnificadas</span><strong>${t.damnificadas.total}</strong></div>
      <div class="fila"><span>Personas en albergue (de estas viviendas)</span><strong>${t.albergadas_viviendas}</strong></div>`;
    DATOS.condiciones_vivienda.forEach(c => {
      const v = informe.viviendas[c.id];
      const el = $(`[data-total="${c.id}"]`);
      if (el) el.textContent = `${v.viviendas | 0} vivienda(s) · ${ocupantes(v)} persona(s)` + (c.pregunta_albergue && v.hayAlbergue ? ` · ${ocupantes(v.albergue)} en albergue` : '');
    });
  }
  function ocupantesOtras(cat) { const o = informe.otras && informe.otras[cat]; return o && o.hay ? ocupantes(o) : 0; }

  function actualizarResumenPersonas() {
    if (!informe) return;
    const t = Reglas.totales(informe);
    const nombres = { afectadas: 'Afectadas', aisladas: 'Aisladas', albergadas: 'Albergadas', damnificadas: 'Damnificadas', damnificadas_laborales: 'Damnificadas laborales', desaparecidas: 'Desaparecidas', evacuadas: 'Evacuadas', extraviadas: 'Extraviadas', fallecidas: 'Fallecidas', lesionadas: 'Lesionadas' };
    const filas = Reglas.CATEGORIAS.filter(k => t[k].total > 0).map(k => `<tr><td>${nombres[k]}</td><td>${t[k].total}</td></tr>`).join('');
    $('#resumen-personas').innerHTML = `
      <table>${filas || '<tr><td>Sin personas registradas todavía</td><td></td></tr>'}</table>
      <div class="fila"><span>Personas únicas (aprox.)</span><strong>${t.personas}</strong></div>
      <p class="nota">Incluye a las personas de las viviendas dañadas. Las albergadas no se suman porque ya están contadas como damnificadas, evacuadas o aisladas.</p>`;
    DATOS.categorias_personas.forEach(c => {
      const el = $(`[data-total-cat="${c.id}"]`);
      if (el) el.textContent = `${ocupantesOtras(c.id)} persona(s) en esta categoría`;
    });
  }

  function actualizarSugerencia(i) {
    if (!informe || informe.hayNecesidad !== true) return;
    const n = informe.necesidades[i];
    const crit = $(`[data-criterio="${i}"]`), sug = $(`[data-sugerencia="${i}"]`);
    if (!n || !crit || !sug) return;
    const el = Reglas.elemento(n.elemento);
    if (!el || !el.criterio) { crit.hidden = true; sug.hidden = true; return; }
    crit.hidden = false;
    crit.textContent = `Criterio del IT-LOG-01: ${el.criterio}.`;
    const s = Reglas.sugerencia(n.elemento, informe);
    if (s) {
      sug.hidden = false;
      $('span', sug).textContent = `En el informe hay ${s.baseValor} ${s.baseNombre}: cuadran hasta ${s.tope} ${el.unidad}.`;
      $('button', sug).hidden = (n.cantidad | 0) === s.tope;
    } else sug.hidden = true;
  }

  // ---------- navegación ----------
  function mostrar(id) {
    pantalla = id;
    $$('.pantalla').forEach(s => { s.hidden = s.dataset.pantalla !== id; });
    $('#titulo-pantalla').textContent = TITULOS[id];
    const idx = ORDEN.indexOf(id);
    const enFlujo = idx >= 1 && idx <= PASOS_TOTAL;
    $('#progreso').hidden = !enFlujo;
    if (enFlujo) {
      $('#progreso-texto').textContent = `Paso ${idx} de ${PASOS_TOTAL}`;
      $('#progreso-barra').style.width = `${(idx / PASOS_TOTAL) * 100}%`;
    }
    $('#nav').hidden = !enFlujo;
    const btn = $('#btn-siguiente');
    btn.textContent = id === 'revision' ? 'Firmar y generar el PDF' : 'Siguiente';
    btn.classList.toggle('firmar', id === 'revision');
    btn.disabled = false;
    if (id === 'inicio') renderInicio();
    if (id === 'necesidad') renderNecesidades();
    if (id === 'revision') renderRevision();
    if (id === 'listo') renderListo();
    if (enFlujo) cargarValores();
    window.scrollTo(0, 0);
  }

  function atras() {
    const i = ORDEN.indexOf(pantalla);
    mostrar(i <= 1 ? 'inicio' : ORDEN[i - 1]);
  }

  function siguiente() {
    if (pantalla === 'revision') return firmar();
    if (pantalla === 'necesidad' && informe.hayNecesidad === null) { toast('Indica si necesitas pedir algo o no por ahora.'); return; }
    const hallazgos = Reglas.evaluar(informe, { pantalla });
    if (hallazgos.length) { mostrarBloqueo(hallazgos[0]); return; }
    mostrar(ORDEN[ORDEN.indexOf(pantalla) + 1]);
  }

  // ---------- bloqueos con caso de solución ----------
  function mostrarBloqueo(h) {
    const dlg = $('#dlg-bloqueo');
    const esJust = h.nivel === 'justificacion';
    $('#dlg-contenido').innerHTML = `
      <p class="etiqueta ${esJust ? 'amarilla' : 'roja'}">${esJust ? 'Bloqueo con justificación' : 'Bloqueo'}</p>
      <h2 id="dlg-titulo">${esc(h.titulo)}</h2>
      <h3>Qué no cuadra</h3>
      <p>${esc(h.que_no_cuadra)}</p>
      <h3>Por qué</h3>
      <p>${esc(h.por_que)} <span class="fuente">Fuente: ${esc(h.fuente)}.</span></p>
      <h3>Cómo resolverlo</h3>
      <div class="opciones">${h.como_resolver.map((o, i) => `<button type="button" class="opcion-resolver" data-i="${i}">${esc(o.texto)}</button>`).join('')}</div>
      <div id="dlg-justificar" hidden>
        <label>Escribe el motivo. Quedará impreso en Observaciones.
          <textarea id="dlg-motivo" rows="3" placeholder="Puedes dictarlo con el micrófono del teclado"></textarea></label>
        <button type="button" id="dlg-guardar-motivo" class="primario">Guardar el motivo y continuar</button>
      </div>
      <details><summary>Caso parecido</summary><p>${esc(h.caso_parecido)}</p></details>`;

    $$('.opcion-resolver', dlg).forEach(b => b.addEventListener('click', () => {
      const o = h.como_resolver[+b.dataset.i];
      if (o.accion === 'justificar') { $('#dlg-justificar').hidden = false; $('#dlg-motivo').focus(); return; }
      if (o.accion === 'ajustar_cantidad') {
        const i = h.datos.indice || 0;
        informe.necesidades[i].cantidad = h.datos.tope;
        guardar(); dlg.close(); cargarValores();
        toast(`Cantidad ajustada a ${h.datos.tope}. Pulsa Siguiente para continuar.`);
        return;
      }
      if (o.accion === 'vaciar_ocupantes') {
        const v = informe.viviendas[h.datos.condicion_id];
        if (v) { Object.assign(v, filaVacia(), { hayAlbergue: false, albergue: filaVacia() }); }
        guardar(); dlg.close(); cargarValores();
        toast('Tarjeta en cero. Registra a esas personas en la pantalla siguiente.', 5000);
        siguiente();
        return;
      }
      dlg.close();
      if (o.pantalla && o.pantalla !== pantalla) mostrar(o.pantalla);
    }));
    $('#dlg-guardar-motivo').addEventListener('click', () => {
      const m = $('#dlg-motivo').value.trim();
      if (m.length < 8) { toast('Escribe un motivo un poco más completo.'); return; }
      informe.justificaciones[h.clave] = m;
      guardar(); dlg.close();
      toast('Motivo guardado. Se imprimirá en Observaciones.');
      siguiente();
    });
    dlg.showModal();
  }

  // ---------- revisión ----------
  function tituloRegla(clave) { const r = DATOS.reglas.find(x => x.id === clave.split(':')[0]); return r ? Reglas.plantilla(r.titulo, { numero: '' }).replace(/\s+/g, ' ').trim() : clave; }

  function renderRevision() {
    const t = Reglas.totales(informe);
    const id = informe.identificacion, oc = informe.ocurrencia, ev = informe.evento;
    const justif = Object.entries(informe.justificaciones || {}).filter(([, v]) => v && String(v).trim());
    const hallazgos = Reglas.evaluar(informe, { todas: true });
    const nombres = { afectadas: 'Afectadas', aisladas: 'Aisladas', albergadas: 'Albergadas', damnificadas: 'Damnificadas', damnificadas_laborales: 'Damnificadas laborales', desaparecidas: 'Desaparecidas', evacuadas: 'Evacuadas', extraviadas: 'Extraviadas', fallecidas: 'Fallecidas', lesionadas: 'Lesionadas' };
    const fila = (k) => { const f = t[k]; return `<tr><td>${nombres[k]}</td><td>${f.adH}</td><td>${f.adM}</td><td>${f.nnaH}</td><td>${f.nnaM}</td><td class="total">${f.total}</td></tr>`; };
    const filasPersonas = Reglas.CATEGORIAS.filter(k => t[k].total > 0 || ['afectadas', 'damnificadas', 'albergadas'].includes(k)).map(fila).join('');
    const editar = p => `<button type="button" class="enlace editar" data-accion="ir" data-pantalla="${p}">Editar</button>`;
    const fuentes = Reglas.fuentesTexto(informe);
    const necesidadesHtml = informe.hayNecesidad === true
      ? informe.necesidades.map((nec, i) => {
          const el = Reglas.elemento(nec.elemento);
          return `<p><strong>${i + 1}. ${nec.cantidad} ${esc(el ? el.unidad : '')}</strong> de ${esc(nec.elemento === 'otro' ? nec.otroNombre : (el ? el.nombre : '—'))}<br><span class="ayuda">¿Para qué?: ${esc(nec.paraQue || '—')}</span></p>`;
        }).join('')
      : informe.hayNecesidad === false ? '<p>Sin necesidades que no puedan cubrirse con recursos locales.</p>' : '<p class="vacio">sin indicar</p>';
    const avisoNumero = informe.amplia
      ? `<p class="aviso"><strong>Ampliación de ${esc(informe.amplia.de)}</strong> (del ${esc(fmtFecha(informe.amplia.fecha))} ${esc(informe.amplia.hora || '')}). Número previsto: <strong>${esc(numeroPrevisto())}</strong>. El PDF contiene el estado completo y actualizado del evento: revisa y corrige lo que cambió.</p>`
      : `<p class="aviso">Número previsto: <strong>${esc(numeroPrevisto())}</strong>. Revisa cada sección. Al firmar, la app vuelve a comprobar todas las reglas, asigna el número y genera el PDF en este dispositivo.</p>`;
    $('#revision-contenido').innerHTML = `
      ${avisoNumero}
      ${hallazgos.length ? `<p class="etiqueta roja">Hay ${hallazgos.length} punto(s) por resolver antes de firmar</p>` : '<p class="etiqueta verde">Todas las reglas cuadran</p>'}
      <section class="rev-seccion"><h3>1. Identificación ${editar('donde')}</h3>
        <p>${esc(id.region)} · Provincia de ${esc(id.provincia || '—')} · Comuna de <strong>${esc(id.comuna || '—')}</strong></p>
        <p>Fuente: ${fuentes ? esc(fuentes) : '<span class="vacio">sin indicar</span>'}${id.contacto ? ' · Contacto: ' + esc(id.contacto) : ''}</p></section>
      <section class="rev-seccion"><h3>2. Ocurrencia ${editar('donde')}</h3><p>${esc(fmtFecha(oc.fecha) || '—')} a las ${esc(oc.hora || '—')}</p></section>
      <section class="rev-seccion"><h3>3. Tipo de evento ${editar('evento')}</h3>
        <p>${ev.tipo ? esc(tipoTexto(informe)) : '<span class="vacio">sin indicar</span>'}</p></section>
      <section class="rev-seccion"><h3>4. Afectación a personas ${editar('personas')}</h3>
        <table class="tabla"><thead><tr><th></th><th>Adultos H</th><th>Adultas M</th><th>NNA H</th><th>NNA M</th><th>Total</th></tr></thead>
        <tbody>${filasPersonas}</tbody></table>
        <p class="ayuda">Personas únicas (aprox.): <strong>${t.personas}</strong>. Las albergadas no se suman porque ya están contadas como damnificadas, evacuadas o aisladas.</p></section>
      <section class="rev-seccion"><h3>5. Daño a viviendas ${editar('viviendas')}</h3>
        ${DATOS.condiciones_vivienda.map(c => `<p>${esc(c.nivel_largo)}: <strong>${t.viviendas[c.id]}</strong></p>`).join('')}
        <p>Total de viviendas dañadas: <strong>${t.viviendas_danadas}</strong></p></section>
      <section class="rev-seccion"><h3>6 y 7. Decisiones y recursos</h3><p class="vacio">No se capturan en esta demo del Sprint 1. Quedan en blanco en el PDF.</p></section>
      <section class="rev-seccion"><h3>8. Evaluación de necesidades ${editar('necesidad')}</h3>${necesidadesHtml}</section>
      <section class="rev-seccion"><h3>9. Observaciones</h3>
        ${informe.amplia ? `<p>Ampliación del Informe Alfa ${esc(informe.amplia.de)}.</p>` : ''}
        ${justif.length ? justif.map(([k, v]) => `<p><strong>${esc(tituloRegla(k))}:</strong> ${esc(v)}</p>`).join('') : '<p class="vacio">Sin justificaciones registradas.</p>'}
        <p class="ayuda">Se agrega la leyenda de informe de ejercicio.</p></section>
      <section class="rev-seccion"><h3>10. Responsable del informe</h3>
        <p>${esc(informe.responsable.nombre)} · ${esc(informe.responsable.cargo)} · ${esc(informe.responsable.institucion)}</p>
        <p class="ayuda">Identidad ficticia de ejercicio. La fecha y la hora de elaboración se registran al firmar. Se estampan la firma y el timbre de ejercicio y la marca de agua “${esc(CONFIG.marca_agua)}”.</p></section>`;
  }

  // ---------- firma y PDF ----------
  async function cargarImagenes() {
    if (imagenes) return imagenes;
    const [firma, timbre] = await Promise.all([CONFIG.imagenes.firma, CONFIG.imagenes.timbre].map(u => fetch(u).then(r => { if (!r.ok) throw new Error('No se pudo leer ' + u); return r.arrayBuffer(); })));
    imagenes = { firmaPng: new Uint8Array(firma), timbrePng: new Uint8Array(timbre) };
    return imagenes;
  }
  async function generarPdf(inf) {
    if (!window.PDFLib) throw new Error('la biblioteca de PDF no está cargada');
    const img = await cargarImagenes();
    return AlfaPDF.generar(inf, {
      PDFLib: window.PDFLib, config: CONFIG, datos: DATOS, plantilla: PLANTILLA,
      totales: Reglas.totales(inf), firmaPng: img.firmaPng, timbrePng: img.timbrePng
    });
  }

  async function firmar() {
    const hallazgos = Reglas.evaluar(informe, { todas: true });
    if (hallazgos.length) { mostrarBloqueo(hallazgos[0]); return; }
    const btn = $('#btn-siguiente');
    btn.disabled = true; btn.textContent = 'Generando el PDF…';
    try {
      informe.elaboracion = { fecha: hoyISO(), hora: ahoraHHMM(), iso: new Date().toISOString() };
      if (!informe.numero) informe.numero = asignarNumero();
      ultimoPdf = await generarPdf(informe);
      Almacen.guardarHistorial(informe);
      Almacen.borrarBorrador();
      mostrar('listo');
    } catch (e) {
      console.error(e);
      informe.elaboracion = null;
      toast('No se pudo generar el PDF: ' + e.message, 7000);
      btn.disabled = false; btn.textContent = 'Firmar y generar el PDF';
    }
  }

  function asunto() {
    return `${CONFIG.destinatario.asunto_prefijo} Informe Alfa ${informe.numero} – ${informe.identificacion.comuna || 'sin comuna'} – ${tipoTexto(informe)}`;
  }
  function nombreArchivo() {
    const comuna = (informe.identificacion.comuna || 'comuna').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
    return `Informe_Alfa_${informe.numero}_${comuna}_${informe.elaboracion.fecha}.pdf`;
  }
  function blobPdf() { return new Blob([ultimoPdf], { type: 'application/pdf' }); }

  function renderListo() {
    const d = CONFIG.destinatario;
    const puedeCompartir = !!(navigator.share && navigator.canShare);
    $('#listo-contenido').innerHTML = `
      <p class="exito">Informe de ejercicio <strong>${esc(informe.numero)}</strong> generado en este dispositivo${informe.identificacion.comuna ? ', comuna de ' + esc(informe.identificacion.comuna) : ''}.${informe.amplia ? ' Es una ampliación de ' + esc(informe.amplia.de) + '.' : ''}</p>
      <div class="acciones-fila">
        <button type="button" class="primario" data-accion="compartir">Compartir el PDF por correo</button>
      </div>
      <div class="acciones-fila">
        <button type="button" class="secundario" data-accion="descargar">Descargar el PDF</button>
        <button type="button" class="secundario" data-accion="ver">Ver el PDF</button>
      </div>
      <ol class="pasos-correo">
        ${puedeCompartir
          ? `<li><strong>Compartir el PDF por correo</strong> copia la dirección de destino y abre el menú de compartir con el PDF ya adjunto. Elige tu aplicación de correo.</li>
             <li>En el correo, mantén presionado el campo <strong>Para</strong> y pega la dirección. El asunto y el texto ya van escritos, y la dirección aparece también en la primera línea del texto.</li>`
          : `<li>Este navegador no ofrece el menú de compartir con archivos (es normal en un computador). Usa la alternativa siguiente.</li>`}
        <li>Alternativa sin adjunto: <button type="button" class="enlace" data-accion="correo">abrir el correo con el destinatario ya escrito</button>. El PDF se descarga y debes adjuntarlo tú desde Descargas: <code>${esc(nombreArchivo())}</code>. Sin servidor, ninguna app web puede enviar el correo ni adjuntar el archivo por sí sola.</li>
      </ol>
      <h2>Destinatario</h2>
      <div class="correo-caja"><strong>${esc(d.nombre)}</strong><br><code>${esc(d.correo)}</code><br>
        <button type="button" class="enlace" data-accion="copiar" data-texto="${esc(d.correo)}">Copiar la dirección</button></div>
      <div class="correo-caja">Asunto sugerido:<br><code>${esc(asunto())}</code><br>
        <button type="button" class="enlace" data-accion="copiar" data-texto="${esc(asunto())}">Copiar el asunto</button></div>
      <p class="ayuda">Antes de enviar un ejercicio a la casilla real, avisa al turno de la URAT (riesgo R-14 de la arquitectura).</p>
      <div class="acciones-inicio">
        <button type="button" class="secundario grande" data-accion="otro">Hacer otro informe de ejercicio</button>
        <button type="button" class="enlace" data-accion="inicio">Volver al inicio</button>
      </div>`;
  }

  function enviarCorreo() {
    if (!ultimoPdf) { toast('Primero genera el PDF.'); return; }
    const d = CONFIG.destinatario;
    const t = Reglas.totales(informe);
    const cuerpo = [
      d.saludo || 'Estimado(a):',
      '',
      `Adjunto el Informe Alfa ${informe.numero} de EJERCICIO (sin valor oficial), comuna de ${informe.identificacion.comuna}, evento: ${tipoTexto(informe)}, inicio el ${fmtFecha(informe.ocurrencia.fecha)} a las ${informe.ocurrencia.hora}.`,
      `Totales: ${t.afectadas.total} afectadas, ${t.damnificadas.total} damnificadas, ${t.albergadas.total} albergadas; ${t.viviendas_danadas} viviendas dañadas.`,
      '',
      `Archivo adjunto: ${nombreArchivo()}`,
      '',
      'Generado con la App Informe Alfa (demo Sprint 1).'
    ].join('\n');
    descargar();
    const url = `mailto:${d.correo}?subject=${encodeURIComponent(asunto())}&body=${encodeURIComponent(cuerpo)}`;
    toast('PDF descargado. Se abre tu correo con el destinatario escrito: toca el clip y adjunta el archivo desde Descargas.', 9000);
    setTimeout(() => { window.location.href = url; }, 900);
  }

  async function compartir() {
    if (!ultimoPdf) { toast('Primero genera el PDF.'); return; }
    const d = CONFIG.destinatario;
    const archivo = new File([ultimoPdf], nombreArchivo(), { type: 'application/pdf' });
    const texto = `Para: ${d.correo}
${asunto()}. Documento de ejercicio, sin valor oficial.`;
    const datos = { files: [archivo], title: asunto(), text: texto };
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      let copiado = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(d.correo); copiado = true; }
      } catch (e) { /* sin acceso al portapapeles: la dirección va igual en el texto */ }
      toast(copiado ? 'Dirección copiada: pégala en el campo Para del correo.' : 'Pega en el campo Para la dirección que va en la primera línea del texto.', 8000);
      try { await navigator.share(datos); }
      catch (e) { if (e.name !== 'AbortError') toast('No se pudo compartir: ' + e.message, 6000); }
    } else {
      toast('Este navegador no permite compartir archivos. Usa la alternativa “abrir el correo” y adjunta el PDF desde Descargas.', 7000);
    }
  }
  function descargar() {
    if (!ultimoPdf) return;
    const url = URL.createObjectURL(blobPdf());
    const a = document.createElement('a');
    a.href = url; a.download = nombreArchivo();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function ver() {
    if (!ultimoPdf) return;
    const url = URL.createObjectURL(blobPdf());
    const w = window.open(url, '_blank');
    if (!w) toast('El navegador bloqueó la ventana. Usa “Descargar”.');
  }
  async function copiar(texto) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(texto);
      else {
        const ta = document.createElement('textarea'); ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      toast('Copiado. Pégalo en el correo.');
    } catch (e) { toast('No se pudo copiar. Selecciona el texto y cópialo a mano.'); }
  }

  function ampliar(i) {
    const h = Almacen.leerHistorial()[i];
    if (!h) return;
    if (Almacen.leerBorrador() && !confirm('Hay un borrador guardado que se reemplazará. ¿Continuar con la ampliación?')) return;
    const copia = normalizar(JSON.parse(JSON.stringify(h)));
    copia.amplia = { de: h.numero, base: h.amplia && h.amplia.base ? h.amplia.base : h.numero, fecha: h.elaboracion && h.elaboracion.fecha, hora: h.elaboracion && h.elaboracion.hora };
    copia.numero = null;
    copia.elaboracion = null;
    copia.creado = new Date().toISOString();
    informe = copia;
    guardar();
    toast(`Ampliación de ${h.numero}: actualiza solo lo que cambió.`, 5000);
    mostrar('donde');
  }

  async function accionDinamica(accion, ds) {
    switch (accion) {
      case 'ir': mostrar(ds.pantalla); break;
      case 'correo': enviarCorreo(); break;
      case 'compartir': await compartir(); break;
      case 'descargar': descargar(); break;
      case 'ver': ver(); break;
      case 'copiar': await copiar(ds.texto); break;
      case 'otro':
        informe = nuevoInforme(); guardar(); mostrar('donde'); break;
      case 'inicio': mostrar('inicio'); break;
      case 'ampliar': ampliar(+ds.i); break;
      case 'agregar-necesidad':
        informe.necesidades.push(necesidadVacia()); guardar(); renderNecesidades(); cargarValores();
        { const ultimo = $$('#lista-necesidades select').pop(); if (ultimo) ultimo.focus(); }
        break;
      case 'quitar-necesidad':
        informe.necesidades.splice(+ds.i, 1);
        if (!informe.necesidades.length) informe.necesidades.push(necesidadVacia());
        guardar(); renderNecesidades(); cargarValores();
        break;
      case 'usar-sugerido': {
        const i = +ds.i; const s = Reglas.sugerencia(informe.necesidades[i].elemento, informe);
        if (s) { informe.necesidades[i].cantidad = s.tope; guardar(); cargarValores(); }
        break;
      }
      case 'reabrir': {
        const h = Almacen.leerHistorial()[+ds.i];
        if (!h) return;
        informe = normalizar(h);
        toast('Generando el PDF otra vez…');
        try { ultimoPdf = await generarPdf(informe); mostrar('listo'); }
        catch (e) { toast('No se pudo generar el PDF: ' + e.message, 6000); }
        break;
      }
      default: break;
    }
  }

  // ---------- inicio, instalación y conexión ----------
  function renderInicio() {
    const borrador = Almacen.leerBorrador();
    $('#btn-continuar').hidden = !borrador;
    $('#btn-descartar').hidden = !borrador;
    if (borrador) {
      const etiqueta = borrador.amplia ? `ampliación de ${borrador.amplia.de}` : (borrador.identificacion && borrador.identificacion.comuna ? borrador.identificacion.comuna : '');
      $('#btn-continuar').textContent = 'Continuar el borrador guardado' + (etiqueta ? ` (${etiqueta})` : '');
    }

    const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    $('#instalacion').hidden = false;
    $('#btn-instalar').hidden = !eventoInstalacion;
    $('#ayuda-ios').hidden = !(esIOS && !instalada);
    $('#ayuda-android').hidden = !(!esIOS && !instalada && !eventoInstalacion);
    $('#ya-instalada').hidden = !instalada;

    const hist = Almacen.leerHistorial();
    $('#historial').hidden = hist.length === 0;
    $('#lista-historial').innerHTML = hist.map((h, i) =>
      `<li><span><strong>${esc(h.numero)}</strong> · ${esc(h.identificacion.comuna || '')} · ${esc(fmtFecha(h.elaboracion && h.elaboracion.fecha))} ${esc(h.elaboracion && h.elaboracion.hora || '')}</span>
       <span class="acciones-historial">
         <button type="button" class="secundario" data-accion="ampliar" data-i="${i}">Ampliar</button>
         <button type="button" class="secundario" data-accion="reabrir" data-i="${i}">Compartir</button>
       </span></li>`).join('');
  }

  async function instalar() {
    if (!eventoInstalacion) return;
    eventoInstalacion.prompt();
    try { await eventoInstalacion.userChoice; } catch (e) { /* el usuario cerró el aviso */ }
    eventoInstalacion = null;
    renderInicio();
  }

  function estadoConexion() {
    const el = $('#estado-red');
    const con = navigator.onLine;
    el.textContent = con ? 'Con conexión' : 'Sin conexión · la app funciona igual';
    el.classList.toggle('sin', !con);
  }

  function registrarSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('./sw.js').then(reg => {
      const avisar = () => toast('Hay una versión nueva de la app. Ciérrala y vuelve a abrirla para usarla.', 8000);
      if (reg.waiting && navigator.serviceWorker.controller) avisar();
      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        if (!nuevo) return;
        nuevo.addEventListener('statechange', () => {
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) avisar();
        });
      });
    }).catch(e => console.warn('Service worker no registrado:', e));
  }

  iniciar();
})();
