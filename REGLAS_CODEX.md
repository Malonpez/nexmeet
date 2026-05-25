REGLAS PARA CODEX
No romper lo funcional

Cualquier codigo que ya funcione debe conservarse. Si Codex necesita modificarlo, debe justificar el cambio y validar que la funcionalidad siga intacta.

No tocar secretos

No crear, imprimir, copiar ni subir claves reales, tokens, contrasenas, archivos .env reales, credenciales OAuth, certificados privados ni llaves SSH.

Trabajar en ramas

No trabajar directamente sobre main o master. Usar ramas tipo:

codex/auditoria-inicial
codex/fix-build
codex/tests
codex/refactor-seguro
Validar antes de fusionar

Antes de proponer merge, intentar ejecutar instalacion, build, tests y ejecucion local minima, si aplica.

Cambios pequenos

Priorizar cambios pequenos, reversibles y verificables.
