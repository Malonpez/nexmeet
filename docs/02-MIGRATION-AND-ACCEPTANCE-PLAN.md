# Plan de migración y aceptación

## Objetivo inmediato
Mover el trabajo de parches manuales a una rama controlada de GitHub/Codex para convertirlo en producto mantenible.

## Rama activa

```text
codex/broker52-platform-integration
```

## No tocar todavía

```text
main
Broker 52 productivo
credenciales reales
secrets
```

## Fase 0 — Seguridad

### Acciones obligatorias
- Revocar cualquier LiveKit API key expuesta en capturas, WhatsApp o chats.
- Crear API key nueva.
- Guardar secrets solo en `.env.local`, variables del servidor o GitHub Secrets.
- Agregar `.gitignore` para bloquear archivos sensibles.
- Agregar `.env.example` sin valores reales.

### Patrones a buscar

```text
LIVEKIT_API_SECRET
WHATSAPP_ACCESS_TOKEN
CLOUDFLARE_TUNNEL_TOKEN
API_SECRET
Bearer
xxxxx.livekit.cloud
trycloudflare.com
localhost:8787
```

## Fase 1 — NexMeet estable

### Tareas
- Separar frontend y backend.
- Centralizar configuración pública.
- Asegurar que `PUBLIC_BASE_URL` controle links de invitado.
- Corregir cámara/micro con estado real LiveKit.
- Corregir contador/roster.
- Corregir chat entre participantes.
- Corregir archivos compartidos.
- Corregir salida limpia.

### Prueba mínima manual

```text
Host: PC
Invitado 1: celular
Invitado 2: segundo navegador/dispositivo
URL: pública, no localhost
```

Debe pasar:

```text
1. Host crea sala desde URL pública.
2. Invitado 1 entra por link.
3. Invitado 2 entra por link.
4. Contador muestra 3.
5. Los tres ven tarjetas correctas.
6. Los tres pueden activar/desactivar cámara.
7. Los tres pueden activar/desactivar micro.
8. Chat se ve en todos.
9. Archivo compartido aparece en todos.
10. Salir deja pantalla inicial limpia.
```

## Fase 2 — Codex refactor

### Cambios esperados
- Convertir parches inyectados en módulos fuente.
- Crear estructura ordenada.
- Agregar tests.
- Remover duplicados.
- Remover lógica hardcoded.
- Documentar endpoints.

### Output esperado

```text
apps/nexmeet
services/api
packages/shared
docs/audit
docs/runbooks
.env.example
.gitignore
```

## Fase 3 — Broker 52 baseline

Broker 52 debe entrar como baseline separado. No mezclar lógica hipotecaria con NexMeet.

### Integración mínima

```text
Botón: Iniciar reunión
Input: caseId, clientName, adviserUserId
Output: meetingId, roomId, publicUrl, status
Persistencia: reunión asociada al caso
```

### No romper

```text
cálculos existentes
preliminar
cotización
documentos
login
estado local actual
```

## Fase 4 — WhatsApp oficial

No usar WhatsApp Web como producto.

### Integración mínima

```text
POST /api/meetings/:id/invite
service whatsapp sends message
webhook receives delivery status
communication record saved
```

## Fase 5 — Dominio estable

Usar dominio nuevo Broker 52:

```text
app.broker52.com
meet.broker52.com
api.broker52.com
```

### Bloqueo actual
Mientras se use `trycloudflare.com`, puede aparecer Error 1033 si el túnel muere. Esto no debe considerarse fallo de NexMeet; es limitación de túnel temporal.

## Definición de listo para integración
NexMeet se considera listo para integrar a Broker 52 solo cuando:

```text
- Pasa prueba host + 2 invitados externos.
- No genera links localhost para invitados.
- Cámara/micro funcionan en PC y celular.
- Chat funciona entre todos.
- Archivos funcionan entre todos.
- Salida limpia funciona.
- Secrets no están en repo.
```

## Definición de listo para producción

```text
- Dominio estable activo.
- HTTPS activo.
- Variables reales fuera del repo.
- Build/test pasan.
- Logs útiles.
- Rollback documentado.
- WhatsApp usa API oficial.
- Broker 52 mantiene cálculos verificados.
```