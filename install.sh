#!/usr/bin/env bash
# Cockpit Advanced Proxy Manager — Installer
# Default UI language: English (Russian optional)
set -e

if [ "$(id -u)" -ne 0 ]; then
	echo "❌ This script must be run as root (sudo ./install.sh)"
	exit 1
fi

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "📦 Installing from: $REPO_DIR"

# 1. Create directories
mkdir -p /usr/local/libexec
mkdir -p /etc/cockpit/proxy-manager
mkdir -p /var/run/cockpit-proxy-manager
mkdir -p ~/.local/share/cockpit/proxy-manager/po

# 2. Copy backend & monitor
cp "$REPO_DIR/backend/cockpit-proxy-manager" /usr/local/libexec/
cp "$REPO_DIR/monitor/cockpit-proxy-monitor" /usr/local/libexec/

# 3. Copy frontend
cp "$REPO_DIR/frontend/manifest.json" ~/.local/share/cockpit/proxy-manager/
cp "$REPO_DIR/frontend/proxy.html" ~/.local/share/cockpit/proxy-manager/
cp "$REPO_DIR/frontend/proxy.js" ~/.local/share/cockpit/proxy-manager/
cp "$REPO_DIR/frontend/po/en.json" ~/.local/share/cockpit/proxy-manager/po/
cp "$REPO_DIR/frontend/po/ru.json" ~/.local/share/cockpit/proxy-manager/po/ 2>/dev/null || true

# 4. Set permissions
chmod +x /usr/local/libexec/cockpit-proxy-manager
chmod +x /usr/local/libexec/cockpit-proxy-monitor
chmod 600 /etc/cockpit/proxy-manager/config.json 2>/dev/null || true

# 5. Sudoers configuration
cat > /etc/sudoers.d/cockpit-proxy-manager <<'EOF'
%wheel ALL=(ALL) NOPASSWD: /usr/local/libexec/cockpit-proxy-manager
%wheel ALL=(ALL) NOPASSWD: /usr/local/libexec/cockpit-proxy-monitor
EOF
chmod 440 /etc/sudoers.d/cockpit-proxy-manager

# 6. Create default config if not exists
if [ ! -f /etc/cockpit/proxy-manager/config.json ]; then
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
	chmod 600 /etc/cockpit/proxy-manager/config.json
fi

# 7. Systemd service for monitoring
cat > /etc/systemd/system/cockpit-proxy-monitor.service <<'EOF'
[Unit]
Description=Cockpit Proxy Health Monitor
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/libexec/cockpit-proxy-monitor
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now cockpit-proxy-monitor

# 8. Restart Cockpit
systemctl restart cockpit 2>/dev/null || systemctl restart cockpit.socket 2>/dev/null || true

echo "✅ Installation completed."
echo "🌐 Open Cockpit: https://$(hostname -I | awk '{print $1}'):9090"
echo "🔍 Module location: Tools → Advanced Proxy Manager"
echo "🌍 UI Language: English (default), Russian (if cockpit.language=ru)"
