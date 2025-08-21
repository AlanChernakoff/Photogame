# Hidden Photo App (Bootstrap Frontend + Node Backend)

- **Frontend:** HTML + Bootstrap (sin frameworks), servido por el backend.
- **Backend:** Node + Express + Multer + JSON (carpeta oculta en Windows).
- **Regla:** el **primer usuario** creado será **admin** automáticamente; los siguientes serán **hosts/anfitriones**.
- **Juego:** el admin inicia el juego y avanza foto por foto, sin repetir, hasta *Game Over*.

## Estructura
```
hidden-photo-app/
  server.js
  .env.example
  .hidden_uploads/       # carpeta oculta (Windows) con data.json y fotos
  public/                # frontend estático (Bootstrap)
    index.html           # Registro de usuario (auto-rol)
    upload.html          # Subida de 1–2 fotos (host)
    admin.html           # Panel admin (iniciar/avanzar)
    js/app.js            # utilidades (localStorage, fetch)
    css/styles.css
```

## Variables
```
PORT=4000
UPLOAD_DIR=.hidden_uploads
DATA_FILE=.hidden_uploads/data.json
```

## Uso
```bash
cp .env.example .env
npm i
npm run dev
# Abrí http://localhost:4000
```

## Flujo
1) El primer usuario que se registre en **/ (index)** queda como **admin**.
2) El resto de usuarios quedan como **host**.
3) Hosts suben 1–2 fotos en **/upload.html**.
4) Admin inicia el juego en **/admin.html** y avanza con **Siguiente**.
