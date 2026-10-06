#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Modo Sabor Launcher
Panel local para iniciar y vigilar el ecosistema sin ventanas de consola.
"""

import json
import os
import shutil
import socket
import subprocess
import threading
import time
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import messagebox
from urllib.error import URLError
from urllib.request import urlopen


BASE_DIR = Path(__file__).resolve().parent
SERVER_DIR = BASE_DIR / "server"
CLIENT_DIR = BASE_DIR / "client"
CLIENT_VITE = CLIENT_DIR / "node_modules" / "vite" / "bin" / "vite.js"
PROMO_ROOT = BASE_DIR / "masivos-stitch"
PROMO_SERVER = PROMO_ROOT / "server.js"
PROMO_LOCK = PROMO_ROOT / "data" / "panel.lock.json"
BRANDING_DIR = BASE_DIR / "assets" / "branding"
LAUNCHER_DIR = BASE_DIR / ".launcher"
PIDS_DIR = LAUNCHER_DIR / "pids"
LOGS_DIR = LAUNCHER_DIR / "logs"
STATE_FILE = LAUNCHER_DIR / "state.json"
LOGO_PATH = BRANDING_DIR / "logo.png"
ICON_PATH = BASE_DIR / "modsabor.ico"

CLIENT_URL = "http://localhost:5173"
SERVER_URL = "http://localhost:3001/api/health"
STITCH_URL = "http://127.0.0.1:3867"
STITCH_STATUS_URL = f"{STITCH_URL}/api/status"

POLL_INTERVAL_MS = 5000
STATUS_TIMEOUT = 0.6
MAX_LOG_LINES = 300
WINDOW_FLAGS = (
    getattr(subprocess, "CREATE_NO_WINDOW", 0)
    | getattr(subprocess, "DETACHED_PROCESS", 0)
    | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
)
STARTF_USESHOWWINDOW = getattr(subprocess, "STARTF_USESHOWWINDOW", 0)

COLORS = {
    "page": "#F6F8FC",
    "navy": "#111827",
    "title": "#1F2A3D",
    "muted": "#6B7A90",
    "line": "#E5ECF6",
    "card": "#FFFFFF",
    "primary": "#5D87FF",
    "secondary": "#49BEFF",
    "success": "#13DEB9",
    "warning": "#FFAE1F",
    "danger": "#FA896B",
    "dark": "#29343D",
    "soft_red": "#FFF4F2",
    "soft_blue": "#EEF4FF",
    "soft_green": "#EAFBF7",
    "soft_dark": "#F3F6FB",
}

SERVICES = {
    "server": {
        "label": "API",
        "hint": "Base de datos y backend",
        "port": 3001,
        "path": str(SERVER_DIR),
    },
    "client": {
        "label": "Panel Web",
        "hint": "Interfaz principal",
        "port": 5173,
        "path": str(CLIENT_DIR),
    },
    "stitch": {
        "label": "Masivos Stitch",
        "hint": "Campañas y WhatsApp",
        "port": 3867,
        "path": str(PROMO_ROOT),
    },
}


def ensure_dirs():
    for folder in (LAUNCHER_DIR, PIDS_DIR, LOGS_DIR):
        folder.mkdir(parents=True, exist_ok=True)


def read_json(path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path, payload):
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def hidden_startupinfo():
    info = None
    if os.name == "nt":
        info = subprocess.STARTUPINFO()
        info.dwFlags |= STARTF_USESHOWWINDOW
        info.wShowWindow = 0
    return info


def node_command(script_path, *args):
    node_exe = shutil.which("node") or "node"
    return [node_exe, str(script_path), *args]


class ModoSaborLauncher:
    def __init__(self, root):
        ensure_dirs()
        self.root = root
        self.root.title("Modo Sabor | Centro de Control")
        self.root.geometry("980x720")
        self.root.minsize(940, 680)
        self.root.configure(bg=COLORS["page"])
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.center_window()
        self._load_icon()

        self.logo_image = None
        self.auto_refresh = True
        self.busy = False
        self.refresh_in_progress = False
        self.service_cards = {}
        self.service_pills = {}
        self.status_summary = {}
        self.launch_state = read_json(STATE_FILE, {})

        self.create_ui()
        self.refresh_status(log_summary=False)
        self.schedule_refresh()

    def center_window(self):
        width, height = 980, 720
        x = (self.root.winfo_screenwidth() - width) // 2
        y = (self.root.winfo_screenheight() - height) // 2
        self.root.geometry(f"{width}x{height}+{max(x, 0)}+{max(y, 0)}")

    def _load_icon(self):
        try:
            if ICON_PATH.exists():
                self.root.iconbitmap(str(ICON_PATH))
        except Exception:
            pass

    def create_ui(self):
        main = tk.Frame(self.root, bg=COLORS["page"])
        main.pack(fill=tk.BOTH, expand=True)

        left = tk.Frame(main, bg=COLORS["navy"], width=296)
        left.pack(side=tk.LEFT, fill=tk.Y)
        left.pack_propagate(False)

        right = tk.Frame(main, bg=COLORS["page"])
        right.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self._build_sidebar(left)
        self._build_content(right)

    def _build_sidebar(self, parent):
        top = tk.Frame(parent, bg=COLORS["navy"])
        top.pack(fill=tk.X, padx=28, pady=(28, 16))

        if LOGO_PATH.exists():
            try:
                self.logo_image = tk.PhotoImage(file=str(LOGO_PATH))
                scale = max(self.logo_image.width() // 120, 1)
                self.logo_image = self.logo_image.subsample(scale, scale)
                tk.Label(top, image=self.logo_image, bg=COLORS["navy"]).pack(anchor="w", pady=(0, 18))
            except Exception:
                self.logo_image = None

        tk.Label(
            top,
            text="Modo Sabor",
            font=("Segoe UI", 24, "bold"),
            bg=COLORS["navy"],
            fg="white",
        ).pack(anchor="w")
        tk.Label(
            top,
            text="Centro de arranque",
            font=("Segoe UI", 11),
            bg=COLORS["navy"],
            fg="#B4C1D7",
        ).pack(anchor="w", pady=(2, 12))
        tk.Label(
            top,
            text="Inicia la API y el panel web desde un solo lugar, con estado en vivo y acceso rapido.",
            justify="left",
            wraplength=240,
            font=("Segoe UI", 10),
            bg=COLORS["navy"],
            fg="#D7E0EE",
        ).pack(anchor="w")

        chips = tk.Frame(parent, bg=COLORS["navy"])
        chips.pack(fill=tk.X, padx=28, pady=(6, 20))

        self.status_summary["online"] = self._make_stat_chip(chips, "Servicios activos", f"0/{len(SERVICES)}", COLORS["soft_blue"], COLORS["primary"])
        self.status_summary["panel"] = self._make_stat_chip(chips, "Panel", "masivos:3867", COLORS["soft_green"], COLORS["success"])

        actions = tk.Frame(parent, bg=COLORS["navy"])
        actions.pack(fill=tk.X, padx=28, pady=(0, 22))

        self.start_btn = self._make_primary_button(actions, "Encender sistema", self.start_orchestration)
        self.start_btn.pack(fill=tk.X, pady=(0, 12))

        self.open_btn = self._make_secondary_button(actions, "Abrir panel web", self.open_dashboard)
        self.open_btn.pack(fill=tk.X, pady=(0, 10))

        self.stop_btn = self._make_secondary_button(actions, "Apagar sistema", self.safe_shutdown, fg=COLORS["danger"])
        self.stop_btn.pack(fill=tk.X, pady=(0, 10))

        footer = tk.Frame(parent, bg=COLORS["navy"])
        footer.pack(side=tk.BOTTOM, fill=tk.X, padx=28, pady=26)

        tk.Label(
            footer,
            text="Modo local",
            font=("Segoe UI", 9, "bold"),
            bg=COLORS["navy"],
            fg="#AFC0D9",
        ).pack(anchor="w")
        tk.Label(
            footer,
            text="API 3001  |  WEB 5173  |  MASIVOS 3867",
            font=("Consolas", 9),
            bg=COLORS["navy"],
            fg="#E0E8F4",
        ).pack(anchor="w", pady=(4, 0))

    def _build_content(self, parent):
        content = tk.Frame(parent, bg=COLORS["page"])
        content.pack(fill=tk.BOTH, expand=True, padx=28, pady=26)

        header_card = tk.Frame(content, bg=COLORS["card"], highlightbackground=COLORS["line"], highlightthickness=1)
        header_card.pack(fill=tk.X)

        hero = tk.Frame(header_card, bg=COLORS["card"])
        hero.pack(fill=tk.X, padx=24, pady=24)

        left = tk.Frame(hero, bg=COLORS["card"])
        left.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        tk.Label(
            left,
            text="Arranque rapido de Modo Sabor",
            font=("Segoe UI", 22, "bold"),
            bg=COLORS["card"],
            fg=COLORS["title"],
        ).pack(anchor="w")
        tk.Label(
            left,
            text="Controla backend y panel web, revisa si están en línea y abre el sistema apenas quede listo.",
            font=("Segoe UI", 10),
            bg=COLORS["card"],
            fg=COLORS["muted"],
            wraplength=430,
            justify="left",
        ).pack(anchor="w", pady=(8, 0))

        hero_actions = tk.Frame(left, bg=COLORS["card"])
        hero_actions.pack(anchor="w", pady=(16, 0))

        tk.Button(
            hero_actions,
            text="Abrir panel web",
            font=("Segoe UI", 10, "bold"),
            bg=COLORS["soft_dark"],
            fg=COLORS["title"],
            activebackground="#E9EEF7",
            activeforeground=COLORS["title"],
            relief="flat",
            bd=0,
            padx=18,
            pady=10,
            cursor="hand2",
            command=self.open_dashboard,
        ).pack(side=tk.LEFT)

        self.stop_main_btn = tk.Button(
            hero_actions,
            text="Apagar",
            font=("Segoe UI", 10, "bold"),
            bg=COLORS["danger"],
            fg="white",
            activebackground="#E76F55",
            activeforeground="white",
            relief="flat",
            bd=0,
            padx=18,
            pady=10,
            cursor="hand2",
            command=self.safe_shutdown,
        )
        self.stop_main_btn.pack(side=tk.LEFT, padx=(12, 0))

        status_box = tk.Frame(hero, bg=COLORS["soft_blue"], padx=18, pady=18)
        status_box.pack(side=tk.RIGHT, padx=(20, 0))
        tk.Label(
            status_box,
            text="Estado general",
            font=("Segoe UI", 10, "bold"),
            bg=COLORS["soft_blue"],
            fg=COLORS["primary"],
        ).pack(anchor="w")
        self.hero_status = tk.Label(
            status_box,
            text="Esperando revisión",
            font=("Segoe UI", 16, "bold"),
            bg=COLORS["soft_blue"],
            fg=COLORS["title"],
        )
        self.hero_status.pack(anchor="w", pady=(6, 2))
        self.hero_detail = tk.Label(
            status_box,
            text="Monitoreo automático activo",
            font=("Segoe UI", 9),
            bg=COLORS["soft_blue"],
            fg=COLORS["muted"],
        )
        self.hero_detail.pack(anchor="w")

        top_row = tk.Frame(content, bg=COLORS["page"])
        top_row.pack(fill=tk.X, pady=(20, 18))

        services_card = tk.Frame(top_row, bg=COLORS["card"], highlightbackground=COLORS["line"], highlightthickness=1)
        services_card.pack(fill=tk.BOTH, expand=True)

        service_header = tk.Frame(services_card, bg=COLORS["card"])
        service_header.pack(fill=tk.X, padx=24, pady=(22, 10))
        tk.Label(
            service_header,
            text="Servicios principales",
            font=("Segoe UI", 13, "bold"),
            bg=COLORS["card"],
            fg=COLORS["title"],
        ).pack(side=tk.LEFT)
        tk.Button(
            service_header,
            text="Actualizar",
            font=("Segoe UI", 9, "bold"),
            bg=COLORS["soft_dark"],
            fg=COLORS["title"],
            relief="flat",
            padx=14,
            pady=7,
            cursor="hand2",
            command=self.refresh_status,
        ).pack(side=tk.RIGHT)

        grid = tk.Frame(services_card, bg=COLORS["card"])
        grid.pack(fill=tk.BOTH, expand=True, padx=18, pady=(0, 18))
        grid.grid_columnconfigure((0, 1), weight=1, uniform="services")

        for idx, key in enumerate(SERVICES):
            card = self._make_service_card(grid, key, SERVICES[key], idx)
            row, col = divmod(idx, 2)
            card.grid(row=row, column=col, sticky="nsew", padx=6, pady=6)

        log_card = tk.Frame(content, bg=COLORS["card"], highlightbackground=COLORS["line"], highlightthickness=1)
        log_card.pack(fill=tk.BOTH, expand=True)

        log_header = tk.Frame(log_card, bg=COLORS["card"])
        log_header.pack(fill=tk.X, padx=24, pady=(20, 8))
        tk.Label(
            log_header,
            text="Registro del lanzador",
            font=("Segoe UI", 13, "bold"),
            bg=COLORS["card"],
            fg=COLORS["title"],
        ).pack(side=tk.LEFT)
        self.log_status = tk.Label(
            log_header,
            text="Monitoreo en tiempo real",
            font=("Segoe UI", 9, "bold"),
            bg=COLORS["card"],
            fg=COLORS["primary"],
        )
        self.log_status.pack(side=tk.RIGHT)

        self.console = tk.Text(
            log_card,
            bg="#FBFCFE",
            fg=COLORS["dark"],
            relief="flat",
            font=("Consolas", 10),
            padx=18,
            pady=14,
            insertbackground=COLORS["primary"],
            state=tk.DISABLED,
        )
        self.console.pack(fill=tk.BOTH, expand=True, padx=18, pady=(0, 18))
        self.log("Panel listo. Verificando servicios...")

    def _make_stat_chip(self, parent, title, value, bg, fg):
        chip = tk.Frame(parent, bg=bg, padx=14, pady=12)
        chip.pack(fill=tk.X, pady=(0, 10))
        tk.Label(chip, text=title, font=("Segoe UI", 9, "bold"), bg=bg, fg=fg).pack(anchor="w")
        value_lbl = tk.Label(chip, text=value, font=("Segoe UI", 12, "bold"), bg=bg, fg=COLORS["title"])
        value_lbl.pack(anchor="w", pady=(4, 0))
        return value_lbl

    def _make_primary_button(self, parent, text, command):
        return tk.Button(
            parent,
            text=text,
            command=command,
            font=("Segoe UI", 11, "bold"),
            bg=COLORS["primary"],
            fg="white",
            activebackground="#4970E9",
            activeforeground="white",
            relief="flat",
            bd=0,
            padx=18,
            pady=14,
            cursor="hand2",
        )

    def _make_secondary_button(self, parent, text, command, fg=None):
        return tk.Button(
            parent,
            text=text,
            command=command,
            font=("Segoe UI", 10, "bold"),
            bg="white",
            fg=fg or COLORS["title"],
            activebackground="#F4F7FB",
            activeforeground=fg or COLORS["title"],
            relief="flat",
            bd=1,
            highlightbackground=COLORS["line"],
            highlightthickness=1,
            padx=18,
            pady=12,
            cursor="hand2",
        )

    def _make_service_card(self, parent, key, data, idx):
        bg = COLORS["card"]
        card = tk.Frame(parent, bg=bg, padx=18, pady=16, highlightbackground=COLORS["line"], highlightthickness=1)
        accent = tk.Canvas(card, width=42, height=42, bg=bg, highlightthickness=0)
        accent.pack(anchor="w")
        accent.create_oval(3, 3, 39, 39, fill=COLORS["soft_blue"], outline="")
        accent.create_text(21, 21, text=str(idx + 1), font=("Segoe UI", 12, "bold"), fill=COLORS["primary"])

        tk.Label(card, text=data["label"], font=("Segoe UI", 11, "bold"), bg=bg, fg=COLORS["title"]).pack(anchor="w", pady=(12, 2))
        tk.Label(card, text=data["hint"], font=("Segoe UI", 9), bg=bg, fg=COLORS["muted"]).pack(anchor="w")

        bottom = tk.Frame(card, bg=bg)
        bottom.pack(fill=tk.X, pady=(16, 0))

        pill = tk.Label(
            bottom,
            text="Chequeando",
            font=("Segoe UI", 9, "bold"),
            bg=COLORS["soft_dark"],
            fg=COLORS["muted"],
            padx=12,
            pady=6,
        )
        pill.pack(side=tk.LEFT)

        detail = tk.Label(bottom, text="Pendiente", font=("Segoe UI", 9), bg=bg, fg=COLORS["muted"])
        detail.pack(side=tk.RIGHT)

        self.service_cards[key] = detail
        self.service_pills[key] = pill
        return card

    def log(self, message):
        timestamp = time.strftime("%H:%M:%S")
        self.console.config(state=tk.NORMAL)
        self.console.insert(tk.END, f"[{timestamp}] {message}\n")
        line_count = int(self.console.index("end-1c").split(".")[0])
        if line_count > MAX_LOG_LINES:
            self.console.delete("1.0", f"{line_count - MAX_LOG_LINES + 1}.0")
        self.console.see(tk.END)
        self.console.config(state=tk.DISABLED)

    def dispatch(self, callback, *args, **kwargs):
        self.root.after(0, lambda: callback(*args, **kwargs))

    def schedule_refresh(self):
        if self.auto_refresh:
            self.root.after(POLL_INTERVAL_MS, self._scheduled_refresh)

    def _scheduled_refresh(self):
        if self.auto_refresh and not self.busy and not self.refresh_in_progress:
            self.refresh_status(log_summary=False)
        self.schedule_refresh()

    def set_busy(self, value, text=None):
        self.busy = value
        self.start_btn.config(state=tk.DISABLED if value else tk.NORMAL)
        self.log_status.config(text=text or ("Sincronizando..." if value else "Monitoreo en tiempo real"))

    def open_logs_folder(self):
        try:
            os.startfile(str(LOGS_DIR))
        except Exception as exc:
            messagebox.showerror("Modo Sabor", f"No pude abrir la carpeta de logs.\n\n{exc}")

    def open_dashboard(self):
        if not self.url_available(STITCH_STATUS_URL):
            self.log("El panel de campañas todavía no está listo (no responde en el puerto 3867).")
            messagebox.showinfo("Modo Sabor", "El panel de campañas todavía no está levantado.")
            return
        webbrowser.open(STITCH_URL)

    def on_close(self):
        self.auto_refresh = False
        self.root.destroy()

    def pid_file(self, service):
        return PIDS_DIR / f"{service}.pid"

    def read_pid(self, service):
        try:
            return int(self.pid_file(service).read_text(encoding="utf-8").strip())
        except Exception:
            return None

    def write_pid(self, service, pid):
        self.pid_file(service).write_text(str(pid), encoding="utf-8")

    def clear_pid(self, service):
        try:
            self.pid_file(service).unlink()
        except FileNotFoundError:
            pass

    def tracked_pid(self, service):
        pid = self.read_pid(service)
        if pid:
            return pid
        state = self.launch_state.get(service, {})
        saved = state.get("pid")
        if isinstance(saved, int):
            return saved
        if isinstance(saved, str) and saved.isdigit():
            return int(saved)
        return None

    def is_process_running(self, pid):
        if not pid:
            return False
        result = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            startupinfo=hidden_startupinfo(),
        )
        return str(pid) in result.stdout

    def url_available(self, url, timeout=STATUS_TIMEOUT):
        try:
            with urlopen(url, timeout=timeout) as response:
                return 200 <= response.status < 400
        except (URLError, OSError, ValueError):
            return False

    def is_port_open(self, port, host="127.0.0.1", timeout=STATUS_TIMEOUT):
        if not port:
            return False
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except OSError:
            return False

    def wait_for(self, check_fn, timeout=35, interval=0.6):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if check_fn():
                return True
            time.sleep(interval)
        return False

    def launch_process(self, service, args, cwd, extra_env=None, metadata=None):
        log_path = LOGS_DIR / f"{service}.log"
        env = os.environ.copy()
        env["FORCE_COLOR"] = "0"
        if extra_env:
            env.update(extra_env)
        executable = shutil.which(args[0]) or args[0]
        log_handle = open(log_path, "a", encoding="utf-8")
        process = subprocess.Popen(
            [executable, *args[1:]],
            cwd=str(cwd) if cwd else None,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            creationflags=WINDOW_FLAGS,
            startupinfo=hidden_startupinfo(),
            shell=False,
        )
        log_handle.close()
        self.write_pid(service, process.pid)
        self.launch_state[service] = {
            "pid": process.pid,
            "started_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "log": str(log_path),
        }
        if metadata:
            self.launch_state[service].update(metadata)
        write_json(STATE_FILE, self.launch_state)
        return process.pid

    def terminate_pid(self, pid):
        if not pid:
            return
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            startupinfo=hidden_startupinfo(),
        )

    def pids_by_port(self, port):
        result = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            startupinfo=hidden_startupinfo(),
        )
        matches = set()
        for line in result.stdout.splitlines():
            if f":{port} " not in line:
                continue
            parts = line.split()
            if len(parts) >= 5 and parts[-1].isdigit():
                matches.add(int(parts[-1]))
        return sorted(matches)

    def pids_by_path(self, path_fragment):
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                (
                    "$p = Get-CimInstance Win32_Process | "
                    f"Where-Object {{ $_.CommandLine -and $_.CommandLine -like '*{path_fragment}*' }} | "
                    "Select-Object -ExpandProperty ProcessId; "
                    "if ($p) { $p -join ',' }"
                ),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            startupinfo=hidden_startupinfo(),
        )
        output = result.stdout.strip()
        if not output:
            return []
        return [int(pid) for pid in output.split(",") if pid.strip().isdigit()]

    def pids_by_command_fragments(self, fragments):
        filters = " -or ".join(
            [f"($_.CommandLine -like '*{fragment}*')" for fragment in fragments]
        )
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                (
                    "$p = Get-CimInstance Win32_Process | "
                    f"Where-Object {{ $_.Name -eq 'node.exe' -and $_.CommandLine -and ({filters}) }} | "
                    "Select-Object -ExpandProperty ProcessId; "
                    "if ($p) { $p -join ',' }"
                ),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            startupinfo=hidden_startupinfo(),
        )
        output = result.stdout.strip()
        if not output:
            return []
        return [int(pid) for pid in output.split(",") if pid.strip().isdigit()]

    def service_is_running(self, service):
        if service == "server":
            return (
                self.url_available(SERVER_URL)
                and self.service_process_matches(service)
                and self.launch_state.get(service, {}).get("whatsapp_disabled") is True
            )
        if service == "client":
            return self.url_available(CLIENT_URL) and self.service_process_matches(service)
        if service == "stitch":
            return self.url_available(STITCH_STATUS_URL) and self.service_process_matches(service)
        return False

    def service_process_matches(self, service):
        """No confundir otro proyecto que responda en el mismo puerto con Modo Sabor."""
        fragments = {
            "server": SERVER_DIR,
            "client": CLIENT_DIR,
        }
        if service == "stitch":
            lock = read_json(PROMO_LOCK, {})
            try:
                pid = int(lock.get("pid"))
            except (TypeError, ValueError):
                return False
            return pid in self.pids_by_port(3867) and self.is_process_running(pid)
        fragment = str(fragments.get(service, ""))
        return bool(self.pids_by_path(fragment))

    def update_service_ui(self, service, status):
        palette = {
            "off": (COLORS["soft_dark"], COLORS["muted"], "Dormido", "Sin actividad"),
            "busy": ("#FFF6E7", COLORS["warning"], "Iniciando", "Esperando respuesta"),
            "on": (COLORS["soft_green"], COLORS["success"], "Activo", "Funcionando"),
            "error": (COLORS["soft_red"], COLORS["danger"], "Error", "Necesita atención"),
        }
        bg, fg, label, detail = palette[status]
        self.service_pills[service].config(text=label, bg=bg, fg=fg)
        port = SERVICES[service]["port"]
        suffix = f"Puerto {port}" if port else "Proceso oculto"
        self.service_cards[service].config(text=f"{detail} · {suffix}")

    def _collect_status_map(self):
        status_map = {}
        for service in SERVICES:
            status = "on" if self.service_is_running(service) else "off"
            status_map[service] = status
        return status_map

    def _apply_status_map(self, status_map, log_summary=True):
        for service, status in status_map.items():
            self.update_service_ui(service, status)

        online = sum(1 for status in status_map.values() if status == "on")
        self.status_summary["online"].config(text=f"{online}/{len(SERVICES)}")

        if online == len(SERVICES):
            self.hero_status.config(text="Sistema listo", fg=COLORS["success"])
            self.hero_detail.config(text="Puedes abrir el panel o cerrar esta ventana sin detener el sistema.")
            self.start_btn.config(text="Sistema activo", bg=COLORS["success"], activebackground="#0EB094")
        elif online == 0:
            self.hero_status.config(text="Todo apagado", fg=COLORS["danger"])
            self.hero_detail.config(text="Todavía no hay servicios en línea.")
            self.start_btn.config(text="Encender sistema", bg=COLORS["primary"], activebackground="#4970E9")
        else:
            self.hero_status.config(text="Parcialmente activo", fg=COLORS["warning"])
            self.hero_detail.config(text="Hay servicios activos, pero el sistema todavía no está completo.")
            self.start_btn.config(text="Completar arranque", bg=COLORS["primary"], activebackground="#4970E9")

        if log_summary:
            self.log(f"Estado revisado: {online}/{len(SERVICES)} servicios activos.")

    def refresh_status(self, log_summary=True):
        if self.refresh_in_progress:
            return
        self.refresh_in_progress = True

        def worker():
            try:
                status_map = self._collect_status_map()
                self.dispatch(self._apply_status_map, status_map, log_summary)
            finally:
                self.dispatch(setattr, self, "refresh_in_progress", False)

        threading.Thread(target=worker, daemon=True).start()

    def free_stale_port(self, port, service_label):
        """Si algo está escuchando en el puerto pero no responde como se espera
        (proceso zombie de una sesión anterior mal cerrada), lo libera antes de
        intentar levantar el servicio de nuevo. Esto evita que el lanzador crea
        que el sistema "ya está listo" cuando en realidad apunta a un proceso
        muerto, que es lo que produce la pantalla en blanco al abrir el panel."""
        if not self.is_port_open(port):
            return
        self.dispatch(
            self.log,
            f"Puerto {port} ocupado por un proceso que no responde ({service_label}). Liberando...",
        )
        pids = set(self.pids_by_port(port))
        for pid in pids:
            if self.is_process_running(pid):
                self.terminate_pid(pid)
        if pids:
            time.sleep(1.5)

    def ensure_server(self):
        server_has_single_whatsapp = self.launch_state.get("server", {}).get("whatsapp_disabled") is True
        if self.url_available(SERVER_URL) and self.service_process_matches("server") and server_has_single_whatsapp:
            self.dispatch(self.update_service_ui, "server", "on")
            self.dispatch(self.log, "La API ya estaba activa.")
            return True

        if self.url_available(SERVER_URL) and self.service_process_matches("server") and not server_has_single_whatsapp:
            self.dispatch(self.log, "La API estaba activa sin sesión única. Reiniciando para dejar WhatsApp en Stitch.")
            for pid in self.pids_by_path(str(SERVER_DIR)):
                self.terminate_pid(pid)
            time.sleep(1.5)

        if self.url_available(SERVER_URL):
            self.dispatch(self.log, "El puerto 3001 responde, pero pertenece a otro proceso. Se liberará antes de iniciar Modo Sabor.")

        self.free_stale_port(3001, "API")

        self.dispatch(self.log, "Levantando la API en segundo plano...")
        self.dispatch(self.update_service_ui, "server", "busy")
        self.launch_process(
            "server",
            ["node", str(SERVER_DIR / "index.js")],
            SERVER_DIR,
            extra_env={"WHATSAPP_DISABLE_STARTUP": "1"},
            metadata={"whatsapp_disabled": True},
        )

        if self.wait_for(lambda: self.url_available(SERVER_URL), timeout=30):
            self.dispatch(self.update_service_ui, "server", "on")
            return True

        self.dispatch(self.update_service_ui, "server", "error")
        self.dispatch(
            self.log,
            "La API no respondió en el puerto 3001. Revisá .launcher/logs/server.log para más detalle.",
        )
        return False

    def ensure_stitch(self):
        if self.url_available(STITCH_STATUS_URL) and self.service_process_matches("stitch"):
            stitch_pid = read_json(PROMO_LOCK, {}).get("pid")
            if stitch_pid:
                self.write_pid("stitch", int(stitch_pid))
                self.launch_state["stitch"] = {
                    **self.launch_state.get("stitch", {}),
                    "pid": int(stitch_pid),
                    "adopted": True,
                }
                write_json(STATE_FILE, self.launch_state)
            self.dispatch(self.update_service_ui, "stitch", "on")
            self.dispatch(self.log, "El panel Stitch ya estaba activo.")
            return True

        if self.url_available(STITCH_STATUS_URL):
            self.dispatch(self.log, "El puerto 3867 responde, pero pertenece a otro proceso. Se liberará antes de iniciar Stitch.")

        self.free_stale_port(3867, "Masivos Stitch")
        self.dispatch(self.log, "Iniciando Masivos Stitch en segundo plano...")
        self.dispatch(self.update_service_ui, "stitch", "busy")
        self.launch_process("stitch", node_command(PROMO_SERVER), PROMO_ROOT)

        if self.wait_for(lambda: self.url_available(STITCH_STATUS_URL), timeout=45):
            self.dispatch(self.update_service_ui, "stitch", "on")
            return True

        self.dispatch(self.update_service_ui, "stitch", "error")
        self.dispatch(
            self.log,
            "El panel Stitch no respondió en el puerto 3867. Revisá .launcher/logs/stitch.log para más detalle.",
        )
        return False

    def ensure_client(self):
        if self.url_available(CLIENT_URL) and self.service_process_matches("client"):
            self.dispatch(self.update_service_ui, "client", "on")
            self.dispatch(self.log, "El panel web ya estaba levantado.")
            return True

        if self.url_available(CLIENT_URL):
            self.dispatch(self.log, "El puerto 5173 responde, pero pertenece a otro proyecto. Se liberará antes de iniciar Modo Sabor.")

        self.free_stale_port(5173, "Panel Web")

        self.dispatch(self.log, "Iniciando Vite en segundo plano...")
        self.dispatch(self.update_service_ui, "client", "busy")
        self.launch_process(
            "client",
            node_command(CLIENT_VITE, "--host", "0.0.0.0", "--port", "5173"),
            CLIENT_DIR,
        )

        if self.wait_for(lambda: self.url_available(CLIENT_URL), timeout=45):
            self.dispatch(self.update_service_ui, "client", "on")
            return True

        self.dispatch(self.update_service_ui, "client", "error")
        self.dispatch(
            self.log,
            "La interfaz web no respondió en el puerto 5173. Revisá .launcher/logs/client.log para más detalle.",
        )
        return False

    def start_orchestration(self):
        if self.busy:
            return
        self.set_busy(True, "Sincronizando arranque...")
        threading.Thread(target=self._launch_sequence, daemon=True).start()

    def _launch_sequence(self):
        try:
            steps = [
                self.ensure_server,
                self.ensure_client,
                self.ensure_stitch,
            ]
            for step in steps:
                if not step():
                    return
            self.dispatch(self.log, "Todo listo. Abriendo el panel principal...")
            webbrowser.open(STITCH_URL)
        except Exception as exc:
            self.dispatch(self.log, f"Fallo crítico durante el arranque: {exc}")
            self.dispatch(messagebox.showerror, "Modo Sabor", f"No pude completar el arranque.\n\n{exc}")
        finally:
            self.dispatch(self.set_busy, False)
            self.dispatch(self.refresh_status, False)

    def safe_shutdown(self):
        if self.busy:
            return
        self.set_busy(True, "Deteniendo servicios...")
        self.log("Solicitud de apagado recibida.")
        threading.Thread(target=self._shutdown_sequence, daemon=True).start()

    def _shutdown_sequence(self):
        try:
            self.dispatch(self.log, "Iniciando apagado seguro...")

            victims = []
            for service in ("stitch", "client", "server"):
                pid = self.tracked_pid(service)
                if pid:
                    victims.append(pid)
                self.clear_pid(service)
                self.launch_state.pop(service, None)

            for port in (5173, 3001, 3867):
                victims.extend(self.pids_by_port(port))

            victims.extend(self.pids_by_command_fragments([
                str(CLIENT_VITE),
                str(SERVER_DIR / "index.js"),
                str(PROMO_SERVER),
            ]))

            seen = set()
            for pid in victims:
                if pid in seen:
                    continue
                seen.add(pid)
                if self.is_process_running(pid):
                    self.terminate_pid(pid)

            write_json(STATE_FILE, self.launch_state)
            time.sleep(2)
            self.dispatch(self.refresh_status, False)
            self.dispatch(self.log, "Sistema detenido. Podés volver a encenderlo cuando quieras.")
            self.dispatch(messagebox.showinfo, "Modo Sabor", "El sistema se apagó correctamente.")
        except Exception as exc:
            self.dispatch(self.log, f"No pude completar el apagado seguro: {exc}")
            self.dispatch(messagebox.showerror, "Modo Sabor", f"No pude completar el apagado.\n\n{exc}")
        finally:
            self.dispatch(self.set_busy, False)


if __name__ == "__main__":
    app_root = tk.Tk()
    app = ModoSaborLauncher(app_root)
    app_root.mainloop()
