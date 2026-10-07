/* Motor de reglas de la demo. La lógica de cada regla vive aquí, identificada por su id;
   los textos, niveles, fuentes, casos de solución y los catálogos viven en datos/reglas.json. */
const Reglas = (() => {
  'use strict';
  let D = null;

  // Categorías de la sección 4 del formato. Las albergadas no se suman a "personas únicas":
  // ya están contadas como damnificadas, evacuadas o aisladas.
  const CATEGORIAS = ['afectadas', 'aisladas', 'albergadas', 'damnificadas', 'damnificadas_laborales', 'desaparecidas', 'evacuadas', 'extraviadas', 'fallecidas', 'lesionadas'];
  const NO_SUMAN_A_UNICAS = ['albergadas'];

  function cargar(datos) { D = datos; }

  // ---------- utilidades ----------
  function n(v) { const x = parseInt(v, 10); return isNaN(x) || x < 0 ? 0 : x; }
  function fila() { return { adH: 0, adM: 0, nnaH: 0, nnaM: 0, total: 0 }; }
  function sumar(f, v) {
    if (!v) return;
    f.adH += n(v.adH); f.adM += n(v.adM); f.nnaH += n(v.nnaH); f.nnaM += n(v.nnaM);
    f.total = f.adH + f.adM + f.nnaH + f.nnaM;
  }
  function ocupantes(v) { return v ? n(v.adH) + n(v.adM) + n(v.nnaH) + n(v.nnaM) : 0; }
  function lista(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
  }
  function plantilla(texto, datos) {
    return String(texto || '').replace(/\{(\w+)\}/g, (m, k) => (datos && datos[k] != null ? datos[k] : m));
  }
  function fechaHoraInicio(informe) {
    const f = informe.ocurrencia && informe.ocurrencia.fecha;
    const h = informe.ocurrencia && informe.ocurrencia.hora;
    if (!f || !h) return null;
    const d = new Date(`${f}T${h}:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  function horasDesdeInicio(informe) {
    const d = fechaHoraInicio(informe);
    return d ? (Date.now() - d.getTime()) / 36e5 : null;
  }
  function fmtFecha(iso) { if (!iso) return ''; const p = iso.split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : iso; }
  function elemento(id) { return D.catalogo_elementos.find(e => e.id === id) || null; }
  function categoria(id) { return D.categorias_personas.find(c => c.id === id) || null; }
  function organismo(id) { return (D.organismos_respuesta || []).find(o => o.id === id) || null; }
  function regla(id) { return D.reglas.find(r => r.id === id); }
  function texto(v) { return String(v == null ? '' : v).trim(); }

  function fuentesTexto(informe) {
    const id = informe.identificacion || {};
    const partes = [].concat(id.fuentes || []);
    if (texto(id.fuenteOtra)) partes.push(texto(id.fuenteOtra));
    if (!partes.length && id.fuente) partes.push(id.fuente); // informes antiguos
    return partes.join(', ');
  }
  function comunasTexto(informe) {
    const id = informe.identificacion || {};
    const lista = Array.isArray(id.comunas) && id.comunas.length ? id.comunas : (id.comuna ? [id.comuna] : []);
    return lista.join(', ');
  }
  function coordenadas(informe) {
    const l = informe.lugar || {};
    const lat = texto(l.lat).replace(',', '.'), lon = texto(l.lon).replace(',', '.');
    if (!lat && !lon) return { vacias: true };
    const la = Number(lat), lo = Number(lon);
    const completas = lat !== '' && lon !== '';
    const numericas = completas && Number.isFinite(la) && Number.isFinite(lo);
    const enRango = numericas && la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
    return { vacias: false, completas, numericas, enRango, lat: la, lon: lo, precision: l.precision, origen: l.origen };
  }
  function lugarTexto(informe) {
    const l = informe.lugar || {};
    const partes = [];
    if (texto(l.descripcion)) partes.push(`Lugar: ${texto(l.descripcion)}`);
    const c = coordenadas(informe);
    if (!c.vacias && c.enRango) {
      let s = `Coordenadas: ${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`;
      if (c.precision) s += ` (precisión ±${Math.round(c.precision)} m, GPS del teléfono)`;
      else if (c.origen === 'gps') s += ' (GPS del teléfono)';
      partes.push(s);
    }
    return partes.join('. ');
  }

  // ---------- totales ----------
  function totales(informe) {
    const t = { viviendas: {}, viviendas_danadas: 0, viviendas_no_habitables: 0, albergadas_viviendas: 0, albergadas_otras: 0, personas: 0, personas_hombres: 0, personas_mujeres: 0, personas_nna: 0 };
    CATEGORIAS.forEach(k => { t[k] = fila(); });
    for (const c of D.condiciones_vivienda) {
      const v = (informe.viviendas || {})[c.id] || {};
      const viv = n(v.viviendas);
      t.viviendas[c.id] = viv;
      t.viviendas_danadas += viv;
      sumar(t[c.ocupantes_cuentan_como], v);
      if (c.ocupantes_cuentan_como === 'damnificadas') t.viviendas_no_habitables += viv;
      if (c.pregunta_albergue && v.hayAlbergue) { sumar(t.albergadas, v.albergue); t.albergadas_viviendas += ocupantes(v.albergue); }
    }
    for (const c of (D.categorias_personas || [])) {
      const o = (informe.otras || {})[c.id];
      if (o && o.hay) {
        sumar(t[c.id], o);
        if (c.id === 'albergadas') t.albergadas_otras += ocupantes(o);
      }
    }
    for (const k of CATEGORIAS) {
      if (NO_SUMAN_A_UNICAS.includes(k)) continue;
      t.personas += t[k].total;
      t.personas_hombres += t[k].adH + t[k].nnaH;
      t.personas_mujeres += t[k].adM + t[k].nnaM;
      t.personas_nna += t[k].nnaH + t[k].nnaM;
    }
    return t;
  }

  // ---------- textos de las secciones 6 a 9 (los usan la revisión y el PDF) ----------
  function textoRecursos(informe) {
    const rec = informe.recursos || {};
    const recursos = [];
    if (rec.sinRecursos) recursos.push('Sin recursos desplegados al momento de este informe.');
    for (const o of (D.organismos_respuesta || [])) {
      const r = (rec.organismos || {})[o.id];
      if (!r || !r.hay) continue;
      const partes = [];
      if (n(r.personas) > 0) partes.push(`${n(r.personas)} persona(s)`);
      if (texto(r.medios)) partes.push(texto(r.medios));
      recursos.push(`${o.nombre}: ${partes.join('; ') || 'presente'}`);
    }
    if (rec.otro && rec.otro.hay && texto(rec.otro.nombre)) {
      const partes = [];
      if (n(rec.otro.personas) > 0) partes.push(`${n(rec.otro.personas)} persona(s)`);
      if (texto(rec.otro.medios)) partes.push(texto(rec.otro.medios));
      recursos.push(`${texto(rec.otro.nombre)}: ${partes.join('; ') || 'presente'}`);
    }
    return recursos;
  }
  function textoNecesidades(informe) {
    const necesidades = [];
    if (informe.hayNecesidad === true) {
      (informe.necesidades || []).filter(x => x.elemento).forEach((x, i) => {
        const el = elemento(x.elemento);
        const nombre = x.elemento === 'otro' ? (texto(x.otroNombre) || 'Otro') : (el ? el.nombre : x.elemento);
        const unidad = el && el.unidad ? ' ' + el.unidad : '';
        necesidades.push(`${i + 1}. ${n(x.cantidad)}${unidad} de ${nombre}. ¿Para qué?: ${texto(x.paraQue)}`);
      });
    } else if (informe.hayNecesidad === false) {
      necesidades.push('Sin necesidades que no puedan cubrirse con recursos locales al momento de este informe.');
    }
    return necesidades;
  }

  // ---------- diferencias entre un informe y la ampliación que lo actualiza ----------
  const CELDAS = [['adH', 'hombres adultos'], ['adM', 'mujeres adultas'], ['nnaH', 'niños y adolescentes (H)'], ['nnaM', 'niñas y adolescentes (M)']];
  const FILAS_PDF = { afectadas: 'AFECTADAS', aisladas: 'AISLADAS', albergadas: 'ALBERGADAS', damnificadas: 'DAMNIFICADAS', damnificadas_laborales: 'DAMNIFICADAS LABORALES', desaparecidas: 'DESAPARECIDAS', evacuadas: 'EVACUADAS', extraviadas: 'EXTRAVIADAS', fallecidas: 'FALLECIDAS', lesionadas: 'LESIONADAS' };
  const TEXTUALES = new Set(['Fuente', 'Contacto', 'Lugar', 'Acciones realizadas', 'Acciones por realizar', 'Recursos involucrados', 'Necesidades']);
  // Devuelve { lista: [{ campo, antes, ahora, seccion, textual }], rutas: Set de casillas del PDF que cambiaron }
  function diferencias(anterior, actual) {
    const L = []; const rutas = new Set();
    if (!anterior || !actual) return { lista: L, rutas };
    const dif = (campo, antes, ahora, seccion) => {
      const a = texto(antes), b = texto(ahora);
      if (a !== b) L.push({ campo, antes: a || '(vacío)', ahora: b || '(vacío)', seccion, textual: TEXTUALES.has(campo) });
    };
    const idA = anterior.identificacion || {}, idB = actual.identificacion || {};
    dif('Comunas', comunasTexto(anterior), comunasTexto(actual), 1);
    dif('Fuente', fuentesTexto(anterior), fuentesTexto(actual), 1);
    dif('Contacto', idA.contacto, idB.contacto, 1);
    dif('Lugar', lugarTexto(anterior), lugarTexto(actual), 1);
    dif('Fecha de inicio', fmtFecha((anterior.ocurrencia || {}).fecha), fmtFecha((actual.ocurrencia || {}).fecha), 2);
    dif('Hora de inicio', (anterior.ocurrencia || {}).hora, (actual.ocurrencia || {}).hora, 2);
    const tipo = inf => { const e = inf.evento || {}; return e.tipo === 'OTRO' ? ('Otro: ' + texto(e.otro)) : (e.tipo || ''); };
    dif('Tipo de evento', tipo(anterior), tipo(actual), 3);
    for (const c of D.condiciones_vivienda) {
      const va = (anterior.viviendas || {})[c.id] || {}, vb = (actual.viviendas || {})[c.id] || {};
      const nombreCond = c.nivel_largo || c.titulo;   // "Daño menor", como en la sección 5 del formato
      dif(`${nombreCond}: viviendas`, n(va.viviendas), n(vb.viviendas), 5);
      for (const [k, nombre] of CELDAS) dif(`${nombreCond}: ocupantes, ${nombre}`, n(va[k]), n(vb[k]), 4);
      if (c.pregunta_albergue) for (const [k, nombre] of CELDAS) dif(`${nombreCond}: en albergue, ${nombre}`, va.hayAlbergue ? n((va.albergue || {})[k]) : 0, vb.hayAlbergue ? n((vb.albergue || {})[k]) : 0, 4);
    }
    for (const c of (D.categorias_personas || [])) {
      const oa = (anterior.otras || {})[c.id] || {}, ob = (actual.otras || {})[c.id] || {};
      for (const [k, nombre] of CELDAS) dif(`${c.etiqueta}: ${nombre}`, oa.hay ? n(oa[k]) : 0, ob.hay ? n(ob[k]) : 0, 4);
      if (c.requiere_denuncia) dif(`${c.etiqueta}: denuncia`, oa.hay && oa.denuncia ? 'sí' : 'no', ob.hay && ob.denuncia ? 'sí' : 'no', 4);
    }
    dif('Acciones realizadas', (anterior.decisiones || {}).realizadas, (actual.decisiones || {}).realizadas, 6);
    dif('Acciones por realizar', (anterior.decisiones || {}).pendientes, (actual.decisiones || {}).pendientes, 6);
    dif('Recursos involucrados', textoRecursos(anterior).join(' | '), textoRecursos(actual).join(' | '), 7);
    dif('Necesidades', textoNecesidades(anterior).join(' | '), textoNecesidades(actual).join(' | '), 8);
    dif('Responsable', (anterior.responsable || {}).nombre, (actual.responsable || {}).nombre, 10);
    // Casillas del PDF (secciones 4 y 5) cuyo valor cambió: se subrayan al dibujar
    const ta = totales(anterior), tb = totales(actual);
    for (const k of CATEGORIAS) for (const col of ['adH', 'adM', 'nnaH', 'nnaM', 'total']) if (ta[k][col] !== tb[k][col]) rutas.add(`personas.${FILAS_PDF[k]}.${col}`);
    for (const c of D.condiciones_vivienda) if (ta.viviendas[c.id] !== tb.viviendas[c.id]) rutas.add(`viviendas.${c.nivel}`);
    return { lista: L, rutas };
  }
  const MAX_CAMBIOS_PDF = 15;
  function cambiosTexto(informe) {
    if (!informe.amplia || !informe.amplia.anterior) return null;
    const d = diferencias(informe.amplia.anterior, informe);
    if (!d.lista.length) return `Sin cambios en los datos respecto del informe ${informe.amplia.de}.`;
    const partes = d.lista.slice(0, MAX_CAMBIOS_PDF).map(x => x.textual ? `${x.campo}: actualizado` : `${x.campo}: de ${x.antes} a ${x.ahora}`);
    const resto = d.lista.length - MAX_CAMBIOS_PDF;
    return `Cambios respecto del informe ${informe.amplia.de}: ${partes.join('; ')}${resto > 0 ? `; y ${resto} cambio(s) más (ver el archivo de datos)` : ''}. Los valores subrayados en las secciones 4 y 5 cambiaron.`;
  }

  function textosSecciones(informe, config) {
    const t = totales(informe);
    const dec = informe.decisiones || {};
    const decisiones = [];
    if (texto(dec.realizadas)) decisiones.push(`Acciones realizadas: ${texto(dec.realizadas)}`);
    if (texto(dec.pendientes)) decisiones.push(`Acciones por realizar o requeridas: ${texto(dec.pendientes)}`);
    const recursos = textoRecursos(informe);
    const necesidades = textoNecesidades(informe);

    const observaciones = [];
    if (informe.amplia && informe.amplia.de) {
      observaciones.push(`Ampliación del Informe Alfa ${informe.amplia.de} del ${fmtFecha(informe.amplia.fecha)} ${informe.amplia.hora || ''}: contiene el estado completo y actualizado del evento.`);
      const cambios = cambiosTexto(informe);
      if (cambios) observaciones.push(cambios);
    }
    const lugar = lugarTexto(informe);
    if (lugar) observaciones.push(lugar);
    const J = informe.justificaciones || {};
    for (const clave of Object.keys(J)) {
      if (!texto(J[clave])) continue;
      const r = regla(clave.split(':')[0]);
      const titulo = r ? plantilla(r.titulo, { numero: '' }).replace(/\s+/g, ' ').trim() : clave;
      observaciones.push(`${titulo}: ${texto(J[clave])}`);
    }
    const version = config && config.version_app ? config.version_app : '';
    observaciones.push(`Informe de EJERCICIO generado con la app Informe Alfa (versión ${version}). Personas únicas registradas (aprox.): ${t.personas}; viviendas dañadas: ${t.viviendas_danadas}.`);

    return { decisiones, recursos, necesidades, observaciones };
  }

  // ---------- sugerencia de cantidad ----------
  function sugerencia(elementoId, informe) {
    const el = elemento(elementoId);
    if (!el || !el.base || !el.factor) return null;
    const t = totales(informe);
    const baseValor = t[el.base] || 0;
    const tope = Math.ceil(baseValor * el.factor);
    return { tope, baseValor, baseNombre: D.bases[el.base].nombre, criterio: el.criterio, nivel: el.nivel_tope };
  }

  // ---------- evaluación ----------
  // opciones: { pantalla: 'elaborador'|'donde'|'evento'|'viviendas'|'personas'|'decisiones'|'recursos'|'necesidad' } o { todas: true }
  function evaluar(informe, opciones) {
    opciones = opciones || {};
    const todas = !!opciones.todas;
    const en = p => todas || opciones.pantalla === p;
    const P = D.parametros;
    const t = totales(informe);
    const H = [];
    const just = informe.justificaciones || {};

    function hallazgo(r, datos, extra) {
      extra = extra || {};
      const nivel = r.nivel === 'segun_elemento' ? (extra.nivel || 'bloqueo') : r.nivel;
      const clave = r.id + (extra.sufijo ? ':' + extra.sufijo : '');
      if (nivel === 'justificacion' && texto(just[clave])) return;
      const opcionesResolver = (nivel === 'justificacion' && r.como_resolver_justificacion) ? r.como_resolver_justificacion : r.como_resolver;
      H.push({
        id: r.id, clave, nivel,
        titulo: plantilla(r.titulo, datos),
        fuente: r.fuente,
        que_no_cuadra: plantilla(r.que_no_cuadra, datos),
        por_que: plantilla(r.por_que, datos),
        como_resolver: (opcionesResolver || []).map(o => ({ texto: plantilla(o.texto, datos), pantalla: o.pantalla ? plantilla(o.pantalla, datos) : null, accion: o.accion || null })),
        caso_parecido: extra.caso || r.caso_parecido,
        pantalla: r.pantalla || datos.pantalla_faltante || null,
        datos
      });
    }

    // 1. Campos obligatorios: quién elabora, comuna(s), fecha, hora, tipo de evento
    if (en('elaborador') || en('donde') || en('evento')) {
      const faltan = []; let pf = null;
      const E = informe.elaborador || {};
      if (en('elaborador')) {
        if (!E.nivel) { faltan.push('quién elabora el informe'); pf = pf || 'elaborador'; }
        else if (E.nivel === 'provincial' && !E.provincia) { faltan.push('la provincia de la Delegación'); pf = pf || 'elaborador'; }
      }
      if (en('donde')) {
        const comunas = (informe.identificacion.comunas || []).filter(Boolean);
        if (!comunas.length) { faltan.push(E.nivel === 'comunal' ? 'la comuna' : 'al menos una comuna afectada'); pf = pf || 'donde'; }
        if (!informe.ocurrencia.fecha) { faltan.push('la fecha de inicio'); pf = pf || 'donde'; }
        if (!informe.ocurrencia.hora) { faltan.push('la hora de inicio'); pf = pf || 'donde'; }
      }
      if (en('evento')) {
        if (!informe.evento.tipo) { faltan.push('el tipo de evento'); pf = pf || 'evento'; }
        else if (informe.evento.tipo === 'OTRO' && !texto(informe.evento.otro)) { faltan.push('cuál es el otro tipo de evento'); pf = pf || 'evento'; }
      }
      if (faltan.length) hallazgo(regla('CAMPOS_OBLIGATORIOS'), { faltantes: lista(faltan), pantalla_faltante: pf });
    }

    // 2. Fecha futura y coordenadas
    if (en('donde')) {
      const inicio = fechaHoraInicio(informe);
      if (inicio && inicio.getTime() > Date.now() + 60 * 1000) {
        hallazgo(regla('FECHA_FUTURA'), { fecha: fmtFecha(informe.ocurrencia.fecha), hora: informe.ocurrencia.hora });
      }
      const c = coordenadas(informe);
      if (!c.vacias) {
        let detalle = null;
        if (!c.completas) detalle = 'Escribiste solo una de las dos coordenadas. Se necesitan latitud y longitud, o ninguna.';
        else if (!c.numericas) detalle = 'Las coordenadas deben ser números decimales, por ejemplo -53.1625 y -70.9085.';
        else if (!c.enRango) detalle = 'La latitud debe estar entre -90 y 90 y la longitud entre -180 y 180.';
        if (detalle) hallazgo(regla('LUGAR_COORDENADAS'), { detalle });
      }
    }

    // 3. Viviendas y ocupantes
    if (en('viviendas')) {
      const celdas = [['adH', 'hombres adultos'], ['adM', 'mujeres adultas'], ['nnaH', 'niños y adolescentes hombres'], ['nnaM', 'niñas y adolescentes mujeres']];
      for (const c of D.condiciones_vivienda) {
        const v = (informe.viviendas || {})[c.id] || {};
        const occ = ocupantes(v);
        const viv = n(v.viviendas);
        const cond = c.titulo.toLowerCase();
        if (viv === 0 && occ > 0) hallazgo(regla('PERSONAS_SIN_VIVIENDA'), { condicion: cond, ocupantes: occ, condicion_id: c.id }, { sufijo: c.id });
        if (c.pregunta_albergue && v.hayAlbergue && v.albergue) {
          for (const [k, nombre] of celdas) {
            if (n(v.albergue[k]) > n(v[k])) {
              hallazgo(regla('ALBERGUE_EXCEDE'), { condicion: cond, ocupantes: n(v[k]), grupo: nombre, albergados: n(v.albergue[k]) }, { sufijo: c.id + ':' + k });
              break;
            }
          }
        }
        if (viv > 0 && occ === 0 && c.ocupantes_cuentan_como === 'damnificadas') hallazgo(regla('SIN_OCUPANTES'), { viviendas: viv, condicion: cond }, { sufijo: c.id });
        if (viv > 0 && occ / viv > P.umbral_personas_por_vivienda) {
          hallazgo(regla('PROMEDIO_INUSUAL'), { viviendas: viv, ocupantes: occ, condicion: cond, promedio: (occ / viv).toFixed(1).replace('.', ','), umbral: P.umbral_personas_por_vivienda }, { sufijo: c.id });
        }
      }
    }

    // 4. Otras personas afectadas
    if (en('personas')) {
      for (const c of (D.categorias_personas || [])) {
        const o = (informe.otras || {})[c.id];
        if (o && o.hay && ocupantes(o) === 0) hallazgo(regla('CATEGORIA_VACIA'), { categoria: c.etiqueta.toLowerCase() }, { sufijo: c.id });
        if (c.requiere_denuncia && o && o.hay && ocupantes(o) > 0 && !o.denuncia) hallazgo(regla('DESAPARECIDAS_SIN_DENUNCIA'), { desaparecidas: ocupantes(o) }, { sufijo: c.id });
      }
      const suma = t.damnificadas.total + t.evacuadas.total + t.aisladas.total;
      if (t.albergadas.total > suma) hallazgo(regla('ALBERGUE_TOTAL'), { albergadas: t.albergadas.total, suma, damnificadas: t.damnificadas.total, evacuadas: t.evacuadas.total, aisladas: t.aisladas.total });
    }

    // 5. Decisiones (sección 6)
    if (en('decisiones')) {
      const dec = informe.decisiones || {};
      const faltan = [];
      if (texto(dec.realizadas).length < P.largo_minimo_decision) faltan.push('qué acciones se han realizado, quién y cuándo');
      if (texto(dec.pendientes).length < P.largo_minimo_decision) faltan.push('qué acciones faltan o se requieren (o escribir que no hay pendientes)');
      if (faltan.length) hallazgo(regla('DECISIONES_INCOMPLETAS'), { faltantes: lista(faltan) });
    }

    // 6. Recursos involucrados (sección 7)
    if (en('recursos')) {
      const rec = informe.recursos || {};
      const marcados = (D.organismos_respuesta || []).filter(o => rec.organismos && rec.organismos[o.id] && rec.organismos[o.id].hay);
      const otro = rec.otro && rec.otro.hay;
      let detalle = null;
      if (!rec.sinRecursos && !marcados.length && !otro) detalle = 'No marcaste ningún organismo ni la casilla "no hay recursos desplegados por ahora".';
      else if (rec.sinRecursos && (marcados.length || otro)) detalle = 'Marcaste "no hay recursos desplegados" y a la vez organismos presentes. Elige una de las dos cosas.';
      else {
        const incompletos = marcados.filter(o => { const r = rec.organismos[o.id]; return n(r.personas) === 0 && !texto(r.medios); }).map(o => o.nombre);
        if (otro && !texto(rec.otro.nombre)) incompletos.push('el organismo "otro" sin nombre');
        else if (otro && n(rec.otro.personas) === 0 && !texto(rec.otro.medios)) incompletos.push(texto(rec.otro.nombre));
        if (incompletos.length) detalle = `Falta indicar personas o medios de: ${lista(incompletos)}.`;
      }
      if (detalle) hallazgo(regla('RECURSOS_INCOMPLETOS'), { detalle });
    }

    // 7. Necesidades (sección 8)
    if (en('necesidad') && informe.hayNecesidad === true) {
      (informe.necesidades || []).forEach((nec, i) => {
        const numero = i + 1;
        const faltan = [];
        if (!nec.elemento) faltan.push('el elemento');
        else if (nec.elemento === 'otro' && !texto(nec.otroNombre)) faltan.push('cuál es el elemento');
        if (!(n(nec.cantidad) > 0)) faltan.push('la cantidad');
        if (texto(nec.paraQue).length < P.largo_minimo_para_que) faltan.push('para qué se requiere (una frase completa)');
        if (faltan.length) { hallazgo(regla('NECESIDAD_INCOMPLETA'), { faltantes: lista(faltan), indice: i, numero }, { sufijo: String(i) }); return; }
        const el = elemento(nec.elemento);
        if (el && el.base && el.factor) {
          const baseValor = t[el.base] || 0;
          const tope = Math.ceil(baseValor * el.factor);
          if (n(nec.cantidad) > tope) {
            hallazgo(regla('TOPE_ELEMENTO'), { cantidad: n(nec.cantidad), unidad: el.unidad, elemento: el.nombre, criterio: el.criterio.toLowerCase(), base_valor: baseValor, base_nombre: D.bases[el.base].nombre, tope, indice: i, numero }, { nivel: el.nivel_tope, sufijo: el.id + ':' + i, caso: el.caso_parecido });
          }
        }
        if (el && el.regla_72h) {
          const horas = horasDesdeInicio(informe);
          if (horas !== null && horas >= 0 && horas < P.horas_minimas_kit_alimentacion) hallazgo(regla('ALIMENTACION_72H'), { elemento: el.nombre, horas: Math.floor(horas), indice: i, numero }, { sufijo: el.id + ':' + i });
        }
      });
    }

    H.sort((a, b) => (a.nivel === 'bloqueo' ? 0 : 1) - (b.nivel === 'bloqueo' ? 0 : 1));
    return H;
  }

  return { cargar, totales, evaluar, sugerencia, elemento, categoria, organismo, plantilla, horasDesdeInicio, fmtFecha, lista, fuentesTexto, comunasTexto, coordenadas, lugarTexto, textosSecciones, diferencias, cambiosTexto, CATEGORIAS };
})();

if (typeof module !== 'undefined') module.exports = Reglas;
