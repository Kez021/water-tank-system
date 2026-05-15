# Water Tank Monitoring System

Single, deduplicated project tree. Each component lives in exactly one folder.

## Structure

| Folder            | Purpose                                                       |
|-------------------|---------------------------------------------------------------|
| `Frontend/`       | User web app (HTML/CSS/JS). Mobile-adaptive — `mobile.css` + responsive HTML cover phone, tablet, and desktop in one codebase. |
| `Admin_Dashboard/`| Admin panel (HTML/CSS/JS).                                    |
| `QR_Generator/`   | QR code generator tool (HTML/CSS/JS).                         |
| `Backend/`        | Java Spring Boot REST API (`system/system`).                  |
| `Firmware/`       | ESP32 firmware (`main.cpp`, `platformio.ini`).                |

## Notes

- The previous archive contained the project nested 3 times with the
  frontend duplicated inside the backend's `static/` folder. All duplicates
  were removed; each file now exists in exactly one place.
- The Frontend already adapts to all screen sizes — there is no separate
  "mobile" project. `Frontend/mobile.css` and the responsive markup in
  `dashboard.html`, `login.html`, etc. handle every device.
- Update the `API_BASE` constant at the top of `Frontend/app.js`,
  `Admin_Dashboard/admin.js`, and `QR_Generator/app.js` to point at your
  deployed Backend URL (instead of `http://localhost:8080`).

See `FULL_GUIDE.html` and `SETUP_GUIDE.html` for setup details.
