#!/usr/bin/env bash
# Cockpit Proxy Manager — Installer (System-wide)
# Default UI: English, Russian optional
set -euo pipefail

log_info() { echo "📦 [INFO] $*"; }
log_warn() { echo "⚠️  [WARN] $*" >&2; }
log_error() { echo "❌ [ERROR] $*" >&2; }

if [ "$(id -u)" -ne 0 ]; then
	log_error "This script must be run as root (sudo ./install.sh)"
	exit 1
fi

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
log_info "Installing from: $REPO_DIR"

# Проверка зависимостей
for cmd in cockpit-bridge systemctl curl; do
	if ! command -v "$cmd" &>/dev/null; then
		log_error "Required command '$cmd' not found. Please install cockpit and dependencies first."
		exit 2
	fi
done

# 1. Создание системных директорий
log_info "Creating system directories..."
mkdir -p /usr/share/cockpit/proxy-manager/po || { log_error "Failed to create /usr/share/cockpit/proxy-manager"; exit 3; }
mkdir -p /etc/cockpit/proxy-manager || { log_error "Failed to create /etc/cockpit/proxy-manager"; exit 3; }
mkdir -p /var/run/cockpit-proxy-manager || { log_error "Failed to create /var/run/cockpit-proxy-manager"; exit 3; }
mkdir -p /usr/local/libexec || { log_error "Failed to create /usr/local/libexec"; exit 3; }

# 2. Копирование бэкенда и монитора
log_info "Copying backend components..."
cp "$REPO_DIR/backend/cockpit-proxy-manager" /usr/local/libexec/ || { log_error "Failed to copy backend"; exit 4; }
cp "$REPO_DIR/monitor/cockpit-proxy-monitor" /usr/local/libexec/ || { log_error "Failed to copy monitor"; exit 4; }
chmod +x /usr/local/libexec/cockpit-proxy-manager /usr/local/libexec/cockpit-proxy-monitor || log_warn "Could not set execute permissions on binaries"

# 3. Копирование фронтенда
log_info "Copying frontend files..."
cp "$REPO_DIR/frontend/manifest.json" /usr/share/cockpit/proxy-manager/ || { log_error "Failed to copy manifest.json"; exit 5; }
cp "$REPO_DIR/frontend/proxy.html" /usr/share/cockpit/proxy-manager/ || { log_error "Failed to copy proxy.html"; exit 5; }
cp "$REPO_DIR/frontend/proxy.js" /usr/share/cockpit/proxy-manager/ || { log_error "Failed to copy proxy.js"; exit 5; }
cp "$REPO_DIR/frontend/po/"*.json /usr/share/cockpit/proxy-manager/po/ 2>/dev/null || log_warn "Translation files not found, continuing with English only"

# 4. Права доступа (Cockpit-ws читает как непривилегированный пользователь)
log_info "Setting permissions..."
chmod -R a+rX /usr/share/cockpit/proxy-manager/ || log_warn "Could not set read permissions on frontend"
chmod 755 /usr/share/cockpit/proxy-manager /usr/share/cockpit/proxy-manager/po 2>/dev/null || true

# 5. Sudoers (без пароля для модулей)
log_info "Configuring sudoers..."
cat > /etc/sudoers.d/cockpit-proxy-manager <<'EOF'
%wheel ALL=(ALL) NOPASSWD: /usr/local/libexec/cockpit-proxy-manager
%wheel ALL=(ALL) NOPASSWD: /usr/local/libexec/cockpit-proxy-monitor
%sudo ALL=(ALL) NOPASSWD: /usr/local/libexec/cockpit-proxy-manager
%sudo ALL=(ALL) NOPASSWD: /usr/local/libexec/cockpit-proxy-monitor
EOF
chmod 440 /etc/sudoers.d/cockpit-proxy-manager || log_warn "Could not set sudoers permissions"

# 6. Дефолтный конфиг (если не существует)
if [ ! -f /etc/cockpit/proxy-manager/config.json ]; then
	log_info "Creating default configuration..."
	cat > /etc/cockpit/proxy-manager/config.json <<'EOF'
{
	"enabled": false,
	"type": "http",
	"host": "localhost",
	"port": 57800,
	"username": "",
	"password": "",
	"no_proxy": "127.0.0.1,localhost,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7,fe80::/10",
	"check_urls": [
		"http://connect.rom.miui.com/generate_204",
		"http://connectivitycheck.platform.hicloud.com/generate_204",
		"http://www.qualcomm.cn/generate_204",
		"http://captcha.qq.com/generate_204"
	],
	"check_timeout": 5,
	"monitor_enabled": false,
	"monitor_interval": 60,
	"targets": {
		"apt": true,
		"packagekit": true,
		"curl": true,
		"system": true
	}
}
EOF
	chmod 600 /etc/cockpit/proxy-manager/config.json || log_warn "Could not secure config file"
fi

# 7. Systemd сервис для мониторинга
log_info "Installing systemd service..."
cat > /etc/systemd/system/cockpit-proxy-monitor.service <<'EOF'
[Unit]
Description=Cockpit Proxy Health Monitor
After=network.target cockpit.service

[Service]
Type=simple
ExecStart=/usr/local/libexec/cockpit-proxy-monitor
Restart=on-failure
RestartSec=10
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload || log_warn "daemon-reload failed"
systemctl enable --now cockpit-proxy-monitor 2>/dev/null || log_warn "Could not start monitor service"

# 8. Перезапуск Cockpit
log_info "Restarting Cockpit services..."
systemctl restart cockpit.socket 2>/dev/null || true
systemctl restart cockpit 2>/dev/null || true

# 9. Проверка установки
log_info "Verifying installation..."
if cockpit-bridge --packages 2>/dev/null | grep -q proxy-manager; then
	log_info "✅ Module registered successfully"
else
	log_warn "Module may not be visible yet. Try: Ctrl+Shift+R in browser, then check Cockpit → Tools"
fi

# 10. Финальные инструкции
echo ""
echo "✅ Installation completed."
echo "🌐 Open Cockpit: https://$(hostname -I | awk '{print $1}' | head -1):9090"
echo "🔍 Module: Tools → Proxy Manager"
echo "🌍 Language: English (default) or Russian (if cockpit.language=ru)"
echo ""
echo "🔧 Troubleshooting:"
echo "   • If module not visible: Ctrl+Shift+R in browser"
echo "   • Check logs: journalctl -u cockpit -f"
echo "   • Verify module: cockpit-bridge --packages | grep proxy-manager"
