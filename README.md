# VecinosApp

Aplicación web en JavaScript para administrar ocupantes, recibos de servicios, prorrateos y pagos de un edificio.

## Tecnología

- Backend: Node.js + Express
- Base de datos: SQLite
- Vistas: EJS con HTML simple
- Frontend: CSS propio y JavaScript simple

## Instalación

```powershell
npm install
```

## Inicializar base de datos

```powershell
npm run init-db
```

## Cargar datos de prueba

Incluye 6 ocupantes, 2 recibos, un prorrateo de agua y pagos parciales/completos.

```powershell
npm run seed-db
```

## Ejecutar

```powershell
npm start
```

Abre en el navegador:

```text
http://localhost:3000
```

Al inicializar la aplicación se crea un usuario administrador local si no existe:

```text
Correo: admin@vecinosapp.local
Contraseña: admin123
```

Cambia esa contraseña antes de usar datos reales. En producción también conviene definir `SESSION_SECRET` con un valor propio. Si publicas la app con HTTPS, define `COOKIE_SECURE=true`.

## Build de producción

```powershell
npm run build
npm run start:prod
```

Para generar el build y levantarlo en el puerto 4000, ejecuta:

```powershell
.\build-produccion-4000.bat
```

El build se genera en `dist/` y minifica los archivos públicos CSS/JS.

Para medir con Lighthouse usa este modo de producción; en desarrollo los assets se sirven sin cache largo para que puedas ver cambios de inmediato.

## Seguridad y auditoría

- Las páginas internas requieren login.
- Las mutaciones usan token CSRF.
- Las cookies de sesión son `HttpOnly`, `SameSite=Lax` y pueden usar `Secure` con `COOKIE_SECURE=true`.
- Las tablas principales guardan `created_by` y/o `updated_by` según corresponda.
- Los logs de peticiones se guardan en una base SQLite separada: `instance/vecinosapp_logs.sqlite`.
- La base principal continúa en `instance/vecinosapp.sqlite`.

## Usuarios, perfiles y permisos

VecinosApp usa perfiles para definir qué puede hacer cada usuario. Un perfil es un conjunto de permisos. Un usuario tiene un perfil y, cuando corresponde, edificios asignados.

### Roles o perfiles incluidos

| Perfil | Para qué sirve | Uso recomendado |
| --- | --- | --- |
| Super Admin | Tiene acceso total al sistema, incluyendo usuarios, perfiles, permisos y mantenimiento. | Para la persona responsable de configurar y administrar toda la aplicación. Debe usarse con cuidado. |
| Administrador | Gestiona la operación diaria: edificios, ocupantes, recibos, prorrateos, pagos y reportes. | Para personal administrativo interno que maneja varios edificios, pero no debería cambiar permisos críticos. |
| Propietario | Pensado para dueños o responsables de uno o más edificios asignados. | Para que un propietario administre sus edificios, pisos, ocupantes, recibos, pagos y reportes sin ver edificios de otros propietarios. |
| Operador | Perfil limitado para registrar información operativa. | Para usuarios que registran pagos u ocupantes, pero no deben tocar configuración general. |

### Permisos disponibles

| Permiso | Qué permite hacer |
| --- | --- |
| `dashboard.view` | Ver el Dashboard principal. |
| `buildings.manage` | Crear, editar, desactivar y consultar edificios. |
| `occupants.manage` | Crear, editar, desactivar y consultar ocupantes. |
| `receipts.manage` | Registrar, editar, consultar o eliminar recibos cuando aplique. |
| `allocations.manage` | Generar o recalcular prorrateos de recibos. |
| `payments.manage` | Registrar pagos parciales o totales. |
| `reports.view` | Consultar reportes de deudas, pagos, recibos y saldos. |
| `users.manage` | Crear y editar usuarios. |
| `roles.manage` | Crear y editar perfiles, incluyendo sus permisos. |
| `maintenance.manage` | Acceder a opciones de mantenimiento del sistema. |

### Recomendaciones de configuración

- Usa `Super Admin` solo para usuarios de confianza que deban configurar todo el sistema.
- Usa `Administrador` para personal que maneja la operación completa, pero no necesita modificar perfiles ni permisos.
- Usa `Propietario` cuando una persona debe gestionar solo sus edificios asignados.
- Usa `Operador` para tareas puntuales como registrar pagos u ocupantes.
- Asigna edificios a usuarios propietarios para preparar la separación de información por edificio.
- Revisa los permisos de un perfil antes de asignarlo a muchos usuarios.
- Desactiva usuarios que ya no deben ingresar, en lugar de reutilizar sus cuentas.

## Revisión de código

El perfil del agente revisor está en `docs/code-review-agent.md`. Antes de cerrar cambios importantes ejecuta:

```powershell
npm run review
```

Este comando valida sintaxis, build, auditoría básica, controles de seguridad, cache/performance y `npm audit --omit=dev`.

## Módulos

- Dashboard con resumen general.
- CRUD de edificios y vista de ocupantes agrupados por piso.
- CRUD de ocupantes.
- CRUD de recibos.
- Prorrateo de recibos entre ocupantes activos.
- Registro de pagos parciales o totales.
- Reportes básicos de deudas, recibos pendientes, pagos por periodo, recaudación y saldos.
- Administración para Super Admin: usuarios, perfiles, permisos y mantenimiento.
- Asignación de edificios por usuario, preparada para propietarios/dueños de edificio.
