# BuildLens Frontend

Next.js 16 (App Router) UI for [BuildLens](../README.md): chat, document library, and settings.

## Development

From this directory:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The API base URL comes from `NEXT_PUBLIC_API_URL` in the repo root `.env` (default `http://localhost:8000/api/v1`).

## Scripts

| Command        | Purpose              |
| -------------- | -------------------- |
| `npm run dev`  | Dev server (:3000)   |
| `npm run build`| Production build     |
| `npm run lint` | ESLint               |

See the root [README](../README.md) for Docker and full-stack setup.
