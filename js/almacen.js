/* Almacén local de la demo: borradores, correlativo de ejercicio e historial.
   Todo se guarda en el propio teléfono (localStorage). No hay servidor. */
const Almacen = (() => {
  'use strict';
  const K = {
    borrador: 'alfaDemo.borrador',
    correlativo: 'alfaDemo.correlativoEJ',      // versiones anteriores a la 0.5.5: un solo contador
    correlativos: 'alfaDemo.correlativos',     // desde la 0.5.5: un contador por año
    historial: 'alfaDemo.historial',
    credencial: 'alfaDemo.credencial'
  };

  function leer(clave, porDefecto) {
    try {
      const v = localStorage.getItem(clave);
      return v == null ? porDefecto : JSON.parse(v);
    } catch (e) {
      return porDefecto;
    }
  }

  function escribir(clave, valor) {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
      return true;
    } catch (e) {
      console.warn('No se pudo guardar en el teléfono', e);
      return false;
    }
  }

  const anioHoy = () => new Date().getFullYear();
  function contadores() {
    const mapa = leer(K.correlativos, null);
    if (mapa && typeof mapa === 'object') return mapa;
    const antiguo = leer(K.correlativo, 0) | 0;   // el contador único de las versiones anteriores vale para el año en curso
    const nuevo = {};
    if (antiguo > 0) nuevo[String(anioHoy())] = antiguo;
    return nuevo;
  }
  function contador(anio) { return contadores()[String(anio || anioHoy())] | 0; }

  return {
    disponible() {
      try {
        localStorage.setItem('alfaDemo.prueba', '1');
        localStorage.removeItem('alfaDemo.prueba');
        return true;
      } catch (e) {
        return false;
      }
    },
    guardarBorrador(informe) { return escribir(K.borrador, informe); },
    leerBorrador() { return leer(K.borrador, null); },
    borrarBorrador() { try { localStorage.removeItem(K.borrador); } catch (e) { /* sin efecto */ } },

    // El número se asigna recién al firmar, para que un borrador abandonado no consuma correlativo.
    // El funcionario puede corregir el número propuesto; el contador salta al mayor usado (D-52).
    // Hay un contador por año, porque el correlativo se reinicia cada año (D-53).
    numeroPrevisto(prefijo, anio) { return `${prefijo}-${contador(anio) + 1}`; },
    ajustarCorrelativo(n, anio) {
      const mapa = contadores();
      const clave = String(anio || anioHoy());
      const actual = mapa[clave] | 0;
      if (Number.isInteger(n) && n > actual) { mapa[clave] = n; escribir(K.correlativos, mapa); }
      return Math.max(actual, n | 0);
    },

    guardarHistorial(informe) {
      const h = leer(K.historial, []);
      h.unshift(informe);
      return escribir(K.historial, h.slice(0, 20));
    },
    leerHistorial() { return leer(K.historial, []); },
    escribirHistorial(lista) { return escribir(K.historial, (lista || []).slice(0, 20)); },

    // Credencial del funcionario: un resumen legible y el archivo completo cifrado con su PIN
    guardarCredencial(registro) { return escribir(K.credencial, registro); },
    leerCredencial() { return leer(K.credencial, null); },
    borrarCredencial() { try { localStorage.removeItem(K.credencial); } catch (e) { /* sin efecto */ } },
    borrarTodo() {
      Object.values(K).forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* sin efecto */ } });
    }
  };
})();
