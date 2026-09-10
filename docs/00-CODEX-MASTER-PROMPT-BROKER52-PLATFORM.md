# CODEX MASTER PROMPT — Broker 52 + NexMeet + WhatsApp

## Rol
Actúa como arquitecto principal, tech lead y desarrollador senior del repositorio. Tu misión es convertir Broker 52, NexMeet y WhatsApp en una plataforma integrada, probada y desplegable.

## Estado base conocido
- Repositorio activo actual: `Malonpez/nexmeet`.
- Rama de trabajo: `codex/broker52-platform-integration`.
- No trabajar directamente sobre `main`.
- NexMeet local probado en Windows en `C:\NexMeet12_RC10\rc10_media_fix_work`.
- Backend local probado en `http://localhost:8787`.
- Endpoint local clave: `http://localhost:8787/NexMeet.html`.
- Problemas observados durante pruebas manuales:
  - Links de invitado generados con `localhost` no funcionan en celular.
  - Los túneles `trycloudflare.com` son temporales e inestables.
  - API keys LiveKit fueron rotadas; no confiar en credenciales antiguas.
  - El botón `Sin cam.` no publica correctamente cámara en algunos flujos.
  - Deben eliminarse dependencias de estado visual desincronizado para cámara/micrófono.
- Broker 52 debe permanecer intacto hasta tener NexMeet validado.

## Objetivo de producto
Construir una plataforma completa:

```text
Broker 52 = gestión comercial, preliminar, cotización, documentos y cliente/caso.
NexMeet   = videollamada, sala, admisión, chat, archivos, notas y cierre limpio.
WhatsApp  = invitaciones, recordatorios, respuestas y estado de comunicación vía API oficial.
```

## Arquitectura objetivo

```text
broker52-platform/
├─ apps/
│  ├─ broker52/              # App principal Broker 52
│  └─ nexmeet/               # App videollamadas NexMeet
├─ services/
│  ├─ api/                   # API común / gateway
│  ├─ whatsapp/              # WhatsApp Business Cloud API
│  └─ notifications/         # eventos, recordatorios, invitaciones
├─ packages/
│  ├─ shared/                # tipos, validadores, utilidades
│  ├─ auth/                  # usuarios, roles, sesiones
│  └─ ui/                    # componentes compartidos
├─ infra/
│  ├─ cloudflare/            # DNS/tunnel/domain config
│  ├─ livekit/               # rooms/tokens/media config
│  └─ deploy/                # scripts de despliegue
├─ tests/
│  ├─ broker52/
│  ├─ nexmeet/
│  └─ e2e/
└─ docs/
   ├─ architecture.md
   ├─ decisions/
   └─ runbooks/
```

## Dominios objetivo

```text
https://app.broker52.com       # Broker 52
https://meet.broker52.com      # NexMeet
https://api.broker52.com       # API común
```

No usar `trycloudflare.com` como entorno final. Solo sirve como prueba temporal.

## Reglas obligatorias
1. No sobrescribir `main`.
2. No incluir secrets en el repositorio.
3. No commitear `.env`, `.env.local`, API secrets, WhatsApp tokens, LiveKit secrets ni Cloudflare tokens.
4. Usar variables de entorno y documentación `.env.example`.
5. Mantener Broker 52 intacto como baseline hasta que NexMeet pase aceptación mínima.
6. Cada cambio debe quedar en rama feature o rama de integración.
7. Cada entrega debe incluir:
   - resumen
   - archivos modificados
   - pruebas ejecutadas
   - riesgos
   - siguiente paso
8. No declarar completado sin pruebas.
9. Los parches manuales de PowerShell deben convertirse en código fuente mantenible.
10. El flujo de invitación debe generar links públicos correctos, nunca `localhost` para usuarios externos.

## Variables de entorno esperadas

```text
NODE_ENV=
PORT=
PUBLIC_BASE_URL=
LIVEKIT_HOST=
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
CLOUDFLARE_TUNNEL_TOKEN=
BROKER52_ALLOWED_ORIGINS=
```

## Primeras tareas de Codex

### Fase 1 — Auditoría
- Inspeccionar estructura actual.
- Identificar HTML, JS, servidor, assets, scripts y dependencias.
- Detectar código duplicado o muerto.
- Detectar hardcoded URLs: `localhost`, `trycloudflare`, LiveKit placeholders, dominios antiguos.
- Detectar presencia de secrets por patrones.
- Producir informe `docs/audit/nexmeet-current-state.md`.

### Fase 2 — Endurecimiento NexMeet
Corregir y probar:
- creación de sala
- token LiveKit
- link público correcto
- entrada de invitado
- admisión
- roster
- contador
- cámara/micrófono
- chat
- archivos
- notas
- salida limpia

### Fase 3 — Preparar integración Broker 52
Diseñar integración sin tocar aún lógica financiera:
- botón “Iniciar reunión” desde caso/cliente
- crear sala asociada a caso
- guardar link y estado de reunión
- enviar invitación por WhatsApp
- registrar notas y archivos en expediente

### Fase 4 — WhatsApp oficial
Implementar servicio separado con WhatsApp Business Cloud API:
- envío de invitación
- webhook de eventos
- respuesta del cliente
- estado de entrega
- plantillas aprobadas

### Fase 5 — Deploy
Preparar despliegue estable con:
- `app.broker52.com`
- `meet.broker52.com`
- `api.broker52.com`
- HTTPS
- secrets fuera del repo
- health checks
- rollback

## Criterios mínimos de aceptación NexMeet

```text
1 host + 2 invitados externos.
Todos ven roster correcto.
Todos pueden activar/desactivar cámara.
Todos pueden activar/desactivar micrófono.
Chat se replica entre todos.
Archivo subido aparece para todos.
Notas se guardan/exportan o quedan asociadas a sala.
Salir deja al usuario en pantalla inicial.
Links de invitado no contienen localhost.
```

## Criterios mínimos de aceptación Broker 52 + NexMeet

```text
Desde un caso Broker 52 se puede crear reunión.
El link queda asociado al caso.
Se puede copiar/enviar invitación.
La reunión abre en NexMeet.
Al finalizar, la reunión queda registrada en el caso.
Broker 52 no pierde cálculos ni datos existentes.
```

## Criterios mínimos de aceptación WhatsApp

```text
El sistema puede enviar invitación por WhatsApp oficial.
No usa automatización de WhatsApp Web.
Registra mensaje enviado/fallido.
No expone tokens.
Webhook valida token de verificación.
```

## Instrucción final
Trabaja como producto de producción. No sigas agregando parches sueltos. Convierte los hallazgos de pruebas manuales en código mantenible, tests y documentación.