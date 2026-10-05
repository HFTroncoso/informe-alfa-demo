/* Motor de reglas de la demo. La lógica de cada regla vive aquí, identificada por su id;
   los textos, niveles, fuentes, casos de solución y los catálogos viven en datos/reglas.json. */
const Reglas = (() => {
  'use strict';
  let D = null;

  // Categorías de la sección 4 del formato que no se suman a "personas únicas":
  // las albergadas ya están contadas como damnificadas, evacuadas o aisladas.
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
  function regla(id) { return D.reglas.find(r => r.id === id); }
  function fuentesTexto(informe) {
    const id = informe.identificacion || {};
    const partes = [].concat(id.fuentes || []);
    if (id.fuenteOtra && id.fuenteOtra.trim()) partes.push(id.fuenteOtra.trim());
    if (!partes.length && id.fuente) partes.push(id.fuente); // informes antiguos
    return partes.join(', ');
  }

  // ---------- totales ----------
  function totales(informe) {
    const t = { viviendas: {}, viviendas_danadas: 0, viviendas_no_habitables: 0, albergadas_viviendas: 0, albergadas_otras: 0, personas: 0, personas_hombres: 0, personas_mujeres: 0, personas_nna: 0 };
    CATEGORIAS.forEach(k => { t[k] = fila(); });

    // Viviendas y sus ocupantes
    for (const c of D.condiciones_vivienda) {
      const v = (informe.viviendas || {})[c.id] || {};
      const viv = n(v.viviendas);
      t.viviendas[c.id] = viv;
      t.viviendas_danadas += viv;
      sumar(t[c.ocupantes_cuentan_como], v);
      if (c.ocupantes_cuentan_como === 'damnificadas') t.viviendas_no_habitables += viv;
      if (c.pregunta_albergue && v.hayAlbergue) { sumar(t.albergadas, v.albergue); t.albergadas_viviendas += ocupantes(v.albergue); }
    }
    // Otras personas afectadas
    for (const c of (D.categorias_personas || [])) {
      const o = (informe.otras || {})[c.id];
      if (o && o.hay) {
        sumar(t[c.id], o);
        if (c.id === 'albergadas') t.albergadas_otras += ocupantes(o);
      }
    }
    // Personas únicas (aproximación): todas las categorías salvo las que ya están contadas en otra.
    for (const k of CATEGORIAS) {
      if (NO_SUMAN_A_UNICAS.includes(k)) continue;
      t.personas += t[k].total;
      t.personas_hombres += t[k].adH + t[k].nnaH;
      t.personas_mujeres += t[k].adM + t[k].nnaM;
      t.personas_nna += t[k].nnaH + t[k].nnaM;
    }
    return t;
  }

  // ---------- sugerencia de cantidad ----------
  function sugerencia(elementoId, informe) {
    const el = elemento(elementoId);
    if (!el || !el.base || !el.factor) return null;
    const t = totales(informe);
    const baseValor = t[el.base] || 0;
    const tope = Math.ceil(baseValor * el.factor);
    return {
      tope,
      baseValor,
      baseNombre: D.bases[el.base].nombre,
      criterio: el.criterio,
      nivel: el.nivel_tope,
      texto: `${el.criterio}. En el informe hay ${baseValor} ${D.bases[el.base].nombre}: cuadran hasta ${tope} ${el.unidad}.`
    };
  }

  // ---------- evaluación ----------
  // opciones: { pantalla: 'donde'|'evento'|'viviendas'|'personas'|'necesidad' } o { todas: true }
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
      if (nivel === 'justificacion' && just[clave] && String(just[clave]).trim().length > 0) return; // ya justificado
      const opcionesResolver = (nivel === 'justificacion' && r.como_resolver_justificacion) ? r.como_resolver_justificacion : r.como_resolver;
      H.push({
        id: r.id,
        clave,
        nivel,
        titulo: plantilla(r.titulo, datos),
        fuente: r.fuente,
        que_no_cuadra: plantilla(r.que_no_cuadra, datos),
        por_que: plantilla(r.por_que, datos),
        como_resolver: (opcionesResolver || []).map(o => ({
          texto: plantilla(o.texto, datos),
          pantalla: o.pantalla ? plantilla(o.pantalla, datos) : null,
          accion: o.accion || null
        })),
        caso_parecido: extra.caso || r.caso_parecido,
        pantalla: r.pantalla || datos.pantalla_faltante || null,
        datos
      });
    }

    // 1. Campos obligatorios (comuna, fecha, hora, tipo de evento)
    if (en('donde') || en('evento')) {
      const faltan = []; let pf = null;
      if (en('donde')) {
        if (!informe.identificacion.comuna) { faltan.push('la comuna'); pf = pf || 'donde'; }
        if (!informe.ocurrencia.fecha) { faltan.push('la fecha de inicio'); pf = pf || 'donde'; }
        if (!informe.ocurrencia.hora) { faltan.push('la hora de inicio'); pf = pf || 'donde'; }
      }
      if (en('evento')) {
        if (!informe.evento.tipo) { faltan.push('el tipo de evento'); pf = pf || 'evento'; }
        else if (informe.evento.tipo === 'OTRO' && !(informe.evento.otro || '').trim()) { faltan.push('cuál es el otro tipo de evento'); pf = pf || 'evento'; }
      }
      if (faltan.length) hallazgo(regla('CAMPOS_OBLIGATORIOS'), { faltantes: lista(faltan), pantalla_faltante: pf });
    }

    // 2. Fecha futura
    if (en('donde')) {
      const inicio = fechaHoraInicio(informe);
      if (inicio && inicio.getTime() > Date.now() + 60 * 1000) {
        hallazgo(regla('FECHA_FUTURA'), { fecha: fmtFecha(informe.ocurrencia.fecha), hora: informe.ocurrencia.hora });
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
        if (c.requiere_denuncia && o && o.hay && ocupantes(o) > 0 && !o.denuncia) {
          hallazgo(regla('DESAPARECIDAS_SIN_DENUNCIA'), { desaparecidas: ocupantes(o) }, { sufijo: c.id });
        }
      }
      const suma = t.damnificadas.total + t.evacuadas.total + t.aisladas.total;
      if (t.albergadas.total > suma) {
        hallazgo(regla('ALBERGUE_TOTAL'), { albergadas: t.albergadas.total, suma, damnificadas: t.damnificadas.total, evacuadas: t.evacuadas.total, aisladas: t.aisladas.total });
      }
    }

    // 5. Necesidades
    if (en('necesidad') && informe.hayNecesidad === true) {
      (informe.necesidades || []).forEach((nec, i) => {
        const numero = i + 1;
        const faltan = [];
        if (!nec.elemento) faltan.push('el elemento');
        else if (nec.elemento === 'otro' && !(nec.otroNombre || '').trim()) faltan.push('cuál es el elemento');
        if (!(n(nec.cantidad) > 0)) faltan.push('la cantidad');
        if (!nec.paraQue || nec.paraQue.trim().length < P.largo_minimo_para_que) faltan.push('para qué se requiere (una frase completa)');
        if (faltan.length) { hallazgo(regla('NECESIDAD_INCOMPLETA'), { faltantes: lista(faltan), indice: i, numero }, { sufijo: String(i) }); return; }

        const el = elemento(nec.elemento);
        if (el && el.base && el.factor) {
          const baseValor = t[el.base] || 0;
          const tope = Math.ceil(baseValor * el.factor);
          if (n(nec.cantidad) > tope) {
            hallazgo(regla('TOPE_ELEMENTO'), {
              cantidad: n(nec.cantidad), unidad: el.unidad, elemento: el.nombre, criterio: el.criterio.toLowerCase(),
              base_valor: baseValor, base_nombre: D.bases[el.base].nombre, tope, indice: i, numero
            }, { nivel: el.nivel_tope, sufijo: el.id + ':' + i, caso: el.caso_parecido });
          }
        }
        if (el && el.regla_72h) {
          const horas = horasDesdeInicio(informe);
          if (horas !== null && horas >= 0 && horas < P.horas_minimas_kit_alimentacion) {
            hallazgo(regla('ALIMENTACION_72H'), { elemento: el.nombre, horas: Math.floor(horas), indice: i, numero }, { sufijo: el.id + ':' + i });
          }
        }
      });
    }

    // Primero los bloqueos, después los que admiten justificación.
    H.sort((a, b) => (a.nivel === 'bloqueo' ? 0 : 1) - (b.nivel === 'bloqueo' ? 0 : 1));
    return H;
  }

  return { cargar, totales, evaluar, sugerencia, elemento, categoria, plantilla, horasDesdeInicio, fmtFecha, lista, fuentesTexto, CATEGORIAS };
})();

if (typeof module !== 'undefined') module.exports = Reglas;
