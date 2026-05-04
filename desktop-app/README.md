# EKKO Desktop Frontend

## Development

1. `cd desktop-app`
2. `npm install`
3. `npm run dev`

## Production Build

1. `cd desktop-app`
2. Create `.env.production` from `.env.production.example`
3. Set `VITE_API_BASE_URL` to the public backend address, for example `https://api.example.com/api`
4. `npm install`
5. `npm run build:win`

Build output:

- Installer: `release/EKKO Desktop-Setup-<version>.exe`
- Unpacked app: `release/win-unpacked/`

Notes before shipping:

- The backend URL must be public and reachable from user machines.
- The backend must return a public `wss://` LiveKit address.
- If you enable Krisp noise cancellation, test first-run model download on a clean machine.
- Unsigned Windows installers may show "Unknown publisher" warnings.
- If `electron-builder` fails while extracting `winCodeSign` with a symbolic link permission error, enable Windows Developer Mode or run the packaging terminal with Administrator privileges, then rerun `npm run build:win`.

## Environment Files

- `.env`: local manual override, currently suitable for direct environment testing
- `.env.example`: local development example
- `.env.production.example`: production build template for packaged releases

## Backend Integration

- Desktop shell: Electron
- Renderer: React + TypeScript + Vite
- Default backend base URL: `http://127.0.0.1:8000/api`
- Override API base URL with `VITE_API_BASE_URL`
- Verified endpoints for the current `ekko` backend:
- `POST /users/login`
- `POST /users/register`
- `GET /users/info`
- `GET /users/settings`
- `PUT /users/settings`
- `PUT /users/update`
- `PUT /users/change_email`
- `POST /domains/`
- `GET /domains/get_domain_info_by_member_id`
- `POST /domains/create_domain`
- `PUT /domains/update_domain`
- `GET /domains/join_domain/{domain_id}`
- `GET /domains/leave_domain/{domain_id}`
- `POST /domains/get_domain_member_infos`
- `PUT /domains/member/alias`
- `PUT /domains/change_role`
- `DELETE /domains/kick_domain_member`
- `DELETE /domains/delete_domain/{domain_id}`
- `POST /channels/create_channel`
- `GET /channels/list_by_domain/{domain_id}`
- `POST /channels/leave`
- `POST /channels/livekit/token`
- `DELETE /channels/delete_channel/{channel_id}`
- `GET /email/send/get_verify_code`
- `PUT /users/find_password`

## Notes

- The frontend automatically unwraps the `{"code","message","data"}` response envelope returned by `ekko`.
- User settings are persisted to the backend `users.voice_settings` JSON field after login.
- Domain and channel views now prefer real backend data and show request errors directly instead of auto-falling back to demo data after login.
- Windows packaging is handled by `electron-builder` with an NSIS installer and outputs into `release/`.
