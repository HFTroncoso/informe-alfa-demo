/* Almacén local de la demo: borradores, correlativo de ejercicio e historial.
   Todo se guarda en el propio teléfono (localStorage). No hay servidor. */
const Almacen = (() => {
  'use strict';
  const K = {
    borrador: 'alfaDemo.borrador',
    correlativo: 'alfaDemo.correlativoEJ',
    historial: 'alfaDemo.historial'
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
    numeroPrevisto(prefijo) { return `${prefijo}-${(leer(K.correlativo, 0) | 0) + 1}`; },
    asignarNumero(prefijo) {
      const n = (leer(K.correlativo, 0) | 0) + 1;
      escribir(K.correlativo, n);
      return `${prefijo}-${n}`;
    },

    guardarHistorial(informe) {
      const h = leer(K.historial, []);
      h.unshift(informe);
      return escribir(K.historial, h.slice(0, 20));
    },
    leerHistorial() { return leer(K.historial, []); },
    borrarTodo() {
      Object.values(K).forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* sin efecto */ } });
    }
  };
})();
