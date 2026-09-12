# VecinosApp

Aplicación web para administrar edificios, ocupantes, recibos, prorrateos y pagos.

## Stack

- Backend: Node.js 24 + Express + TypeScript.
- Arquitectura: capas de dominio, rutas, repositorios y adaptadores de infraestructura.
- Base de datos: PostgreSQL en Supabase; SQLite queda disponible como respaldo local.
- Vistas: EJS.
- Frontend: TypeScript compilado a JavaScript, CSS propio.

El código fuente de la aplicación está en TypeScript. Los archivos `.js` que aparecen en `dist/` o que se generan en `public/js/` son artefactos compilados necesarios para ejecutar Node.js y el navegador.

## Requisitos

- Node.js 24 LTS y npm.
- Una base PostgreSQL accesible mediante `DATABASE_URL` para trabajar con Supabase.

## Variables de entorno

Para desarrollo con Supabase configura `DATABASE_URL` y, si corresponde, `DATABASE_SSL=true`. También se recomienda definir:

```text
SESSION_SECRET=un-secreto-largo-y-aleatorio
COOKIE_SECURE=false
PORT=4000
NODE_ENV=development
```

En Azure App Service las mismas variables se configuran en **Configuración > Variables de entorno**. Nunca guardes contraseñas, URLs con credenciales o secretos en el repositorio.

## Instalación y desarrollo local

```powershell
npm install
npm run typecheck
npm start
```

La aplicación queda disponible en `http://localhost:4000` cuando `PORT=4000` está definido. `npm start` compila primero `public/js/main.ts` y luego inicia el servidor con `tsx`.

Para reiniciar automáticamente el servidor durante cambios:

```powershell
npm run dev
```

En Windows también puedes ejecutar `ejecutar-vecinosapp.bat`. Si `DATABASE_URL` existe, usa esa base PostgreSQL; si no existe, inicializa la base SQLite local.

## Base de datos

El servidor crea o valida el esquema al iniciar. Para usar una base SQLite de desarrollo sin `DATABASE_URL`:

```powershell
npm run init-db
npm run seed-db
```

El usuario inicial de datos de prueba es:

```text
Correo: admin@vecinosapp.local
Contraseña: admin123
```

Cambia esa contraseña antes de usar datos reales. La base Supabase de São Paulo se utiliza para desarrollo local y la base Supabase de Ohio para producción.

## Build de producción

```powershell
npm run typecheck
npm run build
npm run start:prod
```

El build se genera en `dist/`. Compila el backend y el navegador, copia las vistas y assets estáticos, y minifica CSS/JavaScript. Para generar el build y levantarlo en el puerto 4000 en Windows:

```powershell
.\build-produccion-4000.bat
```

## Publicación en Azure App Service

La rama de publicación debe contener el código TypeScript y los archivos de configuración del repositorio. El flujo de GitHub Actions compila el proyecto y despliega el artefacto generado en `dist/`.

En el App Service configura como mínimo:

- `DATABASE_URL`: cadena de conexión de Supabase de producción.
- `DATABASE_SSL=true`.
- `SESSION_SECRET`: secreto largo y aleatorio.
- `NODE_ENV=production`.
- `COOKIE_SECURE=true`.
- `PORT`: Azure puede asignarlo automáticamente; no es necesario fijarlo en producción.

No publiques el `.env`, la base SQLite local ni secretos en GitHub.

## Estructura principal

```text
src/
  domain/                         Interfaces de repositorio y puertos.
  infrastructure/database/       Adaptadores PostgreSQL/SQLite y logs.
  infrastructure/repositories/   Implementaciones SQL de los repositorios.
  routes/                         Entrada HTTP y coordinación de casos de uso.
  utils/                          Seguridad, validación, cache y utilidades.
public/js/main.ts                 Código fuente TypeScript del navegador.
scripts/                          Build, migraciones, seed y revisión.
views/                            Plantillas EJS.
```

## Seguridad y rendimiento

- Las páginas internas requieren autenticación.
- Las mutaciones usan protección CSRF y límite de solicitudes.
- Las cookies de sesión son `HttpOnly`, `SameSite=Lax` y pueden usar `Secure`.
- Las páginas cacheadas se separan por usuario y las mutaciones invalidan el cache correspondiente.
- Los assets de producción usan cache HTTP y una versión generada por build.
- La aplicación y la base de datos deben estar en regiones cercanas; si se mantienen en regiones distintas, evita cachear HTML personalizado y prioriza cachear únicamente assets públicos.

## Revisión antes de publicar

```powershell
npm run typecheck
npm run build
npm run review
git diff --check
```

`npm run review` ejecuta controles de sintaxis, seguridad, columnas de auditoría, rendimiento, instalación limpia, build y auditoría de dependencias.