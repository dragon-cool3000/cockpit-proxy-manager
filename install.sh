#!/usr/bin/env bash
# Cockpit Proxy Manager — Installer (System-wide)
set -euo pipefail

log_info() { echo "📦 [INFO] $*"; }
log_warn() { echo "⚠️  [WARN] $*" >&2; }
log_error() { echo "❌ [ERROR] $*" >&2; }

if [ "$(id -u)" -ne 0 ]; then
	log_error "Run as root: sudo ./install.sh"
	exit 1
fi

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
log_info "Installing from: $REPO_DIR"

# Dependencies
for cmd in cockpit-bridge systemctl curl; do
	command -v "$cmd" &>/dev/null || { log_error "Missing: $cmd"; exit 2; }
done

# Directories
mkdir -p /usr/share/cockpit/proxy-manager/po /etc/cockpit/proxy-manager /var/run/cockpit-proxy-manager /usr/local/libexec || exit 3

# Copy files
cp "$REPO_DIR/backend/cockpit-proxy-manager" /usr/local/libexec/ || exit 4
cp "$REPO_DIR/monitor/cockpit-proxy-monitor" /usr/local/libexec/ || exit 4
chmod +x /usr/local/libexec/cockpit-proxy-manager /usr/local/libexec/cockpit-proxy-monitor

cp "$REPO_DIR/frontend/manifest.json" /usr/share/cockpit/proxy-manager/ || exit 5
cp "$REPO_DIR/frontend/proxy.html" /usr/share/cockpit/proxy-manager/ || exit 5
cp "$REPO_DIR/frontend/proxy.js" /usr/share/cockpit/proxy-manager/ || exit 5
cp "$REPO_DIR/frontend/proxy.css" /usr/share/cockpit/proxy-manager/ || exit 5
cp "$REPO_DIR/frontend/po/"*.json /usr/share/cockpit/proxy-manager/po/ 2>/dev/null || log_warn "Translations missing"

# Permissions
chmod -R a+rX /usr/share/cockpit/proxy-manager/
chmod 755 /usr/share/cockpit/proxy-manager /usr/share/cockpit/proxy-manager/po 2>/dev/null || true

# Sudoers
cat > /etc/sudoers.d/cockpit-proxy-manager <<'EOF'
%wheel ALL=(ALL) NOPASSWD: /usr/local/libexec/cockpit-proxy-manager
%wheel ALL=(ALL) NOPASSWD: /usr/local/libexec/cockpit-proxy-monitor
%sudo ALL=(ALL) NOPASSWD: /usr/local/libexec/cockpit-proxy-manager
%sudo ALL=(ALL) NOPASSWD: /usr/local/libexec/cockpit-proxy-monitor
EOF
chmod 440 /etc/sudoers.d/cockpit-proxy-manager 2>/dev/null || log_warn "sudoers failed"

# Default config
[ -f /etc/cockpit/proxy-manager/config.json ] || cat > /etc/cockpit/proxy-manager/config.json <<'EOF'
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
	"targets": {"apt": true, "packagekit": true, "curl": true, "system": true},
	"app_configs": {}
}
EOF
chmod 600 /etc/cockpit/proxy-manager/config.json

# Systemd monitor
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

systemctl daemon-reload 2>/dev/null || true
systemctl enable --now cockpit-proxy-monitor 2>/dev/null || log_warn "Monitor service failed"

# Restart Cockpit
systemctl restart cockpit.socket 2>/dev/null || true
systemctl restart cockpit 2>/dev/null || true

# Verify
if cockpit-bridge --packages 2>/dev/null | grep -q proxy-manager; then
	log_info "✅ Module registered"
else
	log_warn "Module may need Ctrl+Shift+R in browser"
fi

echo ""
echo "✅ Installation complete."
echo "🌐 Open: https://$(hostname -I | awk '{print $1}' | head -1):9090"
echo "🔍 Tools → Proxy Manager"
echo "🌍 Language: English (default) or Russian"
