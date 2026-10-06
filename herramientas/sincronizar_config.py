# Genera datos/config.js a partir de datos/config.json.
# La herramienta emisora lee config.js cuando se abre con doble clic (como archivo), porque en ese
# modo el navegador no permite leer config.json. Ejecutar después de cambiar config.json:
#     py herramientas/sincronizar_config.py
import json, os
base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
origen = os.path.join(base, "datos", "config.json")
destino = os.path.join(base, "datos", "config.js")
with open(origen, encoding="utf-8") as f:
    cfg = json.load(f)
with open(destino, "w", encoding="utf-8") as f:
    f.write("// Archivo generado desde config.json por herramientas/sincronizar_config.py. No editar a mano.\n")
    f.write("window.ALFA_CONFIG = " + json.dumps(cfg, ensure_ascii=False, indent=2) + ";\n")
print("config.js generado desde config.json (version_app", cfg.get("version_app"), ")")
