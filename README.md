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
| `js/almacen.js` | Guardado local en el teléfono (borrador, correlativo EJ, historial, credencial cifrada) |
| `js/credencial.js` | Credenciales: sello ECDSA P-256 de la Dirección Regional, comprobación sin conexión, cifrado con PIN y, desde la versión 2 de la credencial, firma digital del funcionario sobre la huella de cada informe. Lo comparten la app, la herramienta emisora, el verificador y las pruebas |
| `js/datos_alfa.js` | Archivo de datos del informe (`.alfa.json`): huella SHA-256 del contenido, texto del código QR, tablas con la forma del modelo de la etapa 3 y la comprobación que usa el verificador |
| `verificar.html` | Verificador para la URAT (modo URAT): carga el archivo de datos, el PDF y el código QR de un informe recibido y comprueba integridad, credencial del firmante, firma digital y correspondencia entre los tres. Corre en el navegador, con doble clic o desde el sitio |
| `herramientas/emisor-credenciales.html` | Herramienta de la Dirección Regional para generar la clave y emitir credenciales. Corre completa en el navegador, sin servidor: se abre con doble clic como archivo local o desde la dirección publicada. Ver `COMO_EMITIR_CREDENCIALES.md` en la carpeta del proyecto |
| `herramientas/sincronizar_config.py` | Genera `datos/config.js` a partir de `datos/config.json`. Ejecutar cada vez que cambie la configuración |
| `datos/credencial_ejercicio_demo.alfacred.json` | Credencial genérica de ejercicio (versión 2), con identidad e imágenes ficticias y una clave de firma que es pública por estar en este repositorio: sirve para probar, no acredita a nadie. Sellada con la clave de la Dirección Regional |
| `sw.js` | Service worker: precarga todos los archivos para funcionar sin conexión |
| `manifest.json` | Datos de instalación (nombre, íconos, colores) |
| `datos/reglas.json` | Catálogo de elementos del IT-LOG-01, condiciones de vivienda, categorías de personas, organismos de respuesta, tipos de evento, reglas y casos de solución. Versión provisoria |
| `datos/config.json` | Configuración: destinatario de prueba, región y comunas, niveles de quien elabora, clave pública de la Dirección Regional para comprobar credenciales |
| `datos/config.js` | La misma configuración en forma de script, generada por `herramientas/sincronizar_config.py`. La herramienta emisora la usa cuando se abre con doble clic, porque en ese modo el navegador no deja leer archivos JSON. No editar a mano |
| `datos/plantilla_alfa.json` | Geometría del formato oficial (líneas, rótulos y posición de cada casilla), extraída del PDF de la REX 78 |
| `lib/pdf-lib.min.js` | Biblioteca pdf-lib 1.17.1 (licencia MIT), guardada localmente para funcionar sin internet |
| `lib/fontkit.umd.min.js` | @pdf-lib/fontkit 1.1.1 (MIT), necesario para incrustar fuentes propias |
| `lib/qrcode.min.js` | qrcode-generator 1.4.4 de Kazuhiko Arase (MIT, `lib/LICENSE-qrcode-generator.txt`); dibuja el código QR de verificación en el PDF y en la pantalla final |
| `lib/Carlito-Regular.ttf`, `lib/Carlito-Bold.ttf` | Tipografía Carlito (SIL OFL 1.1, métrica compatible con Calibri), recortada al alfabeto latino con fontTools y renombrada internamente "CarlitoAlfa" como exige la licencia para versiones modificadas. Se incrusta completa porque el recorte en tiempo de ejecución de pdf-lib dejaba glifos sin dibujar |
| `img/logo_senapred.png` | Logo institucional, autorizado por el responsable para el formato |
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
| demo-0.3.1 | 2026-10-06 | Prueba en iPhone: el texto compartido lleva primero el asunto (el correo de iPhone toma la primera línea como asunto); línea "Seleccionado: …" en la pantalla del tipo de evento y tipo de evento en la pantalla final; el nivel regional pasa a ser la Delegación Presidencial Regional |
| demo-0.4.0 | 2026-10-06 | Sprint 3, entrega 1: tipografía Carlito (métrica de Calibri) y logo SENAPRED en el PDF; credenciales selladas por la Dirección Regional (ECDSA P-256) con carga en la app, PIN (PBKDF2 + AES-GCM) y firma y timbre reales desde la credencial; herramienta emisora en `herramientas/`; credencial genérica de ejercicio |
| demo-0.4.1 | 2026-10-07 | Herramienta emisora: funciona abierta con doble clic como archivo local, tomando la configuración de `datos/config.js` cuando el navegador bloquea `config.json` (E-20); el botón para generar una clave nueva queda bajo un desplegable con advertencia explícita y emitir con una clave distinta de la publicada pide confirmación; las imágenes de firma y timbre se reducen a unos 300 KB como máximo (E-21). Sin cambios en la app del teléfono |
| demo-0.5.0 | 2026-10-07 | Sprint 3, entrega 2: cada informe se comparte con su archivo de datos `.alfa.json` (contenido, huella, firma digital, credencial pública y tablas de la etapa 3); credencial versión 2 con clave de firma del funcionario, con la que el teléfono firma la huella de cada informe; código QR de verificación en el PDF y en la pantalla final, huella en los metadatos del PDF; verificador `verificar.html` para la URAT; las ampliaciones muestran los cambios en la revisión, subrayan en el PDF las casillas que cambiaron y los listan en Observaciones; importación de informes de otro teléfono desde su archivo de datos |

## Probar en el computador

Desde esta carpeta, con Python instalado:

```
py -m http.server 8080
```

y abrir `http://localhost:8080/` en Chrome o Edge.

## Publicar una versión nueva

1. Cambiar `VERSION` en `sw.js` (por ejemplo `alfa-demo-v0.5.0`) y `version_app` en `datos/config.json`; luego ejecutar `py herramientas/sincronizar_config.py` para regenerar `datos/config.js`.
2. Subir los cambios al repositorio. GitHub Pages publica la carpeta tal cual.
3. En el teléfono, cerrar y volver a abrir la app: avisa cuando hay una versión nueva.

La documentación del proyecto (arquitectura, bitácora y antecedentes normativos) vive fuera de esta
carpeta y no se publica.
