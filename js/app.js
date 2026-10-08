/* App Informe Alfa – demo (versión 0.5).
   Flujo de pantallas y enlace entre el motor de reglas (reglas.js), las credenciales (credencial.js),
   el archivo de datos y el código QR (datos_alfa.js), el generador de PDF (pdf.js) y el almacén local
   (almacen.js). Sin servidor: todo ocurre en el teléfono. */
(function () {
  'use strict';

  const ORDEN = ['inicio', 'elaborador', 'donde', 'evento', 'viviendas', 'personas', 'decisiones', 'recursos', 'necesidad', 'revision', 'listo'];
  const TITULOS = {
    inicio: 'Modo ejercicio',
    elaborador: '¿Quién elabora el informe?',
    donde: '¿Dónde y cuándo ocurrió?',
    evento: '¿Qué pasó?',
    viviendas: 'Viviendas y sus ocupantes',
    personas: 'Otras personas afectadas',
    decisiones: 'Decisiones y acciones',
    recursos: 'Recursos involucrados',
    necesidad: 'Necesidades',
    revision: 'Revisa y firma',
    listo: 'Informe generado'
  };
  const PASOS_TOTAL = 9;
  const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  let CONFIG = null, DATOS = null, PLANTILLA = null;
  let informe = null;
  let pantalla = 'inicio';
  let ultimoPdf = null;
  let ultimoDatos = null;     // objeto del archivo de datos (.alfa.json) del último PDF generado
  let eventoInstalacion = null;
  let recursosPdf = null;     // fuentes, logo e imágenes ficticias, en memoria
  let credResumen = null;     // resumen de la credencial cargada (sin imágenes ni PIN)

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
  function elaboradorDe(inf) { return CONFIG.elaboradores.find(e => e.id === (inf.elaborador || {}).nivel) || null; }
  function provincias() { return [...new Set(CONFIG.comunas.map(c => c.provincia))]; }

  // ---------- estado ----------
  function filaVacia() { return { adH: 0, adM: 0, nnaH: 0, nnaM: 0 }; }
  function necesidadVacia() { return { elemento: '', otroNombre: '', cantidad: 0, paraQue: '' }; }
  function recursoVacio() { return { hay: false, personas: 0, medios: '' }; }

  function nuevoInforme() {
    const viviendas = {};
    DATOS.condiciones_vivienda.forEach(c => { viviendas[c.id] = Object.assign(filaVacia(), { viviendas: 0, hayAlbergue: false, albergue: filaVacia() }); });
    const otras = {};
    DATOS.categorias_personas.forEach(c => { otras[c.id] = Object.assign(filaVacia(), { hay: false }); if (c.requiere_denuncia) otras[c.id].denuncia = false; });
    const organismos = {};
    (DATOS.organismos_respuesta || []).forEach(o => { organismos[o.id] = recursoVacio(); });
    const cr = credResumen;
    return {
      version: CONFIG.version_app,
      modo: 'ejercicio',
      numero: null,
      anio: null,
      amplia: null,
      creado: new Date().toISOString(),
      elaborador: cr ? { nivel: cr.nivel, provincia: cr.provincia || '' } : { nivel: '', provincia: '' },
      identificacion: { region: CONFIG.region.nombre, provincia: '', comunas: cr && cr.nivel === 'comunal' ? cr.comunas.slice(0, 1) : [], fuentes: [], fuenteOtra: '', contacto: '' },
      lugar: { descripcion: '', lat: '', lon: '', precision: null, origen: '' },
      ocurrencia: { fecha: hoyISO(), hora: ahoraHHMM() },
      evento: { tipo: '', otro: '' },
      viviendas,
      otras,
      decisiones: { realizadas: '', pendientes: '' },
      recursos: { sinRecursos: false, organismos, otro: Object.assign(recursoVacio(), { nombre: '' }) },
      hayNecesidad: null,
      necesidades: [necesidadVacia()],
      justificaciones: {},
      responsable: cr ? { nombre: cr.nombre, cargo: cr.cargo, institucion: cr.institucion, credencial: cr.id } : { nombre: CONFIG.responsable_ejercicio.nombre, cargo: '', institucion: '' },
      firmante: null,
      sello: null,
      elaboracion: null
    };
  }

  // Completa informes guardados con versiones anteriores de la app.
  function normalizar(inf) {
    const base = nuevoInforme();
    inf.elaborador = Object.assign({}, base.elaborador, inf.elaborador || {});
    inf.identificacion = Object.assign({}, base.identificacion, inf.identificacion || {});
    if (!Array.isArray(inf.identificacion.comunas)) inf.identificacion.comunas = [];
    if (inf.identificacion.comuna) {
      if (!inf.identificacion.comunas.length) inf.identificacion.comunas = [inf.identificacion.comuna];
      delete inf.identificacion.comuna;
    }
    if (!inf.elaborador.nivel && inf.identificacion.comunas.length) inf.elaborador.nivel = 'comunal';
    if (!Array.isArray(inf.identificacion.fuentes)) inf.identificacion.fuentes = [];
    if (inf.identificacion.fuente) {
      if (!inf.identificacion.fuentes.length && !inf.identificacion.fuenteOtra) inf.identificacion.fuenteOtra = inf.identificacion.fuente;
      delete inf.identificacion.fuente;
    }
    inf.lugar = Object.assign({}, base.lugar, inf.lugar || {});
    inf.ocurrencia = Object.assign({}, base.ocurrencia, inf.ocurrencia || {});
    inf.evento = Object.assign({}, base.evento, inf.evento || {});
    inf.viviendas = inf.viviendas || {};
    for (const k of Object.keys(base.viviendas)) {
      inf.viviendas[k] = Object.assign({}, base.viviendas[k], inf.viviendas[k] || {});
      inf.viviendas[k].albergue = Object.assign(filaVacia(), inf.viviendas[k].albergue || {});
    }
    inf.otras = inf.otras || {};
    for (const k of Object.keys(base.otras)) inf.otras[k] = Object.assign({}, base.otras[k], inf.otras[k] || {});
    inf.decisiones = Object.assign({}, base.decisiones, inf.decisiones || {});
    inf.recursos = Object.assign({}, base.recursos, inf.recursos || {});
    inf.recursos.organismos = inf.recursos.organismos || {};
    for (const k of Object.keys(base.recursos.organismos)) inf.recursos.organismos[k] = Object.assign(recursoVacio(), inf.recursos.organismos[k] || {});
    inf.recursos.otro = Object.assign(recursoVacio(), { nombre: '' }, inf.recursos.otro || {});
    if (!Array.isArray(inf.necesidades) || !inf.necesidades.length) inf.necesidades = [necesidadVacia()];
    if (inf.hayNecesidad === undefined) inf.hayNecesidad = null;
    inf.justificaciones = inf.justificaciones || {};
    if (inf.amplia === undefined) inf.amplia = null;
    if (inf.firmante === undefined) inf.firmante = null;
    if (inf.sello === undefined) inf.sello = null;
    if (inf.anio === undefined) inf.anio = null;
    inf.responsable = Object.assign({ nombre: CONFIG.responsable_ejercicio.nombre, cargo: '', institucion: '' }, inf.responsable || {});
    actualizarProvincia(inf);
    actualizarResponsable(inf);
    return inf;
  }

  function actualizarProvincia(inf) {
    const provs = [...new Set((inf.identificacion.comunas || []).map(c => (CONFIG.comunas.find(x => x.comuna === c) || {}).provincia).filter(Boolean))];
    inf.identificacion.provincia = provs.length === 1 ? provs[0] : (provs.length > 1 ? 'Varias' : '');
  }
  function actualizarResponsable(inf) {
    if (inf.responsable && inf.responsable.credencial) return; // la identidad viene de la credencial
    const e = elaboradorDe(inf);
    if (!e) return;
    const comunas = inf.identificacion.comunas || [];
    inf.responsable.cargo = e.cargo;
    inf.responsable.institucion = e.institucion
      .replace('{comuna}', comunas.length === 1 ? comunas[0] : (comunas.length ? 'varias comunas' : 'la comuna'))
      .replace('{provincia}', inf.elaborador.provincia || inf.identificacion.provincia || 'la provincia');
  }

  function guardar() { if (informe && !informe.elaboracion) Almacen.guardarBorrador(informe); }

  // ---------- numeración ----------
  function siguienteLetra(base, anio) {
    const usadas = Almacen.leerHistorial().filter(h => h.numero && h.numero.startsWith(base + '-') && (!anio || anioDe(h) === anio)).map(h => h.numero.slice(base.length + 1));
    let i = 0;
    while (i < LETRAS.length - 1 && usadas.includes(LETRAS[i])) i++;
    return LETRAS[i];
  }
  // Propuesta de número: el siguiente del contador de este teléfono o, en una ampliación, el número base con la
  // siguiente letra libre. El funcionario puede corregirlo antes de firmar (D-52), porque otros Alfas del mismo
  // evento o de la misma comuna pueden haberse emitido desde la planilla o desde otro teléfono.
  const PREFIJO = () => CONFIG.numero.prefijo;
  const digitosDe = numero => { const m = /-(\d+)(?:-[A-Z])?$/.exec(String(numero || '')); return m ? parseInt(m[1], 10) : null; };
  // El correlativo se reinicia cada año y no lleva el año (D-53): cada informe guarda el año de su correlativo.
  // Un informe nuevo toma el año de hoy; una ampliación hereda el del informe base aunque su fecha sea del año siguiente.
  const anioActual = () => new Date().getFullYear();
  const anioDe = inf => (inf && inf.anio) || (inf && inf.elaboracion && inf.elaboracion.fecha ? parseInt(String(inf.elaboracion.fecha).slice(0, 4), 10) : null);
  function anioElegido() {
    if (informe.amplia && informe.amplia.externa) { const a = parseInt(informe.numeroManual && informe.numeroManual.anio, 10); return Number.isInteger(a) ? a : anioActual(); }
    if (informe.amplia && informe.anio) return informe.anio;
    return anioActual();
  }
  function propuestaNumero() {
    const anio = anioElegido();
    if (informe.amplia && informe.amplia.base) {
      return { n: digitosDe(informe.amplia.base), letra: siguienteLetra(informe.amplia.base, anio), baseFija: !informe.amplia.externa, anio };
    }
    const n = digitosDe(Almacen.numeroPrevisto(PREFIJO(), anio));
    return { n, letra: informe.amplia ? siguienteLetra(`${PREFIJO()}-${n}`, anio) : null, baseFija: false, anio };
  }
  function numeroPropuestoTexto(p) { return `${PREFIJO()}-${p.n}${informe.amplia ? '-' + (p.letra || 'A') : ''}`; }
  function numeroElegido() {
    const m = informe.numeroManual || {};
    const n = parseInt(m.n, 10);
    const letra = informe.amplia ? String(m.letra || '').toUpperCase() : '';
    const numero = Number.isInteger(n) && n > 0 ? `${PREFIJO()}-${n}${informe.amplia ? '-' + letra : ''}` : null;
    return { n, letra, numero };
  }
  // Comprueba el número elegido antes de firmar; devuelve el número definitivo o null si no se puede seguir
  function validarNumero() {
    const e = numeroElegido();
    if (!e.numero) { toast('Escribe el número del informe: un entero mayor que cero.', 5000); return null; }
    if (informe.amplia && !/^[A-Z]$/.test(e.letra)) { toast('Elige la letra de la ampliación.', 5000); return null; }
    const anio = anioElegido();
    if (informe.amplia && informe.amplia.externa && !(anio >= 2000 && anio <= 2100)) { toast('Escribe el año del informe que amplías, con cuatro cifras.', 5000); return null; }
    if (Almacen.leerHistorial().some(h => h.numero === e.numero && anioDe(h) === anio)) { toast(`Ya existe el informe ${e.numero} del año ${anio} en este teléfono. Usa otro número o letra.`, 7000); return null; }
    const propuesto = numeroPropuestoTexto(propuestaNumero());
    if (e.numero !== propuesto && !(informe.amplia && informe.amplia.externa)) {
      if (!confirm(`El número propuesto era ${propuesto} y vas a usar ${e.numero}.\n\nHazlo solo si ese número corresponde a la numeración real de tu institución, por ejemplo porque otros Alfas se emitieron desde la planilla o desde otro teléfono.\n\n¿Continuar con ${e.numero}?`)) return null;
    }
    return e.numero;
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
    const reg = Almacen.leerCredencial();
    credResumen = reg && reg.resumen ? reg.resumen : null;
    $('#version-app').textContent = CONFIG.version_app;
    construirListas();
    enlazarEventos();
    registrarSW();
    estadoConexion();
    if (!Almacen.disponible()) toast('Este navegador no permite guardar borradores en el teléfono.', 6000);
    mostrar('inicio');
    iniciarPortada();
  }

  // Portada al abrir la app: se cierra con el botón, tocando la pantalla o sola a los 5 segundos.
  // No vuelve a aparecer mientras la app siga abierta (una vez por apertura).
  function iniciarPortada() {
    const portada = $('#portada');
    if (!portada) return;
    let vista = false;
    try { vista = sessionStorage.getItem('alfaDemo.portadaVista') === '1'; } catch (e) { /* sin almacenamiento de sesión */ }
    if (vista) { portada.remove(); return; }
    $('#portada-version').textContent = CONFIG.version_app;
    let cerrada = false;
    const cerrar = () => {
      if (cerrada) return;
      cerrada = true;
      try { sessionStorage.setItem('alfaDemo.portadaVista', '1'); } catch (e) { /* sin efecto */ }
      portada.classList.add('oculta');
      setTimeout(() => portada.remove(), 400);
    };
    portada.addEventListener('click', cerrar);
    $('#portada-entrar').addEventListener('click', e => { e.stopPropagation(); cerrar(); });
    setTimeout(cerrar, 5000);
  }

  function construirListas() {
    $('#lista-niveles').innerHTML = CONFIG.elaboradores.map(e =>
      `<label class="opcion"><input type="radio" name="nivel" value="${esc(e.id)}"><span><strong>${esc(e.nombre)}</strong><small>${esc(e.nivel)} · ${esc(e.descripcion)}</small></span></label>`).join('');
    $('#in-provincia-deleg').innerHTML = '<option value="">Elige la provincia…</option>' + provincias().map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');

    const sel = $('#in-comuna');
    sel.innerHTML = '<option value="">Elige la comuna…</option>' + provincias().map(p =>
      `<optgroup label="Provincia de ${esc(p)}">` + CONFIG.comunas.filter(c => c.provincia === p).map(c => `<option value="${esc(c.comuna)}">${esc(c.comuna)}</option>`).join('') + '</optgroup>').join('');
    $('#in-region').textContent = CONFIG.region.nombre;

    $('#lista-fuentes').innerHTML = CONFIG.fuentes_frecuentes.map(f =>
      `<label class="opcion"><input type="checkbox" name="fuente" value="${esc(f)}"><span><strong>${esc(f)}</strong></span></label>`).join('');

    $('#lista-eventos').innerHTML = DATOS.tipos_evento.map(t =>
      `<label class="opcion"><input type="radio" name="tipo-evento" value="${esc(t.id)}"><span><strong>${esc(cap(t.id))}</strong><small>${esc(t.ejemplo)}</small></span></label>`).join('');

    $('#tarjetas-viviendas').innerHTML = DATOS.condiciones_vivienda.map(tarjetaVivienda).join('');
    $('#tarjetas-personas').innerHTML = DATOS.categorias_personas.map(tarjetaCategoria).join('');
    $('#tarjetas-recursos').innerHTML = (DATOS.organismos_respuesta || []).map(o => tarjetaRecurso(o.id, o.nombre, false)).join('') + tarjetaRecurso('otro', 'Otro organismo', true);
  }

  function renderListaComunas() {
    const E = informe.elaborador;
    let lista = E.nivel === 'provincial' ? CONFIG.comunas.filter(c => c.provincia === E.provincia) : CONFIG.comunas;
    if (credResumen && credResumen.comunas && credResumen.comunas.length) lista = lista.filter(c => credResumen.comunas.includes(c.comuna));
    const grupos = [...new Set(lista.map(c => c.provincia))];
    $('#lista-comunas').innerHTML = grupos.map(p => lista.filter(c => c.provincia === p).map(c =>
      `<label class="opcion"><input type="checkbox" name="comuna-multi" value="${esc(c.comuna)}"><span><strong>${esc(c.comuna)}</strong><small>Provincia de ${esc(c.provincia)}</small></span></label>`).join('')).join('');
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

  function tarjetaRecurso(id, nombre, esOtro) {
    const r = esOtro ? 'recursos.otro' : `recursos.organismos.${id}`;
    return `
      <section class="tarjeta recurso" data-recurso="${esc(id)}">
        <label class="conmutador"><input type="checkbox" data-ruta="${r}.hay"><span><strong>${esc(nombre)}</strong></span></label>
        <div class="bloque-recurso" data-bloque-rec="${esc(id)}" hidden>
          ${esOtro ? `<label class="campo">¿Qué organismo?<input type="text" data-ruta="${r}.nombre" placeholder="Nombre del organismo o empresa"></label>` : ''}
          <div class="fila2">
            <label class="campo">Personas<input type="number" min="0" step="1" inputmode="numeric" placeholder="0" data-ruta="${r}.personas"></label>
            <label class="campo">Medios<input type="text" data-ruta="${r}.medios" placeholder="Vehículos, maquinaria, equipos, ayuda entregada"></label>
          </div>
        </div>
      </section>`;
  }

  function renderNecesidades() {
    const opciones = '<option value="">Elige el elemento…</option>' + DATOS.catalogo_elementos.map(e => `<option value="${esc(e.id)}">${esc(e.nombre)}</option>`).join('');
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
      informe = nuevoInforme(); guardar(); mostrar('elaborador');
    });
    $('#btn-continuar').addEventListener('click', () => {
      const b = Almacen.leerBorrador();
      if (!b) { toast('No hay un borrador guardado.'); return; }
      informe = normalizar(b);
      mostrar('elaborador');
    });
    $('#btn-descartar').addEventListener('click', () => {
      if (confirm('¿Descartar el borrador guardado?')) { Almacen.borrarBorrador(); informe = null; mostrar('inicio'); }
    });
    $('#dlg-cerrar').addEventListener('click', () => $('#dlg-bloqueo').close());
    $('#btn-instalar').addEventListener('click', instalar);
    $('#btn-gps').addEventListener('click', usarGPS);
    $('#in-credencial').addEventListener('change', e => { const f = e.target.files[0]; if (f) cargarCredencialArchivo(f); e.target.value = ''; });
    $('#in-importar').addEventListener('change', e => { const f = e.target.files[0]; if (f) importarArchivo(f); e.target.value = ''; });
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
    if (el.name === 'nivel') {
      if (el.checked) {
        informe.elaborador.nivel = el.value;
        $('#campo-provincia-deleg').hidden = el.value !== 'provincial';
        if (el.value === 'comunal' && informe.identificacion.comunas.length > 1) informe.identificacion.comunas = informe.identificacion.comunas.slice(0, 1);
        actualizarProvincia(informe); actualizarResponsable(informe); guardar();
      }
      return;
    }
    if (el.name === 'tipo-evento') {
      if (el.checked) { informe.evento.tipo = el.value; $('#campo-otro').hidden = el.value !== 'OTRO'; actualizarSeleccionEvento(); guardar(); }
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
    if (el.name === 'fuente') { informe.identificacion.fuentes = $$('input[name="fuente"]:checked').map(x => x.value); guardar(); return; }
    if (el.name === 'comuna-unica') {
      informe.identificacion.comunas = el.value ? [el.value] : [];
      actualizarProvincia(informe); actualizarResponsable(informe); guardar();
      $('#in-provincia').textContent = informe.identificacion.provincia || '—';
      return;
    }
    if (el.name === 'comuna-multi') {
      informe.identificacion.comunas = $$('input[name="comuna-multi"]:checked').map(x => x.value);
      actualizarProvincia(informe); actualizarResponsable(informe); guardar();
      $('#in-provincia').textContent = informe.identificacion.provincia || '—';
      return;
    }
    if (el.id === 'in-amplia-externa') {
      if (el.checked) {
        informe.amplia = { de: '', base: '', fecha: null, hora: null, anterior: null, externa: true, anio: anioActual() };
        informe.numeroManual = { n: informe.numeroManual ? informe.numeroManual.n : null, letra: 'A', anio: anioActual() };
        informe.anio = anioActual();
      } else {
        informe.amplia = null; informe.anio = null;
        if (informe.numeroManual) { informe.numeroManual.letra = null; delete informe.numeroManual.anio; }
      }
      guardar(); renderRevision(); cargarValores();
      return;
    }
    const ruta = el.dataset ? el.dataset.ruta : null;
    if (!ruta) return;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number') v = el.value === '' ? 0 : Math.max(0, parseInt(el.value, 10) || 0);
    else v = el.value;
    asignar(informe, ruta, v);

    if (ruta === 'elaborador.provincia') { informe.identificacion.comunas = []; actualizarProvincia(informe); actualizarResponsable(informe); }
    if (ruta === 'numeroManual.n' && informe.amplia && informe.amplia.externa) {   // el número base de una ampliación externa sigue a lo escrito
      const n = parseInt(v, 10);
      informe.amplia.base = Number.isInteger(n) && n > 0 ? `${PREFIJO()}-${n}` : '';
      informe.amplia.de = informe.amplia.base;
    }
    if (ruta === 'numeroManual.anio' && informe.amplia && informe.amplia.externa) {  // y el año del correlativo también
      const a = parseInt(v, 10);
      informe.amplia.anio = Number.isInteger(a) ? a : null; informe.anio = informe.amplia.anio;
    }
    if ((ruta === 'numeroManual.n' || ruta === 'numeroManual.anio') && pantalla === 'revision') refrescarObservaciones();
    if (ruta === 'evento.otro') actualizarSeleccionEvento();
    if (ruta === 'lugar.lat' || ruta === 'lugar.lon') { informe.lugar.origen = 'manual'; informe.lugar.precision = null; $('#gps-estado').textContent = 'Coordenadas escritas a mano.'; }
    if (ruta.endsWith('.hayAlbergue')) { const bloque = $(`[data-albergue="${ruta.split('.')[1]}"]`); if (bloque) bloque.hidden = !v; }
    const mHay = ruta.match(/^otras\.(\w+)\.hay$/);
    if (mHay) { const bloque = $(`[data-bloque="${mHay[1]}"]`); if (bloque) bloque.hidden = !v; }
    const mRec = ruta.match(/^recursos\.(?:organismos\.(\w+)|(otro))\.hay$/);
    if (mRec) { const bloque = $(`[data-bloque-rec="${mRec[1] || mRec[2]}"]`); if (bloque) bloque.hidden = !v; }
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
    if (pantalla === 'elaborador') {
      const fijo = !!(credResumen && informe.responsable && informe.responsable.credencial);
      $$('input[name="nivel"]').forEach(r => { r.checked = r.value === informe.elaborador.nivel; r.disabled = fijo; });
      $('#campo-provincia-deleg').hidden = informe.elaborador.nivel !== 'provincial';
      $('#in-provincia-deleg').disabled = fijo;
      const nota = $('#nota-credencial-nivel');
      nota.hidden = !fijo;
      if (fijo) nota.innerHTML = `Según tu credencial: <strong>${esc(credResumen.institucion)}</strong>, ${esc(credResumen.cargo)}. El nivel lo fija la credencial; para informar por otra institución, carga otra credencial o quítala en el inicio.`;
    }
    if (pantalla === 'donde') {
      const comunal = informe.elaborador.nivel === 'comunal' || !informe.elaborador.nivel;
      const fijo = !!(credResumen && informe.responsable && informe.responsable.credencial);
      $('#bloque-comuna-unica').hidden = !comunal;
      $('#bloque-comunas-varias').hidden = comunal;
      if (comunal) { $('#in-comuna').value = informe.identificacion.comunas[0] || ''; $('#in-comuna').disabled = fijo && credResumen.comunas.length === 1; }
      else { renderListaComunas(); $$('input[name="comuna-multi"]').forEach(x => { x.checked = informe.identificacion.comunas.includes(x.value); }); }
      $('#in-provincia').textContent = informe.identificacion.provincia || '—';
      $$('input[name="fuente"]').forEach(x => { x.checked = (informe.identificacion.fuentes || []).includes(x.value); });
      const l = informe.lugar;
      $('#gps-estado').textContent = l.origen === 'gps' ? `Posición tomada del teléfono${l.precision ? ` con precisión de ±${l.precision} m` : ''}.`
        : (l.lat || l.lon) ? 'Coordenadas escritas a mano.' : 'El GPS funciona sin señal, pero al aire libre y puede tardar unos segundos. El teléfono te pedirá permiso la primera vez.';
    }
    if (pantalla === 'evento') {
      $$('input[name="tipo-evento"]').forEach(r => { r.checked = r.value === informe.evento.tipo; });
      $('#campo-otro').hidden = informe.evento.tipo !== 'OTRO';
      actualizarSeleccionEvento();
    }
    if (pantalla === 'viviendas') {
      DATOS.condiciones_vivienda.forEach(c => { const b = $(`[data-albergue="${c.id}"]`); if (b) b.hidden = !informe.viviendas[c.id].hayAlbergue; });
      actualizarResumenVivo();
    }
    if (pantalla === 'personas') {
      DATOS.categorias_personas.forEach(c => { const b = $(`[data-bloque="${c.id}"]`); if (b) b.hidden = !informe.otras[c.id].hay; });
      actualizarResumenPersonas();
    }
    if (pantalla === 'recursos') {
      (DATOS.organismos_respuesta || []).forEach(o => { const b = $(`[data-bloque-rec="${o.id}"]`); if (b) b.hidden = !informe.recursos.organismos[o.id].hay; });
      const bo = $('[data-bloque-rec="otro"]'); if (bo) bo.hidden = !informe.recursos.otro.hay;
    }
    if (pantalla === 'necesidad') {
      $$('input[name="hay-necesidad"]').forEach(r => { r.checked = (informe.hayNecesidad === true && r.value === 'si') || (informe.hayNecesidad === false && r.value === 'no'); });
      $('#bloque-necesidad').hidden = informe.hayNecesidad !== true;
      informe.necesidades.forEach((nec, i) => { const otro = $(`[data-otro="${i}"]`); if (otro) otro.hidden = nec.elemento !== 'otro'; actualizarSugerencia(i); });
    }
  }

  function actualizarSeleccionEvento() {
    const t = informe && informe.evento.tipo;
    $('#evento-seleccionado').innerHTML = 'Seleccionado: <strong>' + (t ? esc(t === 'OTRO' ? 'Otro' + (informe.evento.otro ? ': ' + informe.evento.otro : '') : cap(t)) : 'ninguno todavía') + '</strong>';
  }

  function usarGPS() {
    if (!navigator.geolocation) { toast('Este dispositivo no entrega ubicación.'); return; }
    const est = $('#gps-estado');
    est.textContent = 'Buscando la posición del teléfono… puede tardar unos segundos.';
    navigator.geolocation.getCurrentPosition(pos => {
      informe.lugar.lat = pos.coords.latitude.toFixed(5);
      informe.lugar.lon = pos.coords.longitude.toFixed(5);
      informe.lugar.precision = Math.round(pos.coords.accuracy);
      informe.lugar.origen = 'gps';
      guardar(); cargarValores();
      toast('Posición tomada del teléfono.');
    }, err => {
      const motivo = err.code === 1 ? 'permiso denegado' : err.code === 2 ? 'sin señal de GPS' : 'tiempo agotado';
      est.textContent = `No se pudo obtener la posición (${motivo}). Puedes escribir las coordenadas a mano o dejarlas vacías.`;
    }, { enableHighAccuracy: true, timeout: 25000, maximumAge: 60000 });
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

  const NOMBRES = { afectadas: 'Afectadas', aisladas: 'Aisladas', albergadas: 'Albergadas', damnificadas: 'Damnificadas', damnificadas_laborales: 'Damnificadas laborales', desaparecidas: 'Desaparecidas', evacuadas: 'Evacuadas', extraviadas: 'Extraviadas', fallecidas: 'Fallecidas', lesionadas: 'Lesionadas' };

  function actualizarResumenPersonas() {
    if (!informe) return;
    const t = Reglas.totales(informe);
    const filas = Reglas.CATEGORIAS.filter(k => t[k].total > 0).map(k => `<tr><td>${NOMBRES[k]}</td><td>${t[k].total}</td></tr>`).join('');
    $('#resumen-personas').innerHTML = `
      <table>${filas || '<tr><td>Sin personas registradas todavía</td><td></td></tr>'}</table>
      <div class="fila"><span>Personas únicas (aprox.)</span><strong>${t.personas}</strong></div>
      <p class="nota">Incluye a las personas de las viviendas dañadas. Las albergadas no se suman porque ya están contadas como damnificadas, evacuadas o aisladas.</p>`;
    DATOS.categorias_personas.forEach(c => { const el = $(`[data-total-cat="${c.id}"]`); if (el) el.textContent = `${ocupantesOtras(c.id)} persona(s) en esta categoría`; });
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
        informe.necesidades[h.datos.indice || 0].cantidad = h.datos.tope;
        guardar(); dlg.close(); cargarValores();
        toast(`Cantidad ajustada a ${h.datos.tope}. Pulsa Siguiente para continuar.`);
        return;
      }
      if (o.accion === 'vaciar_ocupantes') {
        const v = informe.viviendas[h.datos.condicion_id];
        if (v) Object.assign(v, filaVacia(), { hayAlbergue: false, albergue: filaVacia() });
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

  // ---------- credencial y PIN ----------
  function pedirPin(op) {
    return new Promise(resolve => {
      const dlg = $('#dlg-pin');
      const aceptar = $('#dlg-pin-aceptar'), cancelar = $('#dlg-pin-cancelar'), cerrar = $('#dlg-pin-cerrar');
      const errorEl = $('#dlg-pin-error');
      const min = (CONFIG.credenciales && CONFIG.credenciales.pin_minimo) || 4;
      $('#dlg-pin-titulo').textContent = op.titulo || 'PIN';
      $('#dlg-pin-texto').textContent = op.texto || '';
      $('#dlg-pin-2-campo').hidden = !op.definir;
      $('#dlg-pin-1').value = ''; $('#dlg-pin-2').value = ''; errorEl.hidden = true;
      const terminar = v => { aceptar.onclick = cancelar.onclick = cerrar.onclick = null; dlg.oncancel = null; if (dlg.open) dlg.close(); resolve(v); };
      const error = m => { errorEl.textContent = m; errorEl.hidden = false; };
      aceptar.onclick = () => {
        const p1 = $('#dlg-pin-1').value.trim();
        if (!/^\d+$/.test(p1) || p1.length < min) { error(`El PIN debe tener al menos ${min} dígitos, solo números.`); return; }
        if (op.definir && p1 !== $('#dlg-pin-2').value.trim()) { error('Los dos PIN no coinciden.'); return; }
        terminar(p1);
      };
      cancelar.onclick = () => terminar(null);
      cerrar.onclick = () => terminar(null);
      dlg.oncancel = e => { e.preventDefault(); terminar(null); };
      dlg.showModal();
      $('#dlg-pin-1').focus();
    });
  }

  async function cargarCredencialArchivo(archivo) {
    try {
      const cred = JSON.parse(await archivo.text());
      if (!CONFIG.credenciales || !CONFIG.credenciales.clave_publica) { toast('Esta versión de la app no tiene clave pública para comprobar credenciales.', 6000); return; }
      const r = await Credencial.verificar(cred, CONFIG.credenciales.clave_publica);
      if (!r.valida) { toast('Credencial rechazada: ' + r.motivo, 8000); return; }
      const d = Credencial.datosDe(cred);
      const pin = await pedirPin({ definir: true, titulo: 'Define un PIN para esta credencial', texto: `Credencial de ${d.nombre}, ${d.cargo}. El PIN protege tu firma en este teléfono y se pedirá cada vez que firmes.` });
      if (!pin) { toast('Carga cancelada.'); return; }
      const paquete = await Credencial.cifrar(JSON.stringify(cred), pin);
      const resumen = Credencial.resumen(cred);
      Almacen.guardarCredencial({ resumen, paquete, cargada: new Date().toISOString() });
      credResumen = resumen;
      toast(resumen.firmaDigital
        ? 'Credencial cargada. Desde ahora los informes nuevos se firman con ella y llevan tu firma digital.'
        : 'Credencial cargada. Es de una versión anterior, sin clave de firma digital: los informes se firman con ella, pero la URAT no podrá comprobar la autoría. Pide una credencial nueva a la Dirección Regional.', 8000);
      renderInicio();
    } catch (e) {
      toast('No se pudo leer la credencial: ' + e.message, 7000);
    }
  }

  // Devuelve { cred } con la credencial descifrada, { cancelado: true } si el usuario desiste, o null si no hay credencial.
  async function abrirCredencial(texto) {
    const reg = Almacen.leerCredencial();
    if (!reg) return null;
    for (let intento = 0; intento < 3; intento++) {
      const pin = await pedirPin({ definir: false, titulo: 'PIN de tu credencial', texto: texto || `Firmar como ${reg.resumen.nombre}. Escribe tu PIN para usar tu firma y tu timbre.` });
      if (pin === null) return { cancelado: true };
      try { return { cred: JSON.parse(await Credencial.descifrar(reg.paquete, pin)) }; }
      catch (e) { toast(intento < 2 ? 'PIN incorrecto. Inténtalo de nuevo.' : 'PIN incorrecto.', 4000); }
    }
    return { cancelado: true };
  }

  // ---------- revisión ----------
  // En una ampliación: lista de lo que cambió respecto del informe que se amplía
  function seccionCambios() {
    if (!informe.amplia || !informe.amplia.anterior) return '';
    const d = Reglas.diferencias(informe.amplia.anterior, informe);
    if (!d.lista.length) {
      return `<section class="rev-seccion cambios"><h3>Cambios respecto de ${esc(informe.amplia.de)}</h3>
        <p class="aviso">Todavía no hay cambios en los datos. Una ampliación debe actualizar lo que cambió: revisa las secciones y corrige antes de firmar.</p></section>`;
    }
    const corto = s => (s.length > 140 ? s.slice(0, 140) + '…' : s);
    return `<section class="rev-seccion cambios"><h3>Cambios respecto de ${esc(informe.amplia.de)} (${d.lista.length})</h3>
      <ul class="lista-cambios">${d.lista.map(x => `<li><strong>${esc(x.campo)}</strong><span class="antes">${esc(corto(x.antes))}</span> → <span class="ahora">${esc(corto(x.ahora))}</span></li>`).join('')}</ul>
      <p class="ayuda">En el PDF, los valores que cambiaron en las secciones 4 y 5 van subrayados y la lista de cambios se imprime en Observaciones.</p></section>`;
  }

  // Vuelve a dibujar solo la sección 9 de la revisión, cuando cambian datos que se reflejan en Observaciones
  function refrescarObservaciones() {
    const sec = $$('#revision-contenido .rev-seccion').find(s => { const h = s.querySelector('h3'); return h && h.textContent.startsWith('9. Observaciones'); });
    if (!sec) return;
    const S = Reglas.textosSecciones(informe, CONFIG);
    sec.innerHTML = '<h3>9. Observaciones</h3>' + (S.observaciones.length ? S.observaciones.map(x => `<p>${esc(x)}</p>`).join('') : '<p class="vacio">sin indicar</p>');
  }

  // Número del informe: propuesto por el teléfono y editable (número y, en ampliaciones, letra)
  function seccionNumero() {
    const p = propuestaNumero();
    if (!informe.numeroManual || informe.numeroManual.n == null) informe.numeroManual = { n: p.n, letra: p.letra };
    if (informe.amplia && !informe.numeroManual.letra) informe.numeroManual.letra = p.letra || 'A';
    const esAmpliacion = !!informe.amplia;
    const desdeHistorial = esAmpliacion && !informe.amplia.externa;
    const externa = esAmpliacion && !!informe.amplia.externa;
    if (externa && !informe.numeroManual.anio) informe.numeroManual.anio = anioActual();
    const letras = LETRAS.split('').map(l => `<option value="${l}">${l}</option>`).join('');
    return `<section class="rev-seccion numero"><h3>Número del informe</h3>
      ${desdeHistorial ? `<p>Ampliación de <strong>${esc(informe.amplia.de)}</strong>${informe.amplia.fecha ? ' (del ' + esc(fmtFecha(informe.amplia.fecha)) + ' ' + esc(informe.amplia.hora || '') + ')' : ''}. El número base es el del informe que amplías; elige la letra.</p>` : ''}
      <div class="fila-numero">
        <span class="prefijo">${esc(PREFIJO())}-</span>
        <input type="number" min="1" step="1" inputmode="numeric" data-ruta="numeroManual.n" ${desdeHistorial ? 'disabled' : ''} aria-label="Número del informe">
        ${esAmpliacion ? `<span class="prefijo">-</span><select data-ruta="numeroManual.letra" aria-label="Letra de la ampliación">${letras}</select>` : ''}
      </div>
      <p class="ayuda">Propuesto por este teléfono: <strong>${esc(numeroPropuestoTexto(p))}</strong>, correlativo del año ${esc(p.anio)}. Cámbialo solo si ese número ya se usó en un Alfa emitido desde la planilla o desde otro teléfono. Al firmar, la app comprueba que no exista en este teléfono para ese año y ajusta su contador. El correlativo se reinicia cada año y no lleva el año: el informe se identifica por su fecha.</p>
      ${desdeHistorial ? '' : `<label class="conmutador"><input type="checkbox" id="in-amplia-externa" ${esAmpliacion ? 'checked' : ''}><span>Es ampliación de un informe anterior que no está en este teléfono (por ejemplo, hecho en la planilla)</span></label>
      ${esAmpliacion ? `<p class="ayuda">Escribe arriba el número del informe que amplías y elige la letra que corresponde. El PDF dirá que es una ampliación de ese informe.</p>
      <label class="campo campo-anio">Año del informe que amplías<input type="number" min="2000" max="2100" step="1" inputmode="numeric" data-ruta="numeroManual.anio"></label>
      <p class="ayuda">Si el evento empezó el año pasado, pon ese año: la ampliación conserva el correlativo del año en que empezó.</p>` : ''}`}
      <p class="ayuda">Al firmar, la app vuelve a comprobar todas las reglas y genera el PDF en este dispositivo. Si hay mucho texto, la hoja se alarga hacia abajo.</p></section>`;
  }

  function renderRevision() {
    actualizarProvincia(informe); actualizarResponsable(informe);
    const t = Reglas.totales(informe);
    const id = informe.identificacion, oc = informe.ocurrencia, ev = informe.evento;
    const S = Reglas.textosSecciones(informe, CONFIG);
    const hallazgos = Reglas.evaluar(informe, { todas: true });
    const fila = k => { const f = t[k]; return `<tr><td>${NOMBRES[k]}</td><td>${f.adH}</td><td>${f.adM}</td><td>${f.nnaH}</td><td>${f.nnaM}</td><td class="total">${f.total}</td></tr>`; };
    const filasPersonas = Reglas.CATEGORIAS.filter(k => t[k].total > 0 || ['afectadas', 'damnificadas', 'albergadas'].includes(k)).map(fila).join('');
    const editar = p => `<button type="button" class="enlace editar" data-accion="ir" data-pantalla="${p}">Editar</button>`;
    const lista = items => items.length ? items.map(x => `<p>${esc(x)}</p>`).join('') : '<p class="vacio">sin indicar</p>';
    const elab = elaboradorDe(informe);
    const conCred = !!(informe.responsable && informe.responsable.credencial && Almacen.leerCredencial());
    const avisoNumero = informe.amplia && !informe.amplia.externa
      ? `<p class="aviso"><strong>Ampliación de ${esc(informe.amplia.de)}</strong>. El PDF contiene el estado completo y actualizado del evento: revisa y corrige lo que cambió.</p>`
      : '<p class="aviso">Revisa cada sección y el número del informe. Al firmar se asigna el número y se genera el PDF.</p>';
    $('#revision-contenido').innerHTML = `
      ${avisoNumero}
      ${seccionNumero()}
      ${seccionCambios()}
      ${hallazgos.length ? `<p class="etiqueta roja">Hay ${hallazgos.length} punto(s) por resolver antes de firmar</p>` : '<p class="etiqueta verde">Todas las reglas cuadran</p>'}
      <section class="rev-seccion"><h3>Quién elabora ${editar('elaborador')}</h3>
        <p>${elab ? esc(elab.nombre) + ' · ' + esc(elab.nivel) : '<span class="vacio">sin indicar</span>'}</p></section>
      <section class="rev-seccion"><h3>1. Identificación ${editar('donde')}</h3>
        <p>${esc(id.region)} · Provincia: ${esc(id.provincia || '—')} · Comuna(s): <strong>${esc(Reglas.comunasTexto(informe) || '—')}</strong></p>
        <p>Fuente: ${Reglas.fuentesTexto(informe) ? esc(Reglas.fuentesTexto(informe)) : '<span class="vacio">sin indicar</span>'}${id.contacto ? ' · Contacto: ' + esc(id.contacto) : ''}</p>
        <p>${Reglas.lugarTexto(informe) ? esc(Reglas.lugarTexto(informe)) + ' <span class="ayuda">(se imprime en Observaciones)</span>' : '<span class="vacio">Sin lugar exacto ni coordenadas</span>'}</p></section>
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
      <section class="rev-seccion"><h3>6. Decisiones ${editar('decisiones')}</h3>${lista(S.decisiones)}</section>
      <section class="rev-seccion"><h3>7. Recursos involucrados ${editar('recursos')}</h3>${lista(S.recursos)}</section>
      <section class="rev-seccion"><h3>8. Evaluación de necesidades ${editar('necesidad')}</h3>${lista(S.necesidades)}</section>
      <section class="rev-seccion"><h3>9. Observaciones</h3>${lista(S.observaciones)}</section>
      <section class="rev-seccion"><h3>10. Responsable del informe</h3>
        <p>${esc(informe.responsable.nombre)}${informe.responsable.cargo ? ' · ' + esc(informe.responsable.cargo) : ''}${informe.responsable.institucion ? ' · ' + esc(informe.responsable.institucion) : ''}</p>
        <p class="ayuda">${conCred
          ? 'Al firmar se pedirá el PIN de tu credencial y se estamparán tu firma y tu timbre. La fecha y la hora de elaboración se registran al firmar. El PDF conserva la marca de agua “' + esc(CONFIG.marca_agua) + '” porque esta versión solo genera informes de ejercicio.'
          : 'Identidad ficticia de ejercicio. La fecha y la hora de elaboración se registran al firmar. Se estampan la firma y el timbre de ejercicio y la marca de agua “' + esc(CONFIG.marca_agua) + '”.'}</p></section>`;
  }

  // ---------- firma y PDF ----------
  async function recursosParaPdf() {
    if (recursosPdf) return recursosPdf;
    const leer = async u => { if (!u) return null; const r = await fetch(u); if (!r.ok) throw new Error('No se pudo leer ' + u); return new Uint8Array(await r.arrayBuffer()); };
    const [firma, timbre, logo, regular, negrita] = await Promise.all([
      leer(CONFIG.imagenes.firma), leer(CONFIG.imagenes.timbre), leer(CONFIG.imagenes.logo || null),
      leer('lib/Carlito-Regular.ttf'), leer('lib/Carlito-Bold.ttf')
    ]);
    recursosPdf = { firmaPng: firma, timbrePng: timbre, logoPng: logo, fuentes: { regular, negrita } };
    return recursosPdf;
  }
  // datos: el objeto del archivo de datos ya construido; va incorporado al PDF como adjunto
  async function generarPdf(inf, cred, datos) {
    if (!window.PDFLib) throw new Error('la biblioteca de PDF no está cargada');
    const rec = await recursosParaPdf();
    let firmaBytes = rec.firmaPng, timbreBytes = rec.timbrePng, combinada = false;
    const d = Credencial.datosDe(cred);
    if (d && d.firma_png) {
      firmaBytes = Credencial.dataUrlABytes(d.firma_png);
      timbreBytes = d.timbre_png ? Credencial.dataUrlABytes(d.timbre_png) : null;
      combinada = !!d.combinada;
    }
    const cambios = inf.amplia && inf.amplia.anterior ? Reglas.diferencias(inf.amplia.anterior, inf).rutas : null;
    return AlfaPDF.generar(inf, {
      PDFLib: window.PDFLib, fontkit: window.fontkit || null, fuentes: rec.fuentes, logoPng: rec.logoPng,
      config: CONFIG, datos: DATOS, plantilla: PLANTILLA,
      totales: Reglas.totales(inf), secciones: Reglas.textosSecciones(inf, CONFIG),
      firmaPng: firmaBytes, timbrePng: timbreBytes, firmaCombinada: combinada,
      qrcode: window.qrcode || null, qrTexto: DatosAlfa.textoQR(CONFIG, inf), cambios,
      datosAdjunto: datos ? { bytes: new TextEncoder().encode(DatosAlfa.serializar(datos)), nombre: DatosAlfa.nombreArchivoDatos(inf) } : null
    });
  }

  async function firmar() {
    actualizarProvincia(informe); actualizarResponsable(informe);
    const hallazgos = Reglas.evaluar(informe, { todas: true });
    if (hallazgos.length) { mostrarBloqueo(hallazgos[0]); return; }
    const numeroDefinitivo = validarNumero();
    if (!numeroDefinitivo) return;
    let cred = null;
    if (Almacen.leerCredencial()) {
      const r = await abrirCredencial();
      if (!r || r.cancelado) { toast('Firma cancelada: no se generó el informe.'); return; }
      cred = r.cred;
      const d = Credencial.datosDe(cred);
      informe.responsable = { nombre: d.nombre, cargo: d.cargo, institucion: d.institucion, credencial: d.id };
      informe.firmante = { id: d.id, kid: cred.sello.kid, nombre: d.nombre, institucion: d.institucion, version: cred.publico ? 2 : 1, publico: cred.publico || null, sello_publico: cred.sello_publico || null };
    } else {
      informe.firmante = null;
    }
    const btn = $('#btn-siguiente');
    btn.disabled = true; btn.textContent = 'Generando el PDF…';
    const manual = informe.numeroManual;
    try {
      informe.elaboracion = { fecha: hoyISO(), hora: ahoraHHMM(), iso: new Date().toISOString() };
      informe.numero = numeroDefinitivo;
      informe.anio = anioElegido();
      if (informe.amplia && informe.amplia.externa) { informe.amplia.base = `${PREFIJO()}-${numeroElegido().n}`; informe.amplia.de = informe.amplia.base; informe.amplia.anio = informe.anio; }
      Almacen.ajustarCorrelativo(numeroElegido().n, informe.anio);
      delete informe.numeroManual;   // es un dato de la pantalla, no del informe
      await sellarInforme(informe, cred);
      ultimoDatos = DatosAlfa.construir(informe, Reglas.totales(informe), CONFIG);
      ultimoPdf = await generarPdf(informe, cred, ultimoDatos);
      Almacen.guardarHistorial(informe);
      Almacen.borrarBorrador();
      mostrar('listo');
    } catch (e) {
      console.error(e);
      informe.elaboracion = null; informe.sello = null; informe.numero = null; informe.numeroManual = manual;
      if (!(informe.amplia && !informe.amplia.externa)) informe.anio = null;
      toast('No se pudo generar el PDF: ' + e.message, 7000);
      btn.disabled = false; btn.textContent = 'Firmar y generar el PDF';
    }
  }

  // Huella del contenido y, si la credencial trae clave de firma, firma digital del funcionario.
  // Se calcula con el número, la fecha de elaboración y el firmante ya fijados; el propio sello queda fuera de la huella.
  async function sellarInforme(inf, cred) {
    inf.sello = null;
    const h = await DatosAlfa.huella(inf);
    const priv = cred && cred.privado && cred.privado.clave_firma_privada;
    const firma = priv ? await Credencial.firmarHuella(h, priv) : null;
    inf.sello = { huella: h, firma, alg: firma ? 'ES256' : null };
  }

  function asunto() {
    return `${CONFIG.destinatario.asunto_prefijo} Informe Alfa ${informe.numero} – ${Reglas.comunasTexto(informe) || 'sin comuna'} – ${tipoTexto(informe)}`;
  }
  function nombreArchivo() {
    const comunas = informe.identificacion.comunas || [];
    const base = comunas.length === 1 ? comunas[0] : (comunas.length > 1 ? 'varias_comunas' : 'comuna');
    const limpio = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_');
    return `Informe_Alfa_${informe.numero}_${limpio}_${informe.elaboracion.fecha}.pdf`;
  }
  function blobPdf() { return new Blob([ultimoPdf], { type: 'application/pdf' }); }
  function qrSvg() {
    if (!window.qrcode) return '';
    try {
      const q = qrcode(0, 'L');
      q.addData(DatosAlfa.textoQR(CONFIG, informe));
      q.make();
      return q.createSvgTag({ cellSize: 3, margin: 2, scalable: true });
    } catch (e) { return ''; }
  }

  function renderListo() {
    const d = CONFIG.destinatario;
    const puedeCompartir = !!(navigator.share && navigator.canShare);
    $('#listo-contenido').innerHTML = `
      <p class="exito">Informe de ejercicio <strong>${esc(informe.numero)}</strong> · <strong>${esc(tipoTexto(informe))}</strong>${Reglas.comunasTexto(informe) ? ' · ' + esc(Reglas.comunasTexto(informe)) : ''}, generado en este dispositivo.${informe.amplia ? ' Es una ampliación de ' + esc(informe.amplia.de) + '.' : ''}</p>
      <p class="cred-firmante">${informe.firmante ? 'Firmado con la credencial de ' + esc(informe.firmante.nombre) + ' (' + esc(informe.firmante.institucion || '') + ')' + (informe.sello && informe.sello.firma ? ', con firma digital.' : ', sin firma digital (credencial antigua).') : 'Firmado con la identidad ficticia de ejercicio, sin firma digital.'}</p>
      <div class="qr-caja">${qrSvg()}<div><strong>Código de verificación</strong><p class="ayuda">El mismo código va impreso en el PDF, que lleva incorporados los datos del informe. La URAT escanea el código o abre el verificador, carga el PDF y comprueba que el informe es auténtico y no fue alterado.</p></div></div>
      <div class="acciones-fila">
        <button type="button" class="primario" data-accion="compartir">Compartir el PDF por correo</button>
      </div>
      <div class="acciones-fila">
        <button type="button" class="secundario" data-accion="descargar">Descargar el PDF</button>
        <button type="button" class="secundario" data-accion="ver">Ver el PDF</button>
        <button type="button" class="secundario" data-accion="descargar-datos">Descargar los datos aparte (.alfa.json)</button>
      </div>
      <p class="ayuda"><strong>“Ver el PDF” es solo para mirarlo.</strong> No uses el botón de compartir del visor: envía un enlace temporal que no funciona fuera de este teléfono. Para enviar el informe usa “Compartir el PDF por correo” o “Descargar el PDF”.</p>
      <ol class="pasos-correo">
        ${puedeCompartir
          ? `<li><strong>Compartir el PDF por correo</strong> copia la dirección de destino y abre el menú de compartir con el PDF ya adjunto. Elige tu aplicación de correo. El PDF lleva adentro los datos para el verificador; el archivo .alfa.json aparte es opcional.</li>
             <li>En el correo, mantén presionado el campo <strong>Para</strong> y pega la dirección. El asunto y el texto ya van escritos, y la dirección aparece también en el texto del correo.</li>`
          : `<li>Este navegador no ofrece el menú de compartir con archivos (es normal en un computador). Usa la alternativa siguiente.</li>`}
        <li>Alternativa sin adjunto: <button type="button" class="enlace" data-accion="correo">abrir el correo con el destinatario ya escrito</button>. El PDF se descarga y debes adjuntarlo tú desde Descargas: <code>${esc(nombreArchivo())}</code>. Sin servidor, ninguna app web puede enviar el correo ni adjuntar el archivo por sí sola.</li>
      </ol>
      <h2>Destinatario</h2>
      <div class="correo-caja"><strong>${esc(d.nombre)}</strong><br><code>${esc(d.correo)}</code><br>
        <button type="button" class="enlace" data-accion="copiar" data-texto="${esc(d.correo)}">Copiar la dirección</button></div>
      <div class="correo-caja">Asunto sugerido:<br><code>${esc(asunto())}</code><br>
        <button type="button" class="enlace" data-accion="copiar" data-texto="${esc(asunto())}">Copiar el asunto</button></div>
      <p class="ayuda">El destinatario configurado es un correo de prueba. Si alguna vez se envía un ejercicio a la casilla real de la URAT, avisa antes al turno (riesgo R-14 de la arquitectura).</p>
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
      `Adjunto el Informe Alfa ${informe.numero} de EJERCICIO (sin valor oficial), ${Reglas.comunasTexto(informe) || 'sin comuna'}, evento: ${tipoTexto(informe)}, inicio el ${fmtFecha(informe.ocurrencia.fecha)} a las ${informe.ocurrencia.hora}.`,
      `Totales: ${t.afectadas.total} afectadas, ${t.damnificadas.total} damnificadas, ${t.albergadas.total} albergadas; ${t.viviendas_danadas} viviendas dañadas.`,
      '',
      `Archivo adjunto: ${nombreArchivo()}`,
      '',
      'Generado con la App Informe Alfa (demo).'
    ].join('\n');
    descargar();
    const url = `mailto:${d.correo}?subject=${encodeURIComponent(asunto())}&body=${encodeURIComponent(cuerpo)}`;
    toast('PDF descargado. Se abre tu correo con el destinatario escrito: toca el clip y adjunta el archivo desde Descargas.', 9000);
    setTimeout(() => { window.location.href = url; }, 900);
  }

  async function compartir() {
    if (!ultimoPdf) { toast('Primero genera el PDF.'); return; }
    const d = CONFIG.destinatario;
    // Se comparte solo el PDF: lleva incorporado el archivo de datos. Compartir además el .alfa.json fallaba en
    // Chrome para Android, que no admite archivos .json en el menú de compartir aunque antes diga que sí (E-22).
    const archivo = new File([ultimoPdf], nombreArchivo(), { type: 'application/pdf' });
    const texto = `${asunto()}\nDestinatario: ${d.correo}\nDocumento de ejercicio, sin valor oficial. El PDF lleva incorporados los datos para el verificador de la URAT.`;
    const datos = { files: [archivo], title: asunto(), text: texto };
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      let copiado = false;
      try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(d.correo); copiado = true; } } catch (e) { /* la dirección va igual en el texto */ }
      toast(copiado ? 'Dirección copiada: pégala en el campo Para del correo.' : 'Pega en el campo Para la dirección que va en el texto del correo.', 8000);
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
  function textoDatos() { return JSON.stringify(ultimoDatos, null, 1); }
  function descargarDatos() {
    if (!ultimoDatos) { toast('Primero genera el PDF.'); return; }
    const url = URL.createObjectURL(new Blob([textoDatos()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = DatosAlfa.nombreArchivoDatos(informe);
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
    const anterior = JSON.parse(JSON.stringify(h));       // estado completo del informe que se amplía, para mostrar e imprimir los cambios
    if (anterior.amplia) delete anterior.amplia.anterior;  // solo un nivel hacia atrás
    copia.amplia = { de: h.numero, base: h.amplia && h.amplia.base ? h.amplia.base : h.numero, fecha: h.elaboracion && h.elaboracion.fecha, hora: h.elaboracion && h.elaboracion.hora, anterior };
    copia.numero = null;
    copia.anio = anioDe(h);   // la ampliación conserva el correlativo del año en que empezó el evento
    copia.elaboracion = null;
    copia.firmante = null;
    copia.sello = null;
    delete copia.importado;
    delete copia.numeroManual;
    copia.creado = new Date().toISOString();
    informe = copia;
    guardar();
    toast(`Ampliación de ${h.numero}: actualiza solo lo que cambió.`, 5000);
    mostrar('elaborador');
  }

  async function reabrir(i) {
    const h = Almacen.leerHistorial()[i];
    if (!h) return;
    informe = normalizar(h);
    let cred = null;
    if (informe.firmante) {
      const reg = Almacen.leerCredencial();
      if (reg && reg.resumen.id === informe.firmante.id) {
        const r = await abrirCredencial('Para volver a generar el PDF con tu firma, escribe tu PIN.');
        if (!r || r.cancelado) { toast('Cancelado.'); return; }
        cred = r.cred;
      } else {
        toast('La credencial con la que se firmó este informe no está en este teléfono; el PDF se genera con la firma de ejercicio.', 7000);
      }
    }
    toast('Generando el PDF otra vez…');
    try {
      if (!informe.sello) {   // informes guardados por versiones anteriores a la 0.5
        if (cred && cred.publico && informe.firmante && informe.firmante.id === cred.publico.id) {
          informe.firmante.publico = cred.publico; informe.firmante.sello_publico = cred.sello_publico; informe.firmante.version = 2;
        }
        await sellarInforme(informe, cred);
      }
      ultimoDatos = DatosAlfa.construir(informe, Reglas.totales(informe), CONFIG);
      ultimoPdf = await generarPdf(informe, cred, ultimoDatos);
      mostrar('listo');
    } catch (e) { toast('No se pudo generar el PDF: ' + e.message, 6000); }
  }

  // Importa un informe generado en otro teléfono: desde su PDF (lleva los datos incorporados) o desde su archivo .alfa.json
  async function importarArchivo(archivo) {
    try {
      let obj;
      if (/\.pdf$/i.test(archivo.name) || archivo.type === 'application/pdf') {
        if (!window.PDFLib) throw new Error('la biblioteca de PDF no está cargada');
        const ex = await DatosAlfa.extraerDePdf(window.PDFLib, new Uint8Array(await archivo.arrayBuffer()));
        if (!ex.archivo) { toast('Este PDF no trae los datos del informe incorporados (puede ser de una versión anterior a la 0.5.2). Importa el archivo .alfa.json.', 8000); return; }
        obj = ex.archivo;
      } else {
        obj = JSON.parse(await archivo.text());
      }
      const v = DatosAlfa.validar(obj);
      if (!v.ok) { toast('No se pudo importar: ' + v.motivo, 7000); return; }
      const h = await DatosAlfa.huella(obj.informe);
      if (h !== obj.huella) { toast('No se pudo importar: el archivo fue modificado después de generarse (la huella no coincide).', 8000); return; }
      const inf = normalizar(obj.informe);
      if (!inf.elaboracion || !inf.numero) { toast('El archivo no corresponde a un informe firmado.', 6000); return; }
      if (!inf.anio) inf.anio = anioDe(inf);   // informes de versiones anteriores a la 0.5.5
      inf.importado = { fecha: new Date().toISOString(), app: obj.app || '' };
      const hist = Almacen.leerHistorial();
      const idx = hist.findIndex(x => x.numero === inf.numero);
      if (idx >= 0) {
        if (!confirm(`Ya existe el informe ${inf.numero} en este teléfono. ¿Reemplazarlo por el importado?`)) return;
        hist.splice(idx, 1);
      }
      hist.unshift(inf);
      Almacen.escribirHistorial(hist);
      renderInicio();
      toast(`Informe ${inf.numero} importado. Puedes ampliarlo o compartirlo desde la lista.`, 6000);
    } catch (e) {
      toast('No se pudo leer el archivo: ' + e.message, 7000);
    }
  }

  async function accionDinamica(accion, ds) {
    switch (accion) {
      case 'ir': mostrar(ds.pantalla); break;
      case 'correo': enviarCorreo(); break;
      case 'compartir': await compartir(); break;
      case 'descargar': descargar(); break;
      case 'ver': ver(); break;
      case 'copiar': await copiar(ds.texto); break;
      case 'otro': informe = nuevoInforme(); guardar(); mostrar('elaborador'); break;
      case 'inicio': mostrar('inicio'); break;
      case 'ampliar': ampliar(+ds.i); break;
      case 'reabrir': await reabrir(+ds.i); break;
      case 'descargar-datos': descargarDatos(); break;
      case 'importar': $('#in-importar').click(); break;
      case 'cargar-credencial': $('#in-credencial').click(); break;
      case 'quitar-credencial':
        if (confirm('¿Quitar la credencial de este teléfono? Los informes nuevos volverán a firmarse con la identidad ficticia de ejercicio.')) {
          Almacen.borrarCredencial(); credResumen = null; renderInicio(); toast('Credencial quitada.');
        }
        break;
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
      default: break;
    }
  }

  // ---------- inicio, instalación y conexión ----------
  function renderInicio() {
    const borrador = Almacen.leerBorrador();
    $('#btn-continuar').hidden = !borrador;
    $('#btn-descartar').hidden = !borrador;
    if (borrador) {
      const comunas = (borrador.identificacion && (borrador.identificacion.comunas || (borrador.identificacion.comuna ? [borrador.identificacion.comuna] : []))) || [];
      const etiqueta = borrador.amplia ? `ampliación de ${borrador.amplia.de}` : comunas.join(', ');
      $('#btn-continuar').textContent = 'Continuar el borrador guardado' + (etiqueta ? ` (${etiqueta})` : '');
    }

    const reg = Almacen.leerCredencial();
    $('#credencial-estado').innerHTML = reg
      ? `<div class="resumen-cred"><strong>${esc(reg.resumen.nombre)}</strong><br>${esc(reg.resumen.cargo)}<br>${esc(reg.resumen.institucion)}<br><small>Vence el ${esc(fmtFecha(reg.resumen.vence))} · credencial de ejercicio · protegida con PIN</small></div>
         <div class="acciones-fila"><button type="button" class="secundario" data-accion="cargar-credencial">Cambiar credencial</button><button type="button" class="enlace" data-accion="quitar-credencial">Quitar</button></div>`
      : `<p class="sin-cred">Sin credencial cargada: los informes se firman con la identidad y la firma ficticias de ejercicio.</p>
         <div class="acciones-fila"><button type="button" class="primario" data-accion="cargar-credencial">Cargar credencial</button></div>
         <p class="ayuda">La credencial es un archivo que emite la Dirección Regional con tu nombre, cargo, firma y timbre, sellado para que nadie lo altere. Llega a tu correo institucional: guárdalo en el teléfono y cárgalo aquí con un PIN. Para probar hay una credencial genérica de ejercicio: <a href="datos/credencial_ejercicio_demo.alfacred.json" download="credencial_ejercicio_demo.alfacred.json">descargar</a>.</p>`;

    const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    $('#instalacion').hidden = false;
    $('#btn-instalar').hidden = !eventoInstalacion;
    $('#ayuda-ios').hidden = !(esIOS && !instalada);
    $('#ayuda-android').hidden = !(!esIOS && !instalada && !eventoInstalacion);
    $('#ya-instalada').hidden = !instalada;

    const hist = Almacen.leerHistorial();
    $('#historial').hidden = hist.length === 0;
    $('#lista-historial').innerHTML = hist.map((h, i) => {
      const comunas = (h.identificacion.comunas || (h.identificacion.comuna ? [h.identificacion.comuna] : [])).join(', ');
      return `<li><span><strong>${esc(h.numero)}</strong> · ${esc(comunas)} · ${esc(fmtFecha(h.elaboracion && h.elaboracion.fecha))} ${esc(h.elaboracion && h.elaboracion.hora || '')}${h.importado ? '<small class="etiqueta-importado">importado</small>' : ''}</span>
       <span class="acciones-historial">
         <button type="button" class="secundario" data-accion="ampliar" data-i="${i}">Ampliar</button>
         <button type="button" class="secundario" data-accion="reabrir" data-i="${i}">Compartir</button>
       </span></li>`;
    }).join('');
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
        nuevo.addEventListener('statechange', () => { if (nuevo.state === 'installed' && navigator.serviceWorker.controller) avisar(); });
      });
    }).catch(e => console.warn('Service worker no registrado:', e));
  }

  iniciar();
})();
