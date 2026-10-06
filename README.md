# App Informe Alfa – demo del Sprint 1 (modo ejercicio)

> **Para usar la app en un teléfono abre este enlace, no esta página:**
> **https://hftroncoso.github.io/informe-alfa-demo/**
> No hace falta cuenta de GitHub ni descargar nada. En Android, Chrome ofrece "Instalar la app";
> en iPhone, abrir el enlace en Safari y usar Compartir → "Agregar a pantalla de inicio".
> Esta página es el código fuente de la app, no la app.

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
| `js/pdf.js` | Generador del PDF: la parte superior se dibuja desde la plantilla y las secciones 6 a 10 con altura variable, con pdf-lib |
| `js/almacen.js` | Guardado local en el teléfono (borrador, correlativo EJ, historial) |
| `sw.js` | Service worker: precarga todos los archivos para funcionar sin conexión |
| `manifest.json` | Datos de instalación (nombre, íconos, colores) |
| `datos/reglas.json` | Catálogo de elementos del IT-LOG-01, condiciones de vivienda, categorías de personas, organismos de respuesta, tipos de evento, reglas y casos de solución. Versión provisoria |
| `datos/config.json` | Configuración: destinatario de prueba, región y comunas, niveles de quien elabora, responsable de ejercicio |
| `datos/plantilla_alfa.json` | Geometría del formato oficial (líneas, rótulos y posición de cada casilla), extraída del PDF de la REX 78 |
| `lib/pdf-lib.min.js` | Biblioteca pdf-lib 1.17.1 (licencia MIT), guardada localmente para funcionar sin internet |
| `img/` | Firma y timbre ficticios e íconos de la app, generados para la demo |

Sin paso de compilación y sin `node_modules`: se publica tal cual en cualquier sitio estático con HTTPS.

## Versiones

| Versión | Fecha | Qué cambió |
| --- | --- | --- |
| demo-0.1 | 2026-10-05 | Primera demo: 5 pasos, una necesidad, compartir con el menú del sistema |
| demo-0.2 | 2026-10-05 | Fuentes múltiples; pantalla "Otras personas afectadas" con las 9 categorías que no nacen de las viviendas y dos reglas nuevas; varias necesidades; botón "Enviar por correo" (abre el correo con destinatario y asunto; el PDF se adjunta desde Descargas); ampliaciones EJ-N-A desde el historial |
| demo-0.2.1 | 2026-10-05 | Seguridad: el destinatario pasa a un correo de prueba del responsable; la dirección real de la URAT no se publica en el repositorio público (R-16) |
| demo-0.2.2 | 2026-10-05 | Corrección del service worker: la precarga pide cada archivo con la versión en la dirección y sin usar el caché HTTP, para no guardar copias antiguas al actualizar |
| demo-0.2.3 | 2026-10-06 | "Compartir el PDF por correo" pasa a ser el botón principal: copia la dirección de destino y adjunta el PDF; el camino por enlace de correo queda como alternativa "sin adjunto" (prueba en teléfono, D-33) |
| demo-0.3.0 | 2026-10-06 | Quién elabora (comunal, provincial, regional) con varias comunas; lugar de la emergencia con coordenadas escritas o del GPS, impreso en Observaciones; pantallas de Decisiones (sección 6) y Recursos involucrados (sección 7) con catálogo de organismos; PDF de altura variable para las secciones 6 a 10 |

## Probar en el computador

Desde esta carpeta, con Python instalado:

```
py -m http.server 8080
```

y abrir `http://localhost:8080/` en Chrome o Edge.

## Publicar una versión nueva

1. Cambiar `VERSION` en `sw.js` (por ejemplo `alfa-demo-v0.2.3`) y `version_app` en `datos/config.json`.
2. Subir los cambios al repositorio. GitHub Pages publica la carpeta tal cual.
3. En el teléfono, cerrar y volver a abrir la app: avisa cuando hay una versión nueva.

La documentación del proyecto (arquitectura, bitácora y antecedentes normativos) vive fuera de esta
carpeta y no se publica.
