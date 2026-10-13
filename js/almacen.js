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

  // ---------- fotos del anexo: IndexedDB, porque pesan más de lo que admite localStorage (D-56) ----------
  // Cada foto se guarda por su id como dataURL JPEG; si el navegador no ofrece IndexedDB, las fotos viven solo en memoria.
  const NOMBRE_DB = 'alfaDemo', ALMACEN_FOTOS = 'fotos';
  function abrirDb() {
    return new Promise((res, rej) => {
      if (!('indexedDB' in globalThis)) { rej(new Error('sin IndexedDB')); return; }
      const pet = indexedDB.open(NOMBRE_DB, 1);
      pet.onupgradeneeded = () => { const db = pet.result; if (!db.objectStoreNames.contains(ALMACEN_FOTOS)) db.createObjectStore(ALMACEN_FOTOS, { keyPath: 'id' }); };
      pet.onsuccess = () => res(pet.result);
      pet.onerror = () => rej(pet.error || new Error('no se pudo abrir el almacén de fotos'));
    });
  }
  function conFotos(modo, fn) {
    return abrirDb().then(db => new Promise((res, rej) => {
      const t = db.transaction(ALMACEN_FOTOS, modo);
      let salida;
      try { salida = fn(t.objectStore(ALMACEN_FOTOS)); } catch (e) { db.close(); rej(e); return; }
      t.oncomplete = () => { db.close(); res(salida && typeof salida === 'object' && 'result' in salida ? salida.result : salida); };
      t.onerror = () => { db.close(); rej(t.error); };
      t.onabort = () => { db.close(); rej(t.error || new Error('transacción cancelada')); };
    }));
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
    // Fotos: devuelven promesas; ante un fallo del almacén resuelven sin romper el flujo
    guardarFoto(id, dataUrl) { return conFotos('readwrite', st => st.put({ id, dataUrl, guardada: new Date().toISOString() })).then(() => true).catch(() => false); },
    leerFotos(ids) {
      return conFotos('readonly', st => st.getAll()).then(lista => {
        const m = {}; (lista || []).forEach(f => { if (ids.includes(f.id)) m[f.id] = f.dataUrl; }); return m;
      }).catch(() => ({}));
    },
    borrarFotos(ids) { return conFotos('readwrite', st => { ids.forEach(id => st.delete(id)); return true; }).catch(() => false); },
    // Borra las fotos que ningún informe (borrador, historial o el informe en curso) referencia
    limpiarFotos(idsEnUso) {
      return conFotos('readonly', st => st.getAllKeys()).then(claves => {
        const sobran = (claves || []).filter(k => !idsEnUso.has(k));
        return sobran.length ? conFotos('readwrite', st => { sobran.forEach(k => st.delete(k)); return sobran.length; }) : 0;
      }).catch(() => 0);
    },
    borrarTodo() {
      Object.values(K).forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* sin efecto */ } });
      conFotos('readwrite', st => st.clear()).catch(() => false);
    }
  };
})();
