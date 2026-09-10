# Arquitectura objetivo — Broker 52 + NexMeet + WhatsApp

## Decisión arquitectónica
El sistema debe evolucionar de aplicaciones sueltas y scripts manuales a una plataforma modular con tres dominios funcionales:

1. **Broker 52**: negocio hipotecario, clientes, casos, preliminares, cotizaciones, documentos y seguimiento.
2. **NexMeet**: reuniones seguras asociadas a cliente/caso, con video, chat, archivos, notas y admisión.
3. **WhatsApp**: comunicación operacional oficial mediante WhatsApp Business Cloud API.

## Principio rector
Broker 52 no debe depender internamente de detalles de implementación de NexMeet. Broker 52 debe pedir al backend común: “crea una reunión para este caso” y recibir un objeto de reunión.

## Modelo conceptual

```text
Client
└─ Case
   ├─ PreliminaryAssessment
   ├─ Quote
   ├─ Documents
   ├─ Meeting[]
   │  ├─ provider: nexmeet
   │  ├─ roomId
   │  ├─ publicUrl
   │  ├─ participants
   │  ├─ notes
   │  ├─ sharedFiles
   │  └─ status
   └─ Communication[]
      ├─ channel: whatsapp/email/sms
      ├─ direction: outbound/inbound
      ├─ status
      └─ relatedMeetingId
```

## Servicios

### `apps/broker52`
Responsabilidad:
- UI principal.
- Flujo comercial.
- Gestión documental.
- Acceso a reuniones asociadas al caso.

No debe guardar secrets LiveKit ni WhatsApp.

### `apps/nexmeet`
Responsabilidad:
- UI de reunión.
- LiveKit client.
- Cámara, micro, pantalla, chat, archivos, notas.
- Manejo de invitado/host/admisión.

No debe generar tokens LiveKit en frontend.

### `services/api`
Responsabilidad:
- API común.
- Autenticación/autorización.
- Creación de salas.
- Generación de tokens LiveKit.
- Persistencia de meeting/case linkage.
- Orquestación WhatsApp.

### `services/whatsapp`
Responsabilidad:
- WhatsApp Business Cloud API.
- Enviar invitaciones.
- Webhooks.
- Validar firma/token.
- Registrar estado.

### `infra/cloudflare`
Responsabilidad:
- DNS.
- Tunnel estable.
- Hostnames públicos.
- TLS.

### `infra/livekit`
Responsabilidad:
- Configuración de proyecto LiveKit.
- Variables.
- Room/token policy.

## Endpoints objetivo

```text
GET  /health
POST /api/meetings
GET  /api/meetings/:id
POST /api/meetings/:id/invite
POST /api/meetings/:id/token
POST /api/meetings/:id/end
POST /api/whatsapp/webhook
GET  /api/whatsapp/webhook
```

## Flujo crear reunión desde Broker 52

```text
1. Usuario abre caso en Broker 52.
2. Pulsa “Iniciar reunión”.
3. Broker 52 llama POST /api/meetings con caseId/clientId.
4. API crea roomId en NexMeet/LiveKit.
5. API guarda Meeting asociado al caso.
6. API devuelve publicUrl.
7. Broker 52 muestra copiar link / enviar WhatsApp.
8. Invitado abre link público.
9. NexMeet solicita admisión o entra según política.
10. Al finalizar, Meeting queda cerrada y registrada.
```

## Flujo WhatsApp

```text
1. Broker 52 solicita enviar invitación.
2. API llama service whatsapp.
3. WhatsApp service envía plantilla o mensaje permitido.
4. Webhook recibe estados: sent, delivered, read, failed.
5. API registra Communication asociado a Case y Meeting.
```

## Seguridad

Reglas obligatorias:
- No poner secrets en frontend.
- No poner secrets en GitHub.
- No mandar LiveKit secret al navegador.
- Tokens LiveKit deben emitirse desde backend.
- Cada token debe tener room/identity/expiry específicos.
- WhatsApp webhook debe validar verify token y firma si está configurada.
- CORS debe limitar orígenes a dominios esperados.

## Ambientes

```text
local:
  Broker 52: http://localhost:xxxx
  NexMeet:   http://localhost:8787/NexMeet.html
  API:       http://localhost:8787 o puerto separado

staging:
  app-staging.broker52.com
  meet-staging.broker52.com
  api-staging.broker52.com

production:
  app.broker52.com
  meet.broker52.com
  api.broker52.com
```

## Bloqueos conocidos a resolver

```text
- Links con localhost no sirven para celular/invitados.
- trycloudflare temporal genera Error 1033 cuando muere el túnel.
- Botón cámara puede quedar desincronizado del estado real LiveKit.
- Participantes pueden aparecer conectados sin video publicado.
- Se requiere prueba E2E real o automatizada para host + 2 invitados.
```

## Decisión de despliegue
La prueba temporal puede seguir usando `trycloudflare.com`, pero la plataforma debe terminar en dominio estable:

```text
meet.broker52.com
```

La integración con Broker 52 no debe hacerse hasta que NexMeet cumpla aceptación mínima de sala multiusuario.