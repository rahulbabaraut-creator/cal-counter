# NutriChrono

Mobile-first calorie diary and chronometer PWA with a server-side AI food-photo estimate endpoint.

## Deploy without VS Code (Render)

1. Put this project in a Git repository that you own, then connect that repository to Render.
2. Create a **Web Service** from the repository. Render can read the included `render.yaml` blueprint if you choose Blueprint deployment.
3. In the service environment settings, add `OPENAI_API_KEY` as a secret. Do not put the key in frontend code or commit it to the repository. Optional: set `OPENAI_MODEL` to a vision-capable model available to your API account.
4. Deploy. The service serves the React frontend and `/api/*` endpoints from the same HTTPS origin.
5. Open the deployed URL on your phone and use the browser's install/add-to-home-screen option. Camera capture generally requires HTTPS or localhost.

## Local development

Requirements: Node.js 20+. At the project root run `npm install`, `npm --prefix client install`, and `npm --prefix server install`. Copy `server/.env.example` to `server/.env` and set `OPENAI_API_KEY`. Then run `npm run dev`.

## Checks and limitations

- Food photo results are estimates, not measurements; users should review portion size and nutrition before saving.
- Food diary and chronometer data are saved in the current browser's local storage; they do not sync between devices.
- `/api/health` reports whether the server has an API key configured.
