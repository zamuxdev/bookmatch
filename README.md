# BookMatch

### De tus películas favoritas a tu próxima lectura.

BookMatch recomienda libros a partir de tres películas que te encantan. Busca tus películas, selecciónalas y recibe tres recomendaciones personalizadas con una explicación de por qué podrían gustarte.

La aplicación combina datos reales de películas y libros con inteligencia artificial para convertir tus gustos cinematográficos en nuevas historias por descubrir.

## Cómo funciona

1. Busca tres películas.
2. Selecciona tus favoritas.
3. BookMatch analiza los temas, el tono y los patrones que comparten.
4. Recibe tres libros recomendados, con autor, descripción, puntuación y portada cuando está disponible.

## Características

- Búsqueda de películas con datos de TMDB.
- Recomendaciones generadas a partir de las tres películas seleccionadas.
- Enriquecimiento de resultados con Google Books y Open Library.
- Interfaz responsive en español.
- Validación de entradas y límites de consumo en el backend.
- Sin base de datos, cuentas de usuario ni almacenamiento de selecciones.
- Arquitectura serverless preparada para Azure Static Web Apps.

## Stack

- React 19, TypeScript y Vite.
- Azure Functions con Node.js 22.
- Azure Static Web Apps para el despliegue.
- TMDB para películas.
- Google Books y Open Library para portadas y datos bibliográficos.
- Cualquier proveedor compatible con el protocolo Chat Completions para generar recomendaciones.
- Docker Compose para desarrollo local.

## Ejecutar localmente

Necesitas Docker Engine y Docker Compose.

```bash
cp .env.example .env
docker compose up --build
```

Después abre [http://localhost:5173](http://localhost:5173).

Para detener los servicios:

```bash
docker compose down
```

También puedes abrir la interfaz sin configurar las claves. En ese caso, la aplicación se inicia, pero las búsquedas no devolverán resultados reales.

## Variables de entorno

Configúralas en `.env`. Solo se inyectan en la API; nunca se exponen al navegador.

| Variable | Requerida | Descripción |
| --- | --- | --- |
| `TMDB_API_KEY` | Sí | Clave API v3 de TMDB para buscar películas y consultar sus detalles. |
| `AI_API_KEY` | Sí | Credencial del proveedor de inteligencia artificial. |
| `AI_API_URL` | Sí | URL completa del endpoint compatible con Chat Completions. |
| `AI_MODEL` | Sí | Modelo que generará las recomendaciones. |
| `GOOGLE_BOOKS_API_KEY` | No | Clave opcional para asociar las consultas a tu cuota de Google Books. |

El proveedor de IA debe aceptar respuestas JSON. Puedes consultar `.env.example` para ver el formato esperado.

## Estructura

```text
.
├── src/                    # Aplicación React
├── api/                    # Azure Functions y lógica de recomendaciones
├── public/                 # Configuración de Azure Static Web Apps
├── Dockerfile.frontend    # Entorno local del frontend
├── Dockerfile.functions    # Entorno local de la API
└── docker-compose.yml      # Orquestación local
```

## API local

La API expone dos endpoints:

```text
GET  /api/movies?query=interstellar
POST /api/recommend
```

El frontend usa rutas relativas (`/api`), por lo que en desarrollo Vite redirige las peticiones al contenedor de Azure Functions.

## Pruebas y compilación

```bash
# Compilar el frontend
npm run build

# Compilar la API
npm run build:api

# Ejecutar las pruebas de la API
npm test
```

Las pruebas de backend usan dobles de las APIs externas y no consumen claves reales.

## Despliegue

El proyecto está preparado para Azure Static Web Apps mediante el workflow de [`.github/workflows/azure-static-web-apps.yml`](.github/workflows/azure-static-web-apps.yml). El despliegue usa el código fuente del frontend y de `api/`; los Dockerfiles se utilizan únicamente para desarrollo local.

Antes de desplegar, configura las variables de entorno de producción en Azure y el secreto `AZURE_STATIC_WEB_APPS_API_TOKEN` en GitHub Actions. No subas `.env`, `local.settings.json` ni claves privadas al repositorio.

## Límites y consideraciones

- Se deben seleccionar exactamente tres películas distintas.
- Las búsquedas devuelven como máximo 12 resultados.
- La puntuación de afinidad es una estimación de la IA, no una probabilidad medida.
- Las recomendaciones pueden contener errores; cuando es posible, BookMatch contrasta títulos y autores con catálogos bibliográficos.
- La aplicación no tiene autenticación. Configura límites de consumo en tus proveedores antes de publicar una instancia pública.

## APIs y atribuciones

- [TMDB API](https://developer.themoviedb.org/docs)
- [Google Books API](https://developers.google.com/books)
- [Open Library API](https://openlibrary.org/developers/api)

BookMatch utiliza la API de TMDB, pero no está avalado ni certificado por TMDB.
