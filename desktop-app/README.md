# EKKO Desktop Frontend

## Run

1. `cd desktop-app`
2. `npm install`
3. `npm run dev`

## Build

1. `cd desktop-app`
2. `npm install`
3. `npm run build`

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
