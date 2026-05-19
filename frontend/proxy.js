/* global cockpit */
(function(){
	"use strict";

	const $ = id => document.getElementById(id);
	const $$ = (sel, ctx=document) => ctx.querySelectorAll(sel);

	let channel = null;
	let checkUrls = [];
	let translations = {};
	let config = null;
	let isDragging = false;
	let startY, startHeight, startPaneHeight;

	// Safe translation loader
	function loadTranslations(lang) {
		const path = `po/${lang}.json`;
		return new Promise((resolve) => {
			cockpit.file(path).read()
				.done((content) => {
					try { translations = JSON.parse(content || "{}"); } catch(e) {}
					applyTranslations();
					resolve(true);
				})
				.fail(() => {
					if (lang !== "en") {
						cockpit.file("po/en.json").read()
							.done((content) => {
								try { translations = JSON.parse(content || "{}"); } catch(e) {}
								applyTranslations();
							})
							.always(() => resolve(false));
					} else {
						resolve(false);
					}
				});
		});
	}

	function t(key, ...args) {
		const str = (translations && translations[key]) ? translations[key] : key;
		return args.length ? str.replace(/%s/g, () => args.shift()) : str;
	}

	function applyTranslations() {
		if (!translations) return;
		$$("[data-i18n]").forEach(el => {
			const key = el.getAttribute("data-i18n");
			if (key && el && translations[key]) {
				el.textContent = translations[key];
			}
		});
		$$("[data-i18n-title]").forEach(el => {
			const key = el.getAttribute("data-i18n-title");
			if (key && el && translations[key]) {
				el.setAttribute("title", translations[key]);
			}
		});
		$$("[data-i18n-placeholder]").forEach(el => {
			const key = el.getAttribute("data-i18n-placeholder");
			if (key && el && translations[key]) {
				el.setAttribute("placeholder", translations[key]);
			}
		});
	}

	function addLog(msg, type="info") {
		const log = $("logArea");
		if (!log) return;
		const time = new Date().toLocaleTimeString();
		const entry = document.createElement("div");
		entry.className = `logEntry ${type}`;
		entry.textContent = `[${time}] ${msg}`;
		log.appendChild(entry);
		log.scrollTop = log.scrollHeight;
	}

	function showStatus(msg, type="info") {
		const bar = $("statusBar");
		if (!bar) return;
		bar.style.display = "block";
		bar.className = `pf-v5-c-alert pf-m-inline pf-m-${type}`;
		const text = $("statusText");
		if (text) text.textContent = msg;
		addLog(msg, type);
		if (type === "success") {
			setTimeout(() => { bar.style.display = "none"; }, 5000);
		}
	}

	function renderUrls() {
		const list = $("urlList");
		if (!list) return;
		list.innerHTML = "";
		(checkUrls || []).forEach((url, i) => {
			const item = document.createElement("div");
			item.className = "urlItem";
			item.innerHTML = `
				<span>${url}</span>
				<button type="button" class="pf-v5-c-button pf-m-plain pf-m-sm" data-idx="${i}" aria-label="Remove">✕</button>
			`;
			item.querySelector("button").onclick = () => {
				checkUrls.splice(i, 1);
				renderUrls();
			};
			list.appendChild(item);
		});
	}

	function updateAppStatus(app, status, hint) {
		const badge = $(`status-${app}`);
		if (!badge) return;
		const map = {
			ok: { cls: "pf-m-green", txt: "● OK" },
			failed: { cls: "pf-m-red", txt: "⚠ Failed" },
			disabled: { cls: "pf-m-grey", txt: "○ Disabled" },
			missing: { cls: "pf-m-grey", txt: "○ Not installed" }
		};
		const s = map[status] || map.disabled;
		badge.className = `pf-v5-c-label statusBadge ${s.cls}`;
		badge.textContent = s.txt;
		if (hint) badge.setAttribute("title", hint);
	}

	function getTargetFields(prefix) {
		return {
			enabled: $(`t${prefix}`)?.checked || false,
			host: $(`${prefix}Host`)?.value?.trim() || "",
			port: parseInt($(`${prefix}Port`)?.value) || 0,
			username: $(`${prefix}User`)?.value?.trim() || "",
			password: $(`${prefix}Pass`)?.value || ""
		};
	}

	function setTargetFields(prefix, data) {
		if (!data) return;
		const el = (id, val) => { const e = $(id); if (e) e.value = val ?? ""; };
		const chk = (id, val) => { const e = $(id); if (e) e.checked = !!val; };
		chk(`t${prefix}`, data.enabled);
		el(`${prefix}Host`, data.host);
		el(`${prefix}Port`, data.port || (data.type === "socks5" ? 1080 : 3128));
		el(`${prefix}User`, data.username);
		// Password not set from config for security
	}

	function populateUI(cfg) {
		if (!cfg) return;
		config = cfg;

		// Global settings
		const g = $("pType"); if (g) g.value = cfg.type || "http";
		const en = $("pEnabled"); if (en) en.checked = !!cfg.enabled;
		const h = $("pHost"); if (h) h.value = cfg.host || "";
		const p = $("pPort"); if (p) p.value = cfg.port || 3128;
		const u = $("pUser"); if (u) u.value = cfg.username || "";
		// Password field left empty for security
		const np = $("pNoProxy");
		if (np) np.value = cfg.no_proxy || "127.0.0.1,localhost,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7,fe80::/10";
		checkUrls = cfg.check_urls || [
			"http://connect.rom.miui.com/generate_204",
			"http://connectivitycheck.platform.hicloud.com/generate_204",
			"http://www.qualcomm.cn/generate_204",
			"http://captcha.qq.com/generate_204"
		];
		renderUrls();

		// Monitoring
		const me = $("mEnabled"); if (me) me.checked = !!cfg.monitor_enabled;
		const mi = $("mInterval"); if (mi) mi.value = cfg.monitor_interval || 60;

		// Per-app settings
		const pkgs = cfg.packages || {};
		const targets = cfg.targets || {};
		const appConfigs = cfg.app_configs || {};

		// APT
		setTargetFields("Apt", appConfigs.apt || { enabled: !!targets.apt, host: cfg.host, port: cfg.port });
		updateAppStatus("apt", (cfg.enabled && targets.apt) ? "ok" : "disabled");

		// PackageKit
		if (!pkgs.packagekit) {
			["tPkg","pkgHost","pkgPort","pkgUser","pkgPass","btnApplyPkg","btnDisablePkg"].forEach(id => {
				const el = $(id); if (el) { el.disabled = true; el.closest?.(".appCard")?.classList.add("disabled-overlay"); }
			});
			updateAppStatus("packagekit", "missing", t("pkg_install_cmd", "packagekit"));
			addLog(`PackageKit not installed. ${t("pkg_install_cmd", "packagekit")}`, "warning");
		} else {
			setTargetFields("Pkg", appConfigs.packagekit || { enabled: !!targets.packagekit, host: cfg.host, port: cfg.port });
			updateAppStatus("packagekit", (cfg.enabled && targets.packagekit) ? "ok" : "disabled");
		}

		// curl
		if (!pkgs.curl) {
			["tCurl","curlHost","curlPort","curlUser","curlPass","btnApplyCurl","btnDisableCurl"].forEach(id => {
				const el = $(id); if (el) { el.disabled = true; el.closest?.(".appCard")?.classList.add("disabled-overlay"); }
			});
			updateAppStatus("curl", "missing", t("pkg_install_cmd", "curl"));
			addLog(`curl not installed. ${t("pkg_install_cmd", "curl")}`, "warning");
		} else {
			setTargetFields("Curl", appConfigs.curl || { enabled: !!targets.curl, host: cfg.host, port: cfg.port });
			updateAppStatus("curl", (cfg.enabled && targets.curl) ? "ok" : "disabled");
		}

		// System
		setTargetFields("Sys", appConfigs.system || { enabled: !!targets.system, host: cfg.host, port: cfg.port });
		updateAppStatus("system", (cfg.enabled && targets.system) ? "ok" : "disabled");

		addLog("Configuration loaded.");
	}

	function collectGlobal() {
		return {
			type: $("pType")?.value || "http",
			enabled: $("pEnabled")?.checked || false,
			host: $("pHost")?.value?.trim() || "",
			port: parseInt($("pPort")?.value) || 3128,
			username: $("pUser")?.value?.trim() || "",
			password: $("pPass")?.value || "",
			no_proxy: $("pNoProxy")?.value || "",
			check_urls: checkUrls,
			monitor_enabled: $("mEnabled")?.checked || false,
			monitor_interval: parseInt($("mInterval")?.value) || 60
		};
	}

	function collectAppConfigs() {
		return {
			apt: getTargetFields("Apt"),
			packagekit: getTargetFields("Pkg"),
			curl: getTargetFields("Curl"),
			system: getTargetFields("Sys")
		};
	}

	function sendCmd(cmd, payload, onSuccess, onError) {
		addLog(`→ ${cmd}`, "info");
		const ch = cockpit.channel({ payload: "proxy-manager", command: cmd, ...payload });
		ch.addEventListener("message", (ev, data) => {
			try {
				const res = JSON.parse(data);
				if (res.success) {
					addLog(`← ${cmd}: ${res.message}`, "success");
					if (onSuccess) onSuccess(res);
				} else {
					addLog(`← ${cmd} failed: ${res.message}`, "error");
					if (onError) onError(res);
				}
			} catch (e) {
				addLog(`Parse error: ${e}`, "error");
			}
		});
		ch.addEventListener("close", (ev, opts) => {
			if (opts.problem) {
				addLog(`Channel closed: ${opts.problem}`, "error");
				if (onError) onError({ message: opts.problem });
			}
		});
	}

	// Test connection
	$("btnTest")?.addEventListener("click", () => {
		const cfg = { ...collectGlobal(), app_configs: collectAppConfigs() };
		sendCmd("test-proxy", { config: cfg },
			(res) => showStatus(t("test_success", res.message), "success"),
			(res) => showStatus(t("test_failed", res.message), "danger")
		);
	});

	// Apply to specific target
	function applyToTarget(target) {
		const globalCfg = collectGlobal();
		const appCfgs = collectAppConfigs();
		// Override global with app-specific if set
		const app = appCfgs[target];
		const cfg = {
			...globalCfg,
			host: app?.host || globalCfg.host,
			port: app?.port || globalCfg.port,
			username: app?.username || globalCfg.username,
			password: app?.password || globalCfg.password,
			targets: { [target]: true }
		};
		sendCmd("apply-config", { config: cfg, target },
			(res) => {
				showStatus(t("apply_success", target), "success");
				updateAppStatus(target, "ok");
				// Refresh config
				cockpit.channel({ payload: "proxy-manager", command: "get-config" })
					.addEventListener("message", (ev, data) => populateUI(JSON.parse(data)));
			},
			(res) => showStatus(t("apply_failed", target, res.message), "danger")
		);
	}

	["Apt","Pkg","Curl","Sys"].forEach(prefix => {
		const btn = $(`btnApply${prefix}`);
		if (btn) btn.onclick = () => applyToTarget(prefix.toLowerCase());
	});

	$("btnApplyAll")?.addEventListener("click", () => {
		const cfg = { ...collectGlobal(), app_configs: collectAppConfigs(), targets: {
			apt: $("tApt")?.checked,
			packagekit: $("tPkg")?.checked && !$("tPkg")?.disabled,
			curl: $("tCurl")?.checked && !$("tCurl")?.disabled,
			system: $("tSys")?.checked
		}};
		sendCmd("apply-config", { config: cfg },
			(res) => {
				showStatus(t("apply_success", "selected targets"), "success");
				["apt","packagekit","curl","system"].forEach(t => {
					if (cfg.targets?.[t]) updateAppStatus(t, "ok");
				});
			},
			(res) => showStatus(res.message, "danger")
		);
	});

	// Disable target
	function disableTarget(target) {
		sendCmd("disable-proxy", { target },
			(res) => {
				showStatus(t("disable_success", target), "success");
				updateAppStatus(target, "disabled");
			},
			(res) => showStatus(res.message, "danger")
		);
	}

	["Apt","Pkg","Curl","Sys"].forEach(prefix => {
		const btn = $(`btnDisable${prefix}`);
		if (btn) btn.onclick = () => disableTarget(prefix.toLowerCase());
	});

	$("btnDisableAll")?.addEventListener("click", () => {
		sendCmd("disable-proxy", {},
			(res) => {
				showStatus("All proxies disabled", "success");
				["apt","packagekit","curl","system"].forEach(t => updateAppStatus(t, "disabled"));
			},
			(res) => showStatus(res.message, "danger")
		);
	});

	// Resync
	$("btnResync")?.addEventListener("click", () => {
		sendCmd("resync-config", {},
			(res) => {
				populateUI(res);
				showStatus(res.drift_detected ? t("drift_detected") : t("resync_no_change"),
					res.drift_detected ? "warning" : "success");
			},
			(res) => showStatus(res.message, "danger")
		);
	});

	// Add URL
	$("addUrlBtn")?.addEventListener("click", () => {
		const val = $("newUrl")?.value?.trim();
		if (val && !checkUrls.includes(val)) {
			checkUrls.push(val);
			renderUrls();
			if ($("newUrl")) $("newUrl").value = "";
		}
	});

	// Split-pane draggable divider
	function initSplitPane() {
		const container = $("mainContainer");
		const settings = $("settingsPane");
		const log = $("logPane");
		const divider = $("divider");
		if (!container || !settings || !log || !divider) return;

		divider.addEventListener("mousedown", (e) => {
			isDragging = true;
			startY = e.clientY;
			startPaneHeight = container.offsetHeight;
			startHeight = settings.offsetHeight;
			document.body.style.cursor = "row-resize";
			document.body.style.userSelect = "none";
			e.preventDefault();
		});

		document.addEventListener("mousemove", (e) => {
			if (!isDragging) return;
			const dy = e.clientY - startY;
			const newSettingsHeight = Math.max(200, Math.min(startPaneHeight - 100, startHeight + dy));
			const newLogHeight = startPaneHeight - newSettingsHeight - 8; // 8px divider
			settings.style.flex = `0 0 ${newSettingsHeight}px`;
			log.style.flex = `0 0 ${newLogHeight}px`;
		});

		document.addEventListener("mouseup", () => {
			if (isDragging) {
				isDragging = false;
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			}
		});

		// Initial 75/25 split
		container.addEventListener("DOMContentLoaded", () => {
			settings.style.flex = "0 0 75%";
			log.style.flex = "0 0 25%";
		});
	}

	// Init
	cockpit.transport.wait(() => {
		const cockpitLang = (cockpit.language || "en").split("-")[0];
		const supported = ["en", "ru"];
		const lang = supported.includes(cockpitLang) ? cockpitLang : "en";
		loadTranslations(lang).then(() => {
			channel = cockpit.channel({ payload: "proxy-manager", command: "get-config" });
			channel.addEventListener("message", (ev, data) => {
				try { populateUI(JSON.parse(data)); } catch(e) { addLog(`Config parse: ${e}`, "error"); }
			});
			channel.addEventListener("close", (ev, opts) => {
				if (opts.problem) addLog(`Backend: ${opts.problem}`, "error");
			});
		});
		initSplitPane();
		addLog("Proxy Manager initialized.", "info");
	});
})();
