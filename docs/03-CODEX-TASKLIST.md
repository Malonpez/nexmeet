# Tasklist de ejecución para Codex

## Sprint 0 — Congelar estado y proteger secretos

- [ ] Confirmar rama: `codex/broker52-platform-integration`.
- [ ] Confirmar que `.gitignore` bloquea `.env`, `.env.local`, logs, zips y credenciales.
- [ ] Buscar patrones de secrets en repo.
- [ ] Remover cualquier secret si aparece.
- [ ] Crear `docs/audit/secrets-scan.md`.

## Sprint 1 — Auditoría NexMeet actual

- [ ] Mapear archivos actuales.
- [ ] Identificar entrypoints frontend/backend.
- [ ] Identificar endpoints reales.
- [ ] Detectar duplicados: `index.html`, `index.html.html`, `nexmeet.js`.
- [ ] Detectar hardcoded URLs.
- [ ] Detectar variables reales requeridas.
- [ ] Crear `docs/audit/nexmeet-current-state.md`.

## Sprint 2 — Estructura fuente mantenible

- [ ] Crear `apps/nexmeet`.
- [ ] Mover frontend NexMeet a estructura clara.
- [ ] Mover backend token/server a estructura clara.
- [ ] Crear `services/api` si aplica.
- [ ] Crear `packages/shared` si aplica.
- [ ] Mantener compatibilidad temporal con `NexMeet.html`.

## Sprint 3 — Links públicos

- [ ] Crear helper único `getPublicBaseUrl`.
- [ ] Eliminar generación de links con `localhost` cuando existe `PUBLIC_BASE_URL` público.
- [ ] Validar que links de invitado empiecen por URL pública.
- [ ] Agregar test unitario o E2E.

## Sprint 4 — Cámara/micro

- [ ] Reemplazar lógica visual obsoleta por estado real LiveKit.
- [ ] Corregir `setCameraEnabled` / fallback `getUserMedia + publishTrack`.
- [ ] Corregir `setMicrophoneEnabled`.
- [ ] Adjuntar video local y remoto correctamente.
- [ ] Actualizar UI según publicación real.

## Sprint 5 — Roster/admisión/contador

- [ ] Evitar duplicados por reconexión.
- [ ] Roster consistente host/invitados.
- [ ] Contador consistente en PC y celular.
- [ ] Admisión sin múltiples solicitudes duplicadas.

## Sprint 6 — Chat

- [ ] Validar data channel LiveKit.
- [ ] Replicar mensajes entre todos.
- [ ] Corregir historial local por sala.
- [ ] Indicador de mensaje no leído.

## Sprint 7 — Archivos

- [ ] Subida desde host/invitado.
- [ ] Lista sincronizada para todos.
- [ ] Descarga/preview sin error `children undefined`.
- [ ] Límite de tamaño claro.

## Sprint 8 — Notas y cierre limpio

- [ ] Notas asociadas a sala.
- [ ] Exportación o persistencia mínima.
- [ ] Botón salir limpia tracks, room, UI y vuelve a pantalla inicial.
- [ ] Botón terminar sala cierra para todos si el host lo ordena.

## Sprint 9 — Integración Broker 52

- [ ] Definir contrato `Meeting`.
- [ ] Crear botón desde caso.
- [ ] Guardar `meetingId`, `roomId`, `publicUrl`, `status`.
- [ ] Asociar notas/archivos al caso.
- [ ] No tocar lógica financiera.

## Sprint 10 — WhatsApp

- [ ] Crear servicio WhatsApp oficial.
- [ ] Enviar invitación desde reunión.
- [ ] Implementar webhook.
- [ ] Registrar estado de entrega.
- [ ] No usar WhatsApp Web.

## Sprint 11 — Deploy estable

- [ ] `app.broker52.com`.
- [ ] `meet.broker52.com`.
- [ ] `api.broker52.com`.
- [ ] Health checks.
- [ ] Variables fuera del repo.
- [ ] Runbook de despliegue.

## Sprint 12 — Aceptación final

- [ ] Host + 2 invitados externos.
- [ ] Cámara/micro en PC y celular.
- [ ] Chat.
- [ ] Archivos.
- [ ] Notas.
- [ ] Salida limpia.
- [ ] Broker 52 intacto.
- [ ] WhatsApp oficial funcionando o mock documentado si falta aprobación de Meta.
