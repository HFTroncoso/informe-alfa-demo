# App Informe Alfa – demo del Sprint 1 (modo ejercicio)

Demostración técnica de la Dirección Regional de SENAPRED Magallanes: una app web instalable (PWA)
que guía el llenado del Informe Alfa con preguntas simples, bloquea los errores de cuadratura y
genera el PDF con la disposición oficial en el propio teléfono, sin señal.

**Todo lo que produce esta demo es de ejercicio y no tiene valor oficial.** El PDF lleva la marca
de agua "EJERCICIO – SIN VALOR", un número con prefijo EJ y una firma y un timbre ficticios.
No contiene datos reales de personas ni de emergencias.

## Qué hay en esta carpeta

| Archivo o carpeta | Qué es |
| --- | --- |
| `index.html` | La única página de la app; las pantallas se muestran y ocultan con JavaScript |
| `css/estilos.css` | Estilos pensados para teléfono |
| `js/app.js` | Flujo de pantallas, borradores, firma, compartir y descargar |
| `js/reglas.js` | Motor de reglas: totales, sugerencias de cantidad y bloqueos |
| `js/pdf.js` | Generador del PDF sobre la disposición oficial, con pdf-lib |
| `js/almacen.js` | Guardado local en el teléfono (borrador, correlativo EJ, historial) |
| `sw.js` | Service worker: precarga todos los archivos para funcionar sin conexión |
| `manifest.json` | Datos de instalación (nombre, íconos, colores) |
| `datos/reglas.json` | Catálogo de elementos del IT-LOG-01, condiciones de vivienda, tipos de evento, reglas y casos de solución. Versión provisoria |
| `datos/config.json` | Configuración: destinatario, región y comunas, responsable de ejercicio |
| `datos/plantilla_alfa.json` | Geometría del formato oficial (líneas, rótulos y posición de cada casilla), extraída del PDF de la REX 78 |
| `lib/pdf-lib.min.js` | Biblioteca pdf-lib 1.17.1 (licencia MIT), guardada localmente para funcionar sin internet |
| `img/` | Firma y timbre ficticios e íconos de la app, generados para la demo |

Sin paso de compilación y sin `node_modules`: se publica tal cual en cualquier sitio estático con HTTPS.

## Probar en el computador

Desde esta carpeta, con Python instalado:

```
py -m http.server 8080
```

y abrir `http://localhost:8080/` en Chrome o Edge.

## Publicar una versión nueva

1. Cambiar `VERSION` en `sw.js` (por ejemplo `alfa-demo-v0.1.1`) y `version_app` en `datos/config.json`.
2. Subir los cambios al repositorio. GitHub Pages publica la carpeta tal cual.
3. En el teléfono, cerrar y volver a abrir la app: avisa cuando hay una versión nueva.

La documentación del proyecto (arquitectura, bitácora y antecedentes normativos) vive fuera de esta
carpeta y no se publica.
